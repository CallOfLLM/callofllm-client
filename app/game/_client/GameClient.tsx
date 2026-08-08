"use client";

import { Canvas } from "@react-three/fiber";
import { Box, OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { LoopRepeat } from "three";
import { SkeletonUtils } from "three-stdlib";
import {
  COMMAND_RESULT_CODE,
  createSquad,
  dump,
  MAP_BOUNDS,
  packetDataToBuffer,
  parseServerPacket,
  PKT,
  PKT_NAME,
  PROTOCOL_VERSION,
  STAGE_STATE,
  TEAM_FLAG,
  type Soldier,
} from "../../(lib)/_packet";
import { allySpawnPoint, loadDeployment, squadSoldierCount, type DeploymentSquad, type StageDeployment } from "../../(lib)/squadfuncs";
import type { StageData } from "./StageData";
import stageDefinitions from "./stages.json";

const DEFAULT_WS_URL = "wss://performer-brighton-fireplace-sake.trycloudflare.com/";

// V11 맵 좌표계: 좌상단이 원점이고 서버의 Y는 Three.js z축에 대응한다.
const MAP_W = MAP_BOUNDS.maxX + 1;
const MAP_H = MAP_BOUNDS.maxY + 1;
const GROUND_MODEL_URL = "/Ground_optimize.glb";
const GROUND_MODEL_SCALE = MAP_W / 640;
const SOLDIER_MODEL_URL = "/soldier_low_ktx2.glb";
const SOLDIER_MODEL_SCALE = 5;
const SOLDIER_RUN_ANIMATION = "Soldier_Slow Run";
const STAGES = stageDefinitions as StageData[];

const READY_STATE = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"] as const;

const CLOSE_REASON: Record<number, string> = {
  1000: "정상 종료",
  1001: "엔드포인트 사라짐 (탭 닫힘/서버 종료)",
  1002: "프로토콜 에러",
  1003: "허용되지 않는 데이터 타입",
  1005: "close 코드 없이 종료",
  1006: "비정상 종료 — 핸드셰이크 실패/연결 끊김 (서버 미기동·방화벽·주소 오타 의심)",
  1007: "잘못된 payload",
  1008: "정책 위반",
  1009: "메시지가 너무 큼",
  1011: "서버 내부 오류",
  1015: "TLS 핸드셰이크 실패",
  4002: "게임 프로토콜 버전 불일치",
};

// teamFlag → 색. 팀 번호 의미가 정해지면 여기만 바꾸면 된다.
const TEAM_COLOR = ["#3b82f6", "#ef4444"];
const DEAD_COLOR = "#4b5563";
const DIRECTION_VECTORS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
] as const;

function directionToRotationY(direction: number) {
  const [x, z] = DIRECTION_VECTORS[direction] ?? DIRECTION_VECTORS[0];
  return Math.atan2(x, z);
}

const COMMAND_RESULT_NAME: Record<number, string> = {
  [COMMAND_RESULT_CODE.OK]: "OK",
  [COMMAND_RESULT_CODE.INVALID_PAYLOAD]: "INVALID_PAYLOAD",
  [COMMAND_RESULT_CODE.NOT_OWNER]: "NOT_OWNER",
  [COMMAND_RESULT_CODE.NOT_FOUND]: "NOT_FOUND",
  [COMMAND_RESULT_CODE.INVALID_STATE]: "INVALID_STATE",
};

const STAGE_STATE_NAME: Record<number, string> = {
  [STAGE_STATE.WAITING]: "WAITING",
  [STAGE_STATE.RUNNING]: "RUNNING",
  [STAGE_STATE.ALLY_WIN]: "ALLY_WIN",
  [STAGE_STATE.ENEMY_WIN]: "ENEMY_WIN",
  [STAGE_STATE.DRAW]: "DRAW",
};

function getSelectedStage() {
  const requestedValue = new URLSearchParams(window.location.search).get("stage");
  const requestedID = requestedValue === null ? 1 : Number(requestedValue);
  const requestedStage = Number.isInteger(requestedID) ? STAGES.find((stage) => stage.id === requestedID) : undefined;
  const stage = requestedStage ?? STAGES.find((item) => item.id === 1) ?? STAGES[0];

  return {
    stageID: stage?.id ?? 1,
    stage,
    usedFallback: requestedStage === undefined,
  };
}

