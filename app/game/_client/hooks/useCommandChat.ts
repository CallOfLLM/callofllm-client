"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { MAP_BOUNDS, PROTOCOL_VERSION, TEAM_FLAG, packetDataToBuffer, type Soldier } from "../../../(lib)/_packet";
import type { CommandName } from "../../../(lib)/stages";
import { summarizeForLog, type GameLogger } from "../lib/gameLog";
import type { AllySquad } from "../lib/stageSetup";
import type { SendCommand, StageStatus } from "./useGameSession";

const MESSAGE_LIMIT = 100;
const HISTORY_LIMIT = 10;

export type ChatRole = "user" | "assistant" | "error";

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
  serverProtocolVersion?: number;
  stageStatus?: StageStatus;
  currentGoal: string | null;
  allySquads: readonly AllySquad[];
  soldiers: readonly Soldier[];
  allowedCommands?: readonly CommandName[];
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
  serverProtocolVersion,
  stageStatus,
  currentGoal,
  allySquads,
  soldiers,
  allowedCommands,
  sendCommand,
  pushLog,
}: UseCommandChatOptions): UseCommandChatResult {
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatPending, setChatPending] = useState(false);
  const nextMessageIDRef = useRef(0);
  const activeRequestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (playing && commandReady) return;
    activeRequestRef.current?.abort();
  }, [commandReady, playing]);

  useEffect(() => {
    return () => activeRequestRef.current?.abort();
  }, []);

  const pushChatMessage = (role: ChatRole, text: string) => {
    const message = {
      id: nextMessageIDRef.current,
      time: new Date().toTimeString().slice(0, 8),
      role,
      text,
    };
    nextMessageIDRef.current += 1;
    setChatMessages((messages) => [...messages.slice(-(MESSAGE_LIMIT - 1)), message]);
  };

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
      .filter((chat) => chat.role !== "error")
      .slice(-HISTORY_LIMIT)
      .map((chat) => ({ role: chat.role, text: chat.text }));

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
        const packetType = (data.packetData as { packetType?: unknown }).packetType;

        // 스테이지에서 아직 배우지 않은 명령은 게임 서버로 전달하지 않는다.
        if (allowedCommands && !(typeof packetType === "string" && allowedCommands.includes(packetType as CommandName))) {
          pushChatMessage("error", `이 스테이지에서는 아직 쓸 수 없는 명령입니다. (${String(packetType)})`);
          return;
        }

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
