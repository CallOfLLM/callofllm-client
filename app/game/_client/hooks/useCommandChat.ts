"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { MAP_BOUNDS, PROTOCOL_VERSION, TEAM_FLAG, packetDataToBuffer, type Soldier } from "../../../(lib)/_packet";
import { summarizeForLog, type GameLogger } from "../lib/gameLog";
import type { AllySquad } from "../lib/stageSetup";
import type { SendCommand, StageStatus } from "./useGameSession";

const MESSAGE_LIMIT = 100;
const HISTORY_LIMIT = 10;
const IDLE_GUIDE_DELAY_MS = 10_000;

export type ChatRole = "user" | "assistant" | "guide" | "error";

export interface ChatMessage {
  id: number;
  time: string;
  role: ChatRole;
  text: string;
}

export interface UseCommandChatOptions {
  playing: boolean;
  finished: boolean;
  commandReady: boolean;
  idleGuideEnabled: boolean;
  serverProtocolVersion?: number;
  stageStatus?: StageStatus;
  currentGoal: string | null;
  allySquads: readonly AllySquad[];
  soldiers: readonly Soldier[];
  sendCommand: SendCommand;
  pushLog: GameLogger;
}

export interface UseCommandChatResult {
  chatInput: string;
  setChatInput: Dispatch<SetStateAction<string>>;
  chatMessages: ChatMessage[];
  chatPending: boolean;
  sendChatMessage: () => Promise<void>;
  clearChat: () => void;
}

/** 자연어 명령 대화와 AI 명령 전송 상태를 관리한다. */
export function useCommandChat({
  playing,
  finished,
  commandReady,
  idleGuideEnabled,
  serverProtocolVersion,
  stageStatus,
  currentGoal,
  allySquads,
  soldiers,
  sendCommand,
  pushLog,
}: UseCommandChatOptions): UseCommandChatResult {
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatPending, setChatPending] = useState(false);
  const nextMessageIDRef = useRef(0);
  const activeRequestRef = useRef<AbortController | null>(null);
  const hasSubmittedCommandRef = useRef(false);
  const idleGuideShownRef = useRef(false);
  const guideSquadNameRef = useRef("스쿼드 1");

  useEffect(() => {
    if (playing && commandReady) return;
    activeRequestRef.current?.abort();
  }, [commandReady, playing]);

  useEffect(() => {
    return () => activeRequestRef.current?.abort();
  }, []);

  const pushChatMessage = useCallback((role: ChatRole, text: string) => {
    const message = {
      id: nextMessageIDRef.current,
      time: new Date().toTimeString().slice(0, 8),
      role,
      text,
    };
    nextMessageIDRef.current += 1;
    setChatMessages((messages) => [...messages.slice(-(MESSAGE_LIMIT - 1)), message]);
  }, []);

  // 50Hz 병사 스냅샷이 타이머를 계속 초기화하지 않도록 최신 생존 부대명만 ref에 보관한다.
  useEffect(() => {
    const livingSquadIDs = new Set(
      soldiers
        .filter((soldier) => soldier.teamFlag === TEAM_FLAG.ALLY && soldier.hp > 0)
        .map((soldier) => soldier.squadID),
    );
    const guideSquad = allySquads.find((squad) => livingSquadIDs.has(squad.squadID)) ?? allySquads[0];
    guideSquadNameRef.current = guideSquad?.name.trim() || "스쿼드 1";
  }, [allySquads, soldiers]);

  // 전투가 시작된 뒤 아무 입력이 없으면 실제 편성 이름으로 한 번만 안내한다.
  useEffect(() => {
    if (
      !playing ||
      finished ||
      !commandReady ||
      !idleGuideEnabled ||
      chatPending ||
      chatInput.trim() ||
      hasSubmittedCommandRef.current ||
      idleGuideShownRef.current
    ) {
      return;
    }

    const timeoutID = window.setTimeout(() => {
      if (hasSubmittedCommandRef.current || idleGuideShownRef.current) return;

      idleGuideShownRef.current = true;
      const squadName = guideSquadNameRef.current;
      pushChatMessage(
        "guide",
        `공격을 명령할까요? “${squadName} 앞으로 전진”으로 거리를 좁힌 뒤 “${squadName} 공격”이라고 명령하면 병사들을 움직일 수 있습니다.`,
      );
    }, IDLE_GUIDE_DELAY_MS);

    return () => window.clearTimeout(timeoutID);
  }, [chatInput, chatPending, commandReady, finished, idleGuideEnabled, playing, pushChatMessage]);

  const sendChatMessage = async () => {
    const message = chatInput.trim();
    if (!message || chatPending) return;

    if (!playing) {
      pushChatMessage("error", finished ? "스테이지가 끝나 더 이상 명령할 수 없습니다." : "작전을 시작한 뒤에 명령할 수 있습니다.");
      return;
    }
    if (!commandReady) {
      pushChatMessage("error", "게임 서버에 접속하고 WELCOME 확인이 끝난 뒤 명령해 주세요.");
      return;
    }

    // AI가 되물었을 때 다음 답을 이해할 수 있도록 이번 입력 직전의 대화를 보낸다.
    const history = chatMessages
      .filter((chat) => chat.role === "user" || chat.role === "assistant")
      .slice(-HISTORY_LIMIT)
      .map((chat) => ({ role: chat.role, text: chat.text }));

    hasSubmittedCommandRef.current = true;
    pushChatMessage("user", message);
    setChatInput("");
    setChatPending(true);

    const controller = new AbortController();
    activeRequestRef.current = controller;

    try {
      const response = await fetch("/api/openai/command/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message,
          history,
          gameState: {
            protocolVersion: serverProtocolVersion ?? PROTOCOL_VERSION,
            mapBounds: MAP_BOUNDS,
            stage: stageStatus ?? null,
            currentGoal,
            allySquads: allySquads.map(({ squadID, name, warrior, archer, knight }) => ({
              teamFlag: TEAM_FLAG.ALLY,
              squadID,
              name,
              warriorCount: warrior,
              archerCount: archer,
              knightCount: knight,
            })),
            soldiers,
          },
        }),
      });
      const value: unknown = await response.json();
      if (controller.signal.aborted) return;
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error("AI API 응답이 JSON 객체가 아닙니다.");
      }

      const data = value as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "AI 요청에 실패했습니다.");
      }
      if (typeof data.message !== "string" || !("packetData" in data)) {
        throw new Error("AI 응답에 packetData 또는 message가 없습니다.");
      }

      pushChatMessage("assistant", data.message);

      if (data.packetData !== null) {
        const sent = sendCommand(() => packetDataToBuffer(data.packetData));
        if (sent) {
          pushLog("info", `AI 명령 전송 완료 — ${summarizeForLog(data.packetData)}`);
        } else {
          pushChatMessage("error", "AI 명령을 만들었지만 게임 서버로 전송하지 못했습니다.");
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      pushChatMessage("error", error instanceof Error ? error.message : "AI와 통신하는 중 오류가 발생했습니다.");
    } finally {
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
        setChatPending(false);
      }
    }
  };

  const clearChat = () => setChatMessages([]);

  return {
    chatInput,
    setChatInput,
    chatMessages,
    chatPending,
    sendChatMessage,
    clearChat,
  };
}