/** allySquad가 있으면 준비 화면에서 이름을 붙인 아군 스쿼드 생성 요청이다. */
type StagePacket = { label: string; buffer: ArrayBuffer; allySquad: DeploymentSquad | null };

/** 서버가 CREATE 성공 응답으로 알려준 실제 squadID와 준비 화면 이름을 묶은 값 */
type AllySquad = DeploymentSquad & { squadID: number };

/** 아군은 로컬스토리지의 준비 화면 편성으로, 적군은 스테이지 정의(teamFlag=1)로 만든다. */
function buildStagePackets(stage: StageData, deployment: StageDeployment | null): StagePacket[] {
  const allyPackets = (deployment?.squads ?? [])
    .filter((squad) => squadSoldierCount(squad) > 0)
    .map((squad, index) => {
      const { spawnX, spawnY } = allySpawnPoint(index);
      return {
        label: squad.name,
        buffer: createSquad(squad.archer, squad.warrior, squad.knight, TEAM_FLAG.ALLY, spawnX, spawnY),
        allySquad: squad,
      };
    });

  const enemyPackets = stage.squads.map((squad, index) => ({
    label: `적군 ${index + 1}`,
    buffer: createSquad(squad.archerCount, squad.warriorCount, squad.knightCount, squad.teamFlag, squad.spawnX, squad.spawnY),
    allySquad: null,
  }));

  return [...allyPackets, ...enemyPackets];
}

function Battlefield() {
  const { scene } = useGLTF(GROUND_MODEL_URL);

  // 원본 바닥은 X 0..640, Z -320..0이다. 서버의 X 0..6400,
  // Y 0..3200(Three.js Z축)에 맞춰 10배 확대하고 Z축을 양수로 뒤집는다.
  return <primitive object={scene} scale={[GROUND_MODEL_SCALE, GROUND_MODEL_SCALE, -GROUND_MODEL_SCALE]} />;
}

function AnimatedSoldier() {
  const { scene, animations } = useGLTF(SOLDIER_MODEL_URL);
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const runAnimations = useMemo(() => {
    const source = animations.find((clip) => clip.name === SOLDIER_RUN_ANIMATION) ?? animations[0];
    if (!source) return [];

    // 달리기 동작의 상하 움직임은 유지하되, 리그 루트가 발판에서 옆으로
    // 빠져나가지 않도록 Blender 기준 수평축(X/Y) 이동을 첫 프레임에 고정한다.
    const inPlaceRun = source.clone();
    const rootTrack = inPlaceRun.tracks.find((track) => track.name === "c_root_masterx.position");
    if (rootTrack) {
      const values = rootTrack.values;
      const initialX = values[0];
      const initialY = values[1];
      for (let index = 0; index < values.length; index += 3) {
        values[index] = initialX;
        values[index + 1] = initialY;
      }
    }

    return [inPlaceRun];
  }, [animations]);
  const animationName = runAnimations[0]?.name;
  const { actions } = useAnimations(runAnimations, clonedScene);

  useEffect(() => {
    const action = animationName ? actions[animationName] : undefined;
    if (!action) return;

    action.reset().setLoop(LoopRepeat, Infinity).setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    return () => {
      action.stop();
    };
  }, [actions, animationName]);

  return <primitive object={clonedScene} position={[0, 0, 0]} scale={SOLDIER_MODEL_SCALE} />;
}

function Soldiers({ soldiers }: { soldiers: Soldier[] }) {
  return (
    <>
      {soldiers.map((s) => {
        const color = s.hp <= 0 ? DEAD_COLOR : TEAM_COLOR[s.teamFlag % TEAM_COLOR.length];
        return (
          <group key={`${s.teamFlag}-${s.squadID}-${s.soldierID}`} position={[s.posX, 0, s.posY]}>
            <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[5, 24]} />
              <meshBasicMaterial color={color} transparent opacity={0.75} />
            </mesh>
            <group rotation={[0, directionToRotationY(s.direction), 0]}>
              <AnimatedSoldier />
            </group>
          </group>
        );
      })}
    </>
  );
}

type LogLevel = "info" | "send" | "recv" | "warn" | "error";
type ChatRole = "user" | "assistant" | "error";
type ChatMessage = { id: number; time: string; role: ChatRole; text: string };

