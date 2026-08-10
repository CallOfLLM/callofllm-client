"use client";

import { useEffect, useRef } from "react";
import {
  MAP_BOUNDS,
  PROTOCOL_VERSION,
  TEAM_FLAG,
  packetDataToBuffer,
  type PacketData,
  type Soldier,
} from "../../../(lib)/_packet";
import { summarizeForLog, type GameLogger } from "../lib/gameLog";
import type { EnemySquad } from "../lib/stageSetup";
import type { SendCommand, StageStatus } from "./useGameSession";

const COMMAND_INTERVAL_MS = 10_000;

const ALLOWED_PACKET_TYPES = new Set<PacketData["packetType"]>([
  "MOVE_SQUAD",
  "ATTACK_SQUAD",
  "STOP_SQUAD",
  "FOCUS_ATTACK",
  "MOVE_ENGAGE_ON_SIGHT",
  "MOVE_FIRE_IN_RANGE",
]);

export interface UseEnemyCommanderOptions {
  enabled: boolean;
  serverProtocolVersion?: number;
  soldiers: readonly Soldier[];
  enemySquads: readonly EnemySquad[];
  stageStatus?: StageStatus;
  sendCommand: SendCommand;
  pushLog: GameLogger;
}

/** 적 AI가 실제 적군 스쿼드만 조종하는 허용된 전술 명령인지 확인한다. */
function isEnemyCommand(packetData: unknown, enemySquadIDs: ReadonlySet<number>): packetData is PacketData {
  if (typeof packetData !== "object" || packetData === null || Array.isArray(packetData)) return false;

  const command = packetData as Record<string, unknown>;
  if (typeof command.packetType !== "string" || !ALLOWED_PACKET_TYPES.has(command.packetType as PacketData["packetType"])) {
    return false;
  }

  if (command.packetType === "FOCUS_ATTACK") {
    return (
      command.ownTeamFlag === TEAM_FLAG.ENEMY &&
      command.targetTeamFlag === TEAM_FLAG.ALLY &&
      typeof command.ownSquadID === "number" &&
      enemySquadIDs.has(command.ownSquadID)
    );
  }

  return command.teamFlag === TEAM_FLAG.ENEMY && typeof command.squadID === "number" && enemySquadIDs.has(command.squadID);
}

/** 전투 중 최신 전장 상태를 적 AI에 즉시 한 번, 이후 10초마다 전달한다. */
export function useEnemyCommander({
  enabled,
  serverProtocolVersion,
  soldiers,
  enemySquads,
  stageStatus,
  sendCommand,
  pushLog,
}: UseEnemyCommanderOptions): void {
  const latestGameStateRef = useRef({ soldiers, enemySquads, stageStatus });

  useEffect(() => {
    latestGameStateRef.current = { soldiers, enemySquads, stageStatus };
  }, [enemySquads, soldiers, stageStatus]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let requestPending = false;
    let activeController: AbortController | undefined;

    const requestCommand = async () => {
      if (requestPending || cancelled) return;

      const {
        soldiers: currentSoldiers,
        enemySquads: currentEnemySquads,
        stageStatus: currentStageStatus,
      } = latestGameStateRef.current;
      if (currentSoldiers.length === 0 || currentEnemySquads.length === 0) return;

      requestPending = true;
      const controller = new AbortController();
      activeController = controller;

      try {
        const response = await fetch("/api/openai/command/enemy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            gameState: {
              protocolVersion: serverProtocolVersion ?? PROTOCOL_VERSION,
              mapBounds: MAP_BOUNDS,
              stage: currentStageStatus ?? null,
              enemySquads: currentEnemySquads,
              soldiers: currentSoldiers,
            },
          }),
        });
        const value: unknown = await response.json();
        if (cancelled) return;
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
          throw new Error("적 AI API 응답이 JSON 객체가 아닙니다.");
        }

        const data = value as Record<string, unknown>;
        if (!response.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "적 AI 요청에 실패했습니다.");
        }
        if (typeof data.message !== "string" || !Array.isArray(data.packetData)) {
          throw new Error("적 AI 응답에 packetData 배열 또는 message가 없습니다.");
        }

        const enemySquadIDs = new Set(latestGameStateRef.current.enemySquads.map((squad) => squad.squadID));
        let sentCount = 0;

        for (const packetData of data.packetData) {
          if (!isEnemyCommand(packetData, enemySquadIDs)) {
            pushLog("warn", `적 AI가 teamFlag1 소유 범위를 벗어난 명령을 반환해 차단 — ${summarizeForLog(packetData)}`);
            continue;
          }

          if (sendCommand(() => packetDataToBuffer(packetData))) {
            sentCount += 1;
            pushLog("info", `적 AI 명령 전송 완료 — ${summarizeForLog(packetData)}`);
          }
        }

        const strategy = typeof data.strategy === "string" && data.strategy.trim() ? ` / ${data.strategy.trim()}` : "";
        pushLog("info", `적 AI 판단 완료 — ${sentCount}/${data.packetData.length}개 전송 / ${data.message.trim()}${strategy}`);
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        pushLog("error", `적 AI 요청 실패 — ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
      } finally {
        if (activeController === controller) activeController = undefined;
        requestPending = false;
      }
    };

    // Strict Mode의 첫 setup/cleanup에서 중복 요청이 서버까지 도달하지 않도록 다음 태스크에서 실행한다.
    const immediateID = window.setTimeout(() => void requestCommand(), 0);
    const intervalID = window.setInterval(() => void requestCommand(), COMMAND_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(immediateID);
      window.clearInterval(intervalID);
      activeController?.abort();
    };
  }, [enabled, pushLog, sendCommand, serverProtocolVersion]);
}