const CHAT_LIMIT = 100;

const CHAT_ROLE_LABEL: Record<ChatRole, string> = {
  user: "나",
  assistant: "AI",
  error: "오류",
};

const CHAT_ROLE_COLOR: Record<ChatRole, string> = {
  user: "text-sky-300",
  assistant: "text-emerald-300",
  error: "text-red-400",
};

/** 콘솔에 한 줄로 남길 요약 문자열 */
function summarize(v: unknown): string {
  if (v == null) return "";
  if (typeof v !== "object") return String(v);

  const o = v as Record<string, unknown>;
  if (typeof o.name === "string" && Array.isArray(o.fields)) {
    return `${o.name} fields=[${(o.fields as number[]).join(", ")}] len=${o.pktLen}`;
  }
  try {
    return JSON.stringify(v).slice(0, 200);
  } catch {
    return "";
  }
}

export default function GameClient() {
  const wsRef = useRef<WebSocket | null>(null);
  const connectRef = useRef<() => void>(() => undefined);
  const stageInitializationStartedRef = useRef(false);
  const [wsUrl, setWsUrl] = useState(DEFAULT_WS_URL);

  // onopen 이벤트에만 의존하지 않고 실제 readyState를 그대로 비춘다
  const [wsState, setWsState] = useState<number>(WebSocket.CLOSED);
  const connected = wsState === WebSocket.OPEN;
  const [protocolReady, setProtocolReady] = useState(false);
  const [serverProtocolVersion, setServerProtocolVersion] = useState<number>();
  const [sessionID, setSessionID] = useState<number>();
  const commandReady = connected && protocolReady;

  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatPending, setChatPending] = useState(false);
  const chatIdRef = useRef(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 서버가 내려준 병사 스냅샷 — 화면은 전적으로 이 값으로만 그린다
  const [soldiers, setSoldiers] = useState<Soldier[]>([]);
  const [stageStatus, setStageStatus] = useState<{ stageState: number; aliveAllyCount: number; aliveEnemyCount: number }>();

  // 준비 화면에서 저장한 아군 편성 — CREATE_SQUAD를 보낸 순서와 같다
  const [deployment, setDeployment] = useState<StageDeployment | null>(null);
  useEffect(() => {
    setDeployment(loadDeployment(getSelectedStage().stageID));
  }, []);

  // 보낸 CREATE_SQUAD 순서대로 쌓아 두고, COMMAND_RESULT가 올 때마다 하나씩 꺼내 쓴다.
  // 서버는 팀마다 0부터 생성 성공 순으로 squadID를 발급하므로 응답의 entityID를 이름과 묶어야 정확하다.
  const pendingCreatesRef = useRef<(DeploymentSquad | null)[]>([]);
  const [allySquads, setAllySquads] = useState<AllySquad[]>([]);

  // 페이지를 떠날 때 소켓 정리
  useEffect(() => {
    return () => wsRef.current?.close();
  }, []);

  // 이벤트를 놓치더라도 버튼이 실제 소켓 상태와 어긋나지 않게 주기적으로 맞춘다
  useEffect(() => {
    const id = setInterval(() => {
      setWsState(wsRef.current?.readyState ?? WebSocket.CLOSED);
    }, 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [chatMessages, chatPending]);

  const pushLog = useCallback((level: LogLevel, text: string) => {
    const message = `[GAME ${level.toUpperCase()}] ${text}`;
    if (level === "error") console.error(message);
    else if (level === "warn") console.warn(message);
    else console.log(message);
  }, []);

  const wsLog = useCallback(
    (label: string, ...rest: unknown[]) => {
      const time = new Date().toISOString().slice(11, 23);
      const state = wsRef.current ? READY_STATE[wsRef.current.readyState] : "NONE";
      console.log(`%c[WS ${time}]%c ${label} %c(${state})`, "color:#0af;font-weight:bold", "color:inherit", "color:#888", ...rest);

      const detail = summarize(rest[0]);
      const level: LogLevel = label.startsWith("SEND") ? "send" : label.startsWith("RECV") ? "recv" : "info";
      pushLog(level, detail ? `${label} — ${detail}` : label);
    },
    [pushLog],
  );

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsLog("연결 요청 무시 — 이미 소켓이 있음");
      return;
    }

    const url = wsUrl.trim();
    if (!url) {
      pushLog("error", "서버 주소가 비어 있습니다");
      return;
    }

    setProtocolReady(false);
    setServerProtocolVersion(undefined);
    setSessionID(undefined);
    stageInitializationStartedRef.current = false;

    wsLog(`핸드셰이크 시작 → ${url}`);
    const startedAt = performance.now();
    const elapsed = () => `${Math.round(performance.now() - startedAt)}ms`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      console.error("[WS] 생성 실패 — URL 형식을 확인하세요:", url, err);
      pushLog("error", `생성 실패 — 주소 형식 확인 필요 (ws:// 또는 wss:// 로 시작해야 함): ${url}`);
      return;
    }

    ws.binaryType = "arraybuffer"; // 바이너리 패킷을 Blob 대신 ArrayBuffer로 받는다
    wsRef.current = ws;
    wsLog("WebSocket 객체 생성됨", { url: ws.url, binaryType: ws.binaryType });

    ws.onopen = (e) => {
      wsLog(`OPEN — 핸드셰이크 성공 (${elapsed()})`, {
        protocol: ws.protocol || "(없음)",
        extensions: ws.extensions || "(없음)",
        event: e,
      });
      setWsState(ws.readyState);
    };

    ws.onmessage = (e) => {
      if (!(e.data instanceof ArrayBuffer)) {
        wsLog(`RECV (텍스트 ${String(e.data).length}자)`, e.data);
        return;
      }

      const packetDump = dump(e.data);
      wsLog(`RECV (${e.data.byteLength}바이트)`, packetDump);

      const packet = parseServerPacket(e.data);
      if (!packet) {
        pushLog(
          "error",
          `RECV — 지원하는 서버 패킷 구조와 맞지 않아 무시 (type=${packetDump.pktType ?? "없음"}, declared=${packetDump.pktLen ?? "없음"}, actual=${packetDump.byteLength})`,
        );
        return;
      }

      switch (packet.pktType) {
        case PKT.SC_SOLDIER_POSITIONS:
          setSoldiers(packet.soldiers);
          break;

        case PKT.SC_WELCOME:
          setServerProtocolVersion(packet.protocolVersion);
          if (packet.protocolVersion !== PROTOCOL_VERSION) {
            pushLog("warn", `프로토콜 버전 차이 — 클라이언트 V${PROTOCOL_VERSION}, 서버 V${packet.protocolVersion}; 패킷 구조 검증만 유지하고 연결 계속`);
          }
          setProtocolReady(true);
          setSessionID(packet.sessionID);
          pushLog(
            "info",
            `WELCOME — V${packet.protocolVersion}, session=${packet.sessionID}, tick=${packet.serverTickMs}ms${packet.extraValue === undefined ? "" : `, extra=${packet.extraValue}`}`,
          );

          if (!stageInitializationStartedRef.current) {
            stageInitializationStartedRef.current = true;

            try {
              const { stageID, stage, usedFallback } = getSelectedStage();
              if (!stage) throw new Error("사용할 수 있는 스테이지 배치가 없습니다.");

              const savedDeployment = loadDeployment(stageID);
              const stagePackets = buildStagePackets(stage, savedDeployment);
              if (usedFallback) pushLog("warn", "잘못된 stage 번호라 1번 스테이지를 사용합니다.");
              if (!savedDeployment) pushLog("warn", "저장된 아군 편성이 없어 적군만 배치합니다. 출정 준비 화면에서 편성해 주세요.");

              // COMMAND_RESULT는 보낸 순서대로 오므로 같은 순서로 대기열을 만들어 둔다
              pendingCreatesRef.current = stagePackets.map((stagePacket) => stagePacket.allySquad);
              setAllySquads([]);

              stagePackets.forEach((stagePacket, index) => {
                wsLog(`SEND STAGE ${stageID} CREATE_SQUAD ${index + 1}/${stagePackets.length} '${stagePacket.label}'`, dump(stagePacket.buffer));
                ws.send(stagePacket.buffer);
              });
              pushLog("info", `STAGE ${stageID} '${stage.title}' 초기 배치 ${stagePackets.length}개 전송 완료`);
            } catch (error) {
              stageInitializationStartedRef.current = false;
              pushLog("error", `스테이지 초기화 실패 — ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
            }
          }
          break;

        case PKT.SC_COMMAND_RESULT: {
          const resultName = COMMAND_RESULT_NAME[packet.resultCode] ?? `UNKNOWN(${packet.resultCode})`;
          const commandName = PKT_NAME[packet.requestPacketType] ?? `TYPE_${packet.requestPacketType}`;
          pushLog(packet.resultCode === COMMAND_RESULT_CODE.OK ? "recv" : "error", `${commandName} 결과 — ${resultName}, team=${packet.teamFlag}, entity=${packet.entityID}`);

          // CREATE 성공 응답의 entityID가 그 스쿼드의 실제 squadID다. 실패해도 대기열은 한 칸 밀어야 순서가 맞는다.
          if (packet.requestPacketType === PKT.CS_CREATE_SQUAD && pendingCreatesRef.current.length > 0) {
            const created = pendingCreatesRef.current.shift() ?? null;

            if (created && packet.resultCode === COMMAND_RESULT_CODE.OK) {
              setAllySquads((prev) => [...prev, { ...created, squadID: packet.entityID }]);
              pushLog("info", `아군 스쿼드 '${created.name}' → squadID ${packet.entityID}`);
            } else if (created) {
              pushLog("error", `아군 스쿼드 '${created.name}' 생성 실패 — ${resultName}`);
            }
          }
          break;
        }

        case PKT.SC_STAGE_STATE:
          setStageStatus({
            stageState: packet.stageState,
            aliveAllyCount: packet.aliveAllyCount,
            aliveEnemyCount: packet.aliveEnemyCount,
          });
          pushLog("recv", `STAGE — ${STAGE_STATE_NAME[packet.stageState] ?? `UNKNOWN(${packet.stageState})`}, ally=${packet.aliveAllyCount}, enemy=${packet.aliveEnemyCount}`);
          break;
      }
    };

    ws.onerror = (e) => {
      console.error(`[WS] ERROR (${elapsed()}) — 브라우저는 보안상 상세 사유를 주지 않습니다. 바로 뒤에 오는 CLOSE 코드를 보세요.`, e);
      pushLog("error", `ERROR (${elapsed()}) — 사유는 뒤따르는 CLOSE 코드로 확인`);
    };

    ws.onclose = (e) => {
      const reason = CLOSE_REASON[e.code] ?? "알 수 없는 코드";
      console.warn(`[WS] CLOSE (${elapsed()}) code=${e.code} (${reason}) reason="${e.reason || "(없음)"}" wasClean=${e.wasClean}`, e);
      pushLog("warn", `CLOSE (${elapsed()}) code=${e.code} — ${reason}`);
      wsRef.current = null;
      setWsState(WebSocket.CLOSED);
      setProtocolReady(false);
      setServerProtocolVersion(undefined);
      setSessionID(undefined);
      stageInitializationStartedRef.current = false;
      pendingCreatesRef.current = [];
      setAllySquads([]);
      setSoldiers([]);
      setStageStatus(undefined);
    };
  }, [pushLog, wsLog, wsUrl]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    const timeoutID = window.setTimeout(() => connectRef.current(), 0);
    return () => window.clearTimeout(timeoutID);
  }, []);

  const disconnect = () => {
    if (!wsRef.current) {
      wsLog("해제 요청 무시 — 열린 소켓이 없음");
      return;
    }
    wsLog("close() 호출 — 종료 대기");
    wsRef.current.close(1000, "client disconnect");
  };

  const sendPacket = (buf: ArrayBuffer) => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) {
      wsLog("SEND 실패 — 소켓이 열려 있지 않음");
      return false;
    }
    if (!protocolReady) {
      pushLog("error", "SEND 실패 — 서버 WELCOME 확인 전에는 명령을 보낼 수 없습니다");
      return false;
    }
    wsLog("SEND", dump(buf));
    ws.send(buf);
    return true;
  };

  const sendCommand = (makePacket: () => ArrayBuffer) => {
    try {
      return sendPacket(makePacket());
    } catch (error) {
      const message = error instanceof Error ? error.message : "패킷 생성 중 알 수 없는 오류가 발생했습니다.";
      pushLog("error", `SEND 실패 — ${message}`);
      return false;
    }
  };

  const pushChatMessage = (role: ChatRole, text: string) => {
    const time = new Date().toTimeString().slice(0, 8);
    setChatMessages((prev) => [...prev.slice(-(CHAT_LIMIT - 1)), { id: chatIdRef.current++, time, role, text }]);
  };

  const sendChatMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const message = chatInput.trim();
    if (!message || chatPending) return;
    if (!commandReady) {
      pushChatMessage("error", "게임 서버에 접속하고 WELCOME 확인이 끝난 뒤 명령해 주세요.");
      return;
    }

    pushChatMessage("user", message);
    setChatInput("");
    setChatPending(true);

    try {
      const response = await fetch("/api/openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          gameState: {
            protocolVersion: serverProtocolVersion ?? PROTOCOL_VERSION,
            mapBounds: MAP_BOUNDS,
            stage: stageStatus ?? null,
            // 사용자가 스쿼드를 이름으로 부를 수 있도록 이름 ↔ squadID 표를 함께 보낸다
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
          pushLog("info", `AI 명령 전송 완료 — ${summarize(data.packetData)}`);
        } else {
          pushChatMessage("error", "AI 명령을 만들었지만 게임 서버로 전송하지 못했습니다.");
        }
      }
    } catch (error) {
      pushChatMessage("error", error instanceof Error ? error.message : "AI와 통신하는 중 오류가 발생했습니다.");
    } finally {
      setChatPending(false);
    }
  };

  const clearChat = () => {
    setChatMessages([]);
  };

  return (
    <div className="w-full h-dvh">
      <Canvas camera={{ position: [MAP_W / 2, 4200, 7000], far: 50000 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[MAP_W / 2, 4000, MAP_H / 2]} />

        <Suspense fallback={null}>
          <Battlefield />
        </Suspense>

        {/* 원점 표시 — 맵의 (0,0) 모서리 */}
        <Box position={[0, 2, 0]} args={[20, 4, 20]}>
          <meshStandardMaterial color="black" />
        </Box>

        <Suspense fallback={null}>
          <Soldiers soldiers={soldiers} />
        </Suspense>

        <OrbitControls target={[MAP_W / 2, 0, MAP_H / 2]} />
      </Canvas>

      <div className="fixed top-0 left-0 right-80 flex flex-wrap items-start justify-start gap-3 p-3">
        <div className="flex items-center gap-2 h-15 rounded-md bg-black/60 px-3 text-white">
          <input
            value={wsUrl}
            onChange={(e) => setWsUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && wsState === WebSocket.CLOSED) connect();
            }}
            disabled={wsState !== WebSocket.CLOSED}
            spellCheck={false}
            placeholder="ws://호스트:포트"
            className="w-72 rounded bg-white/20 px-2 py-2 font-mono text-sm disabled:opacity-50"
          />
          <button
            onClick={connected ? disconnect : connect}
            disabled={wsState === WebSocket.CONNECTING || wsState === WebSocket.CLOSING}
            className="w-30 h-10 min-w-30 bg-white text-black rounded-md text-base font-bold disabled:opacity-40"
          >
            {wsState === WebSocket.OPEN ? "접속 해제" : wsState === WebSocket.CONNECTING ? "접속 중…" : wsState === WebSocket.CLOSING ? "종료 중…" : "접속"}
          </button>
          {connected && <span className="text-xs text-white/60">{protocolReady ? `V${serverProtocolVersion ?? PROTOCOL_VERSION} · #${sessionID}` : "WELCOME 대기"}</span>}
        </div>
      </div>

      {/* 아군 편성 — 생성 응답을 받은 뒤에는 서버가 준 squadID를 함께 보여준다 */}
      {(allySquads.length > 0 || (deployment?.squads.length ?? 0) > 0) && (
        <div className="fixed top-20 left-3 w-72 rounded-md bg-black/70 p-3 text-xs text-white">
          <div className="mb-2 font-bold">{allySquads.length > 0 ? `아군 스쿼드 ${allySquads.length}개` : "출전 대기 편성"}</div>
          <ul className="flex flex-col gap-1">
            {(allySquads.length > 0 ? allySquads : (deployment?.squads ?? []).map((squad) => ({ ...squad, squadID: null }))).map((squad, index) => (
              <li key={index} className="flex items-baseline justify-between gap-2">
                <span className="truncate font-semibold text-sky-300">
                  {squad.squadID === null ? "" : `#${squad.squadID} `}
                  {squad.name}
                </span>
                <span className="shrink-0 text-white/60">
                  전 {squad.warrior} · 궁 {squad.archer} · 기 {squad.knight}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 수신한 병사 값 확인용 패널 */}
      <div className="fixed top-3 right-3 w-72 max-h-[calc(100dvh-24rem)] overflow-y-auto rounded-md bg-black/70 p-3 text-white text-xs">
        <div className="font-bold mb-2">병사 {soldiers.length}명</div>
        {soldiers.length === 0 ? (
          <div className="text-white/50">수신 대기 중</div>
        ) : (
          <table className="w-full">
            <thead className="text-white/50">
              <tr>
                <th className="text-left">sq/id</th>
                <th>team</th>
                <th>pos</th>
                <th>HP</th>
                <th>st</th>
                <th>dir</th>
              </tr>
            </thead>
            <tbody>
              {soldiers.map((s) => (
                <tr key={`${s.teamFlag}-${s.squadID}-${s.soldierID}`} className={s.hp <= 0 ? "text-white/40" : ""}>
                  <td>
                    {s.squadID}/{s.soldierID}
                  </td>
                  <td className="text-center" style={{ color: TEAM_COLOR[s.teamFlag % TEAM_COLOR.length] }}>
                    ■ {s.teamFlag}
                  </td>
                  <td className="text-center">
                    {s.posX},{s.posY}
                  </td>
                  <td className="text-center">{s.hp}</td>
                  <td className="text-center">{s.state}</td>
                  <td className="text-center">{s.direction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* AI 채팅 로그 */}
      <section aria-label="AI 채팅 로그" className="fixed right-3 bottom-20 flex h-72 w-112 flex-col rounded-md bg-black/70 text-white">
        <div className="flex items-center justify-between border-b border-white/15 px-3 py-2 text-xs font-bold">
          <span>AI 채팅 ({chatMessages.length})</span>
          <button type="button" onClick={clearChat} className="rounded bg-white/15 px-2 py-1 font-normal hover:bg-white/25">
            지우기
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 text-sm leading-relaxed">
          {chatMessages.length === 0 ? (
            <div className="text-white/40">하단 입력창에서 AI에게 명령을 입력해 주세요</div>
          ) : (
            chatMessages.map((message) => (
              <div key={message.id} className="mb-2 whitespace-pre-wrap break-words">
                <span className="text-xs text-white/35">{message.time} </span>
                <strong className={`mr-1 text-xs ${CHAT_ROLE_COLOR[message.role]}`}>{CHAT_ROLE_LABEL[message.role]}</strong>
                <span className="text-white/85">{message.text}</span>
              </div>
            ))
          )}
          {chatPending && <div className="text-sm text-emerald-300/70">AI가 응답을 생성하고 있습니다…</div>}
          <div ref={chatEndRef} />
        </div>
      </section>

      {/* 화면 전체 너비 채팅 입력창 */}
      <form onSubmit={sendChatMessage} className="fixed right-0 bottom-0 left-0 z-20 flex w-full items-center gap-2 border-t border-white/15 bg-slate-950/95 p-3 backdrop-blur">
        <label htmlFor="ai-command" className="sr-only">
          AI 명령 입력
        </label>
        <input
          id="ai-command"
          value={chatInput}
          onChange={(event) => setChatInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
          }}
          maxLength={4000}
          autoComplete="off"
          placeholder={commandReady ? "AI에게 명령을 입력하세요" : "게임 서버 접속 후 AI 명령을 사용할 수 있습니다"}
          className="h-12 min-w-0 flex-1 rounded-lg border border-white/15 bg-white/10 px-4 text-white outline-none transition placeholder:text-white/35 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
        />
        <button
          type="submit"
          disabled={chatPending || !chatInput.trim() || !commandReady}
          className="h-12 min-w-24 rounded-lg bg-sky-500 px-5 font-bold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {chatPending ? "전송 중…" : "전송"}
        </button>
      </form>
    </div>
  );
}
