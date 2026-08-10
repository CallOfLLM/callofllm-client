"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Box, OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import { LoopRepeat, Vector3 } from "three";
import { SkeletonUtils, type OrbitControls as OrbitControlsImpl } from "three-stdlib";
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
  SPAWN_BOUNDS,
  STAGE_STATE,
  TEAM_FLAG,
  type PacketData,
  type Soldier,
} from "../../(lib)/_packet";
import { allySpawnPoint, loadDeployment, squadSoldierCount, type DeploymentSquad, type StageDeployment } from "../../(lib)/squadfuncs";
import { completeStage, DEFAULT_GAME_DATA, loadGameData, saveGameData } from "../../(lib)/_gametype";
import { findStage, isTutorialStage, nextStageID, STAGES, type CommandName, type StageData } from "../../(lib)/stages";
import BriefingOverlay from "./BriefingOverlay";
import LoadingOverlay from "./LoadingOverlay";
import ObjectiveMarkers from "./ObjectiveMarkers";
import ResultOverlay from "./ResultOverlay";
import { useObjective } from "./useObjective";

const DEFAULT_WS_URL = "wss://performer-brighton-fireplace-sake.trycloudflare.com/";

// V15 맵 좌표계: 좌상단이 원점이고 서버의 Y는 Three.js z축에 대응한다.
const MAP_W = MAP_BOUNDS.maxX + 1;
const MAP_H = MAP_BOUNDS.maxY + 1;
const GROUND_MODEL_URL = "/Ground_optimize.glb";
const GROUND_MODEL_SCALE = MAP_W / 640;
const SOLDIER_MODEL_URL = "/soldier_low_ktx2.glb";
const SOLDIER_MODEL_SCALE = 5;
const SOLDIER_RUN_ANIMATION = "Soldier_Slow Run";
const ENEMY_COMMAND_INTERVAL_MS = 10_000;
const ENEMY_FORMATION_OFFSET = 160;
const ENEMY_AI_PACKET_TYPES = new Set<PacketData["packetType"]>([
  "MOVE_SQUAD",
  "ATTACK_SQUAD",
  "STOP_SQUAD",
  "FOCUS_ATTACK",
  "MOVE_ENGAGE_ON_SIGHT",
  "MOVE_FIRE_IN_RANGE",
]);

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
  const requestedStage = Number.isInteger(requestedID) ? findStage(requestedID) : undefined;
  const stage = requestedStage ?? STAGES[0];

  return {
    stageID: stage.id,
    stage,
    usedFallback: requestedStage === undefined,
  };
}

/** 클리어 후 넘어갈 다음 스테이지 주소. 튜토리얼은 편성이 고정이라 준비 화면을 건너뛴다. */
function nextStageHref(stageID: number): string | null {
  const next = nextStageID(stageID);
  if (next === null) return null;

  const nextStage = findStage(next);
  if (!nextStage) return null;

  return isTutorialStage(nextStage) ? `/game?stage=${next}` : `/stage/ready?stage=${next}`;
}

/** 서버가 CREATE 성공 응답으로 알려준 실제 squadID와 준비 화면 이름을 묶은 값 */
type AllySquad = DeploymentSquad & { squadID: number };

type EnemyUnitType = "WARRIOR" | "ARCHER" | "KNIGHT";
type EnemySquadRole = "infantry" | "archer" | "cavalry";
type EnemySquadSeed = {
  teamFlag: typeof TEAM_FLAG.ENEMY;
  role: EnemySquadRole;
  unitType: EnemyUnitType;
  warriorCount: number;
  archerCount: number;
  knightCount: number;
};
type EnemySquad = EnemySquadSeed & { squadID: number };
type PendingCreate = { kind: "ally"; squad: DeploymentSquad } | { kind: "enemy"; squad: EnemySquadSeed };
type StagePacket = { label: string; buffer: ArrayBuffer; pendingCreate: PendingCreate };

function clampSpawn(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * 전술 명령은 스쿼드 단위이므로 혼성 적군을 병종별 순수 스쿼드로 나눈다.
 * 적군의 진격 방향은 -X다. 보병은 전방(-X), 궁병은 후방(+X), 기병은 Y축 측면에 둔다.
 */
function buildEnemyStagePackets(stage: StageData): StagePacket[] {
  return stage.enemySquads.flatMap((squad, squadIndex) => {
    const flankDirection = squadIndex % 2 === 0 ? -1 : 1;
    const groups: Array<{
      count: number;
      role: EnemySquadRole;
      unitType: EnemyUnitType;
      archerCount: number;
      warriorCount: number;
      knightCount: number;
      offsetX: number;
      offsetY: number;
    }> = [
      {
        count: squad.warriorCount,
        role: "infantry",
        unitType: "WARRIOR",
        archerCount: 0,
        warriorCount: squad.warriorCount,
        knightCount: 0,
        offsetX: -ENEMY_FORMATION_OFFSET,
        offsetY: 0,
      },
      {
        count: squad.archerCount,
        role: "archer",
        unitType: "ARCHER",
        archerCount: squad.archerCount,
        warriorCount: 0,
        knightCount: 0,
        offsetX: ENEMY_FORMATION_OFFSET,
        offsetY: 0,
      },
      {
        count: squad.knightCount,
        role: "cavalry",
        unitType: "KNIGHT",
        archerCount: 0,
        warriorCount: 0,
        knightCount: squad.knightCount,
        offsetX: 0,
        offsetY: flankDirection * ENEMY_FORMATION_OFFSET,
      },
    ];

    return groups
      .filter((group) => group.count > 0)
      .map((group) => {
        const spawnX = clampSpawn(squad.spawnX + group.offsetX, SPAWN_BOUNDS.minX, SPAWN_BOUNDS.maxX);
        const spawnY = clampSpawn(squad.spawnY + group.offsetY, SPAWN_BOUNDS.minY, SPAWN_BOUNDS.maxY);
        const enemySquad: EnemySquadSeed = {
          teamFlag: TEAM_FLAG.ENEMY,
          role: group.role,
          unitType: group.unitType,
          warriorCount: group.warriorCount,
          archerCount: group.archerCount,
          knightCount: group.knightCount,
        };

        return {
          label: `적군 ${squadIndex + 1} ${group.unitType}`,
          buffer: createSquad(group.archerCount, group.warriorCount, group.knightCount, TEAM_FLAG.ENEMY, spawnX, spawnY),
          pendingCreate: { kind: "enemy" as const, squad: enemySquad },
        };
      });
  });
}

/**
 * 아군은 튜토리얼이면 스테이지에 박아 둔 고정 편성으로, 아니면 준비 화면 편성으로 만든다.
 * 적군은 언제나 스테이지 정의(teamFlag=1)를 따른다.
 */
function buildStagePackets(stage: StageData, deployment: StageDeployment | null): StagePacket[] {
  const allySource: (DeploymentSquad & { spawnX: number; spawnY: number })[] =
    stage.allySquads ??
    (deployment?.squads ?? []).filter((squad) => squadSoldierCount(squad) > 0).map((squad, index) => ({ ...squad, ...allySpawnPoint(index) }));

  const allyPackets = allySource.map(({ spawnX, spawnY, ...squad }) => ({
    label: squad.name,
    buffer: createSquad(squad.archer, squad.warrior, squad.knight, TEAM_FLAG.ALLY, spawnX, spawnY),
    pendingCreate: { kind: "ally" as const, squad },
  }));

  const enemyPackets = buildEnemyStagePackets(stage);

  return [...allyPackets, ...enemyPackets];
}

/** 적 AI 응답이 기존 teamFlag1 스쿼드만 조종하는 명령인지 1차 방어한다. */
function isEnemyOwnedPacket(packetData: unknown, enemySquadIDs: ReadonlySet<number>): packetData is PacketData {
  if (typeof packetData !== "object" || packetData === null || Array.isArray(packetData)) return false;

  const data = packetData as Record<string, unknown>;
  if (typeof data.packetType !== "string" || !ENEMY_AI_PACKET_TYPES.has(data.packetType as PacketData["packetType"])) return false;

  if (data.packetType === "FOCUS_ATTACK") {
    return (
      data.ownTeamFlag === TEAM_FLAG.ENEMY &&
      data.targetTeamFlag === TEAM_FLAG.ALLY &&
      typeof data.ownSquadID === "number" &&
      enemySquadIDs.has(data.ownSquadID)
    );
  }

  return data.teamFlag === TEAM_FLAG.ENEMY && typeof data.squadID === "number" && enemySquadIDs.has(data.squadID);
}

function Battlefield() {
  const { scene } = useGLTF(GROUND_MODEL_URL);

  // 원본 바닥은 X 0..640, Z -320..0이다. 서버의 X 0..6400,
  // Y 0..3200(Three.js Z축)에 맞춰 10배 확대하고 Z축을 양수로 뒤집는다.
  return <primitive object={scene} scale={[GROUND_MODEL_SCALE, GROUND_MODEL_SCALE, -GROUND_MODEL_SCALE]} />;
}

/**
 * 병사 모델을 바닥 모델과 같은 Suspense 안에서 읽어, 둘 다 준비된 순간에만 onReady가 불리게 한다.
 * 병사는 서버 스냅샷이 와야 그려지므로 이 컴포넌트가 없으면 로딩 완료 시점을 알 수 없다.
 */
function ScenePreloader({ onReady }: { onReady: () => void }) {
  useGLTF(SOLDIER_MODEL_URL);

  useEffect(() => {
    onReady();
  }, [onReady]);

  return null;
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

/** 스쿼드를 따라갈 때 목표 지점으로 한 프레임에 좁히는 비율. 값이 작을수록 부드럽게 따라간다. */
const FOLLOW_SMOOTHING = 0.12;

/** 좌표가 이만큼도 차이나지 않으면 카메라를 건드리지 않는다 — 서버 좌표 단위 */
const FOLLOW_EPSILON = 0.5;

/**
 * 카메라를 focus 지점으로 끌고 간다. 시점(각도·거리)은 사용자가 맞춰 둔 그대로 두기 위해
 * OrbitControls의 target과 카메라 위치를 같은 만큼 함께 옮긴다.
 */
function SquadCamera({ controlsRef, focus }: { controlsRef: RefObject<OrbitControlsImpl | null>; focus: { x: number; z: number } | null }) {
  const stepRef = useRef(new Vector3());

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls || !focus) return;

    const step = stepRef.current.set(focus.x - controls.target.x, 0, focus.z - controls.target.z);
    if (step.length() < FOLLOW_EPSILON) return;

    step.multiplyScalar(FOLLOW_SMOOTHING);
    controls.target.add(step);
    controls.object.position.add(step);
    controls.update();
  });

  return null;
}

type LogLevel = "info" | "send" | "recv" | "warn" | "error";
type ChatRole = "user" | "assistant" | "error";
type ChatMessage = { id: number; time: string; role: ChatRole; text: string };
type StageStatus = { stageState: number; aliveAllyCount: number; aliveEnemyCount: number };

const CHAT_LIMIT = 100;
/** AI 요청에 함께 보내는 직전 대화 개수 */
const CHAT_HISTORY_LIMIT = 10;

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

/** 크기는 Tailwind 클래스에 기대지 않고 width/height 속성으로 직접 지정한다. */
function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

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
  // 첫 마운트의 CLOSED와 실제로 끊긴 상태를 구분해, 로딩 화면이 곧바로 실패를 알리지 않게 한다
  const [connectionClosed, setConnectionClosed] = useState(false);
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
  const soldiersRef = useRef<Soldier[]>([]);
  const [stageStatus, setStageStatus] = useState<StageStatus>();
  const stageStatusRef = useRef<StageStatus | undefined>(undefined);

  // 준비 화면에서 저장한 아군 편성 — CREATE_SQUAD를 보낸 순서와 같다
  const [deployment, setDeployment] = useState<StageDeployment | null>(null);

  // ?stage=번호와 로컬스토리지는 브라우저에서만 읽을 수 있으므로 마운트 후에 정한다.
  // 시작 시점의 진행도는 이번 판이 첫 클리어인지 가르는 기준이라 따로 붙잡아 둔다.
  const [stage, setStage] = useState<StageData | null>(null);
  const [clearedBefore, setClearedBefore] = useState(DEFAULT_GAME_DATA.clearedStage);
  useEffect(() => {
    const timeoutID = window.setTimeout(() => {
      const selected = getSelectedStage();
      setStage(selected.stage);
      setDeployment(loadDeployment(selected.stageID));
      setClearedBefore(loadGameData().clearedStage);
    }, 0);

    return () => window.clearTimeout(timeoutID);
  }, []);

  // 로딩 → 브리핑 → 진행 → 결과. 소켓과 3D 모델이 모두 준비되고 플레이어가 시작을 눌러야 전투가 돌아간다.
  const [assetsReady, setAssetsReady] = useState(false);
  const [started, setStarted] = useState(false);
  const handleSceneReady = useCallback(() => setAssetsReady(true), []);

  // 부대 배치까지 끝나 서버가 스냅샷을 흘리기 시작하면 네트워크 준비가 끝난 것으로 본다
  const networkReady = protocolReady && soldiers.length > 0;

  // 이동·정지 같은 목표는 서버가 판정해 주지 않으므로 스냅샷을 보고 여기서 직접 본다.
  // 브리핑을 읽는 동안 판정이 돌지 않도록 시작 전에는 목표를 넘기지 않는다.
  const mission = useObjective(started ? (stage?.objective ?? null) : null, soldiers, stageStatus?.stageState);

  const finished = mission.outcome !== "playing";
  const phase: "loading" | "briefing" | "playing" | "finished" = finished
    ? "finished"
    : started
      ? "playing"
      : networkReady && assetsReady
        ? "briefing"
        : "loading";

  const playing = phase === "playing";
  const canCommand = commandReady && playing;
  const awardedGold = stage && mission.outcome === "clear" && stage.id > clearedBefore ? stage.rewardGold : 0;

  useEffect(() => {
    if (!finished || !stage) return;

    // 승패가 갈린 뒤에는 서버 시뮬레이션을 더 받을 이유가 없다
    wsRef.current?.close(1000, "stage finished");
    if (mission.outcome !== "clear") return;

    // 진행도와 보상 골드는 처음 깼을 때만 움직인다
    const current = loadGameData();
    const updated = completeStage(current, stage.id, stage.rewardGold);
    if (updated !== current) saveGameData(updated);
  }, [finished, mission.outcome, stage]);

  // 보낸 CREATE_SQUAD 순서대로 쌓아 두고, COMMAND_RESULT가 올 때마다 하나씩 꺼내 쓴다.
  // 서버는 팀마다 0부터 생성 성공 순으로 squadID를 발급하므로 응답의 entityID를 이름과 묶어야 정확하다.
  const pendingCreatesRef = useRef<PendingCreate[]>([]);
  const [allySquads, setAllySquads] = useState<AllySquad[]>([]);
  const [enemySquads, setEnemySquads] = useState<EnemySquad[]>([]);
  const enemySquadsRef = useRef<EnemySquad[]>([]);

  const expectedEnemySquadCount =
    stage?.enemySquads.reduce(
      (count, squad) => count + Number(squad.warriorCount > 0) + Number(squad.archerCount > 0) + Number(squad.knightCount > 0),
      0,
    ) ?? 0;
  const enemySquadsReady = expectedEnemySquadCount > 0 && enemySquads.length === expectedEnemySquadCount;

  // 카메라가 따라갈 아군 스쿼드. null이면 자유 시점이다.
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const [followSquadID, setFollowSquadID] = useState<number | null>(null);

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
      setConnectionClosed(false);
    } catch (err) {
      console.error("[WS] 생성 실패 — URL 형식을 확인하세요:", url, err);
      pushLog("error", `생성 실패 — 주소 형식 확인 필요 (ws:// 또는 wss:// 로 시작해야 함): ${url}`);
      setConnectionClosed(true);
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
          soldiersRef.current = packet.soldiers;
          setSoldiers(packet.soldiers);
          break;

        case PKT.SC_WELCOME:
          setServerProtocolVersion(packet.protocolVersion);
          if (packet.protocolVersion !== PROTOCOL_VERSION) {
            setProtocolReady(false);
            pushLog("error", `프로토콜 버전 불일치 — 클라이언트 V${PROTOCOL_VERSION}, 서버 V${packet.protocolVersion}; 명령을 보내지 않고 연결 종료`);
            ws.close(4002, "protocol version mismatch");
            break;
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
              if (!stagePackets.some((stagePacket) => stagePacket.pendingCreate.kind === "ally")) {
                pushLog("warn", "저장된 아군 편성이 없어 적군만 배치합니다. 출정 준비 화면에서 편성해 주세요.");
              }

              // COMMAND_RESULT는 보낸 순서대로 오므로 같은 순서로 대기열을 만들어 둔다
              pendingCreatesRef.current = stagePackets.map((stagePacket) => stagePacket.pendingCreate);
              setAllySquads([]);
              enemySquadsRef.current = [];
              setEnemySquads([]);

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
            const pendingCreate = pendingCreatesRef.current.shift();
            if (!pendingCreate) break;

            if (packet.resultCode === COMMAND_RESULT_CODE.OK) {
              const expectedTeamFlag = pendingCreate.kind === "ally" ? TEAM_FLAG.ALLY : TEAM_FLAG.ENEMY;
              if (packet.teamFlag !== expectedTeamFlag) {
                pushLog("error", `CREATE_SQUAD 응답 팀 불일치 — 예상 team=${expectedTeamFlag}, 실제 team=${packet.teamFlag}`);
                break;
              }

              if (pendingCreate.kind === "ally") {
                setAllySquads((prev) => [...prev, { ...pendingCreate.squad, squadID: packet.entityID }]);
                pushLog("info", `아군 스쿼드 '${pendingCreate.squad.name}' → squadID ${packet.entityID}`);
              } else {
                const createdEnemy = { ...pendingCreate.squad, squadID: packet.entityID };
                enemySquadsRef.current = [...enemySquadsRef.current, createdEnemy];
                setEnemySquads(enemySquadsRef.current);
                pushLog("info", `적군 ${pendingCreate.squad.unitType} 스쿼드 → squadID ${packet.entityID}`);
              }
            } else if (pendingCreate.kind === "ally") {
              pushLog("error", `아군 스쿼드 '${pendingCreate.squad.name}' 생성 실패 — ${resultName}`);
            } else {
              pushLog("error", `적군 ${pendingCreate.squad.unitType} 스쿼드 생성 실패 — ${resultName}`);
            }
          }
          break;
        }

        case PKT.SC_STAGE_STATE: {
          const nextStageStatus = {
            stageState: packet.stageState,
            aliveAllyCount: packet.aliveAllyCount,
            aliveEnemyCount: packet.aliveEnemyCount,
          };
          stageStatusRef.current = nextStageStatus;
          setStageStatus(nextStageStatus);
          pushLog("recv", `STAGE — ${STAGE_STATE_NAME[packet.stageState] ?? `UNKNOWN(${packet.stageState})`}, ally=${packet.aliveAllyCount}, enemy=${packet.aliveEnemyCount}`);
          break;
        }
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
      setConnectionClosed(true);
      setWsState(WebSocket.CLOSED);
      setProtocolReady(false);
      setServerProtocolVersion(undefined);
      setSessionID(undefined);
      stageInitializationStartedRef.current = false;
      pendingCreatesRef.current = [];
      setAllySquads([]);
      enemySquadsRef.current = [];
      setEnemySquads([]);
      setFollowSquadID(null);
      soldiersRef.current = [];
      setSoldiers([]);
      stageStatusRef.current = undefined;
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

  const sendPacket = useCallback(
    (buf: ArrayBuffer) => {
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
    },
    [protocolReady, pushLog, wsLog],
  );

  const sendCommand = useCallback(
    (makePacket: () => ArrayBuffer) => {
      try {
        return sendPacket(makePacket());
      } catch (error) {
        const message = error instanceof Error ? error.message : "패킷 생성 중 알 수 없는 오류가 발생했습니다.";
        pushLog("error", `SEND 실패 — ${message}`);
        return false;
      }
    },
    [pushLog, sendPacket],
  );

  // 전투 시작 직후 한 번, 이후 10초마다 최신 전장 전체를 적 AI에 보내고 teamFlag1 명령만 적용한다.
  useEffect(() => {
    if (!canCommand || !enemySquadsReady) return;

    let cancelled = false;
    let requestPending = false;
    let activeController: AbortController | undefined;

    const requestEnemyCommand = async () => {
      if (requestPending || cancelled) return;

      const currentSoldiers = soldiersRef.current;
      const currentEnemySquads = enemySquadsRef.current;
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
              stage: stageStatusRef.current ?? null,
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

        const enemySquadIDs = new Set(enemySquadsRef.current.map((squad) => squad.squadID));
        let sentCount = 0;
        for (const packetData of data.packetData) {
          if (!isEnemyOwnedPacket(packetData, enemySquadIDs)) {
            pushLog("warn", `적 AI가 teamFlag1 소유 범위를 벗어난 명령을 반환해 차단 — ${summarize(packetData)}`);
            continue;
          }

          if (sendCommand(() => packetDataToBuffer(packetData))) {
            sentCount += 1;
            pushLog("info", `적 AI 명령 전송 완료 — ${summarize(packetData)}`);
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

    // Strict Mode의 첫 setup/cleanup에서 중복 요청이 서버까지 도달하지 않도록 다음 태스크에서 즉시 실행한다.
    const immediateID = window.setTimeout(() => void requestEnemyCommand(), 0);
    const intervalID = window.setInterval(() => void requestEnemyCommand(), ENEMY_COMMAND_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(immediateID);
      window.clearInterval(intervalID);
      activeController?.abort();
    };
  }, [canCommand, enemySquadsReady, pushLog, sendCommand, serverProtocolVersion]);

  const pushChatMessage = (role: ChatRole, text: string) => {
    const time = new Date().toTimeString().slice(0, 8);
    setChatMessages((prev) => [...prev.slice(-(CHAT_LIMIT - 1)), { id: chatIdRef.current++, time, role, text }]);
  };

  const sendChatMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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

    // AI가 되물었을 때 다음 답을 알아들으려면 직전 대화가 필요하다 — 이번 입력을 넣기 전에 잘라둔다
    const history = chatMessages
      .filter((chat) => chat.role !== "error")
      .slice(-CHAT_HISTORY_LIMIT)
      .map((chat) => ({ role: chat.role, text: chat.text }));

    pushChatMessage("user", message);
    setChatInput("");
    setChatPending(true);

    try {
      const response = await fetch("/api/openai/command/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history,
          gameState: {
            protocolVersion: serverProtocolVersion ?? PROTOCOL_VERSION,
            mapBounds: MAP_BOUNDS,
            stage: stageStatus ?? null,
            // 지금 달성해야 하는 목표 — "앞으로 가" 같은 말을 해석할 때 근거가 된다
            currentGoal: mission.step?.label ?? null,
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
        const packetType = (data.packetData as { packetType?: unknown }).packetType;

        // 스테이지마다 배우는 명령이 달라, 아직 배우지 않은 명령은 게임 서버로 보내지 않는다
        const allowed = stage?.allowedCommands;
        if (allowed && !(typeof packetType === "string" && allowed.includes(packetType as CommandName))) {
          pushChatMessage("error", `이 스테이지에서는 아직 쓸 수 없는 명령입니다. (${String(packetType)})`);
          return;
        }

        const sent = sendCommand(() => packetDataToBuffer(data.packetData));
        if (sent) {
          pushLog("info", `AI 명령 전송 완료 — ${summarize(data.packetData)}`);
          // "이동 중 정지"처럼 명령 자체가 조건인 단계는 전송 성공을 봐야 판정할 수 있다
          if (typeof packetType === "string") mission.notifyCommand(packetType as CommandName);
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

  // 서버가 스쿼드를 만들어 주기 전에는 준비 화면에서 저장한 편성을 그대로 보여준다.
  // 아직 squadID가 없는 편성은 따라갈 병사도 없으므로 카메라 버튼을 잠근다.
  const displaySquads: (DeploymentSquad & { squadID: number | null })[] =
    allySquads.length > 0
      ? allySquads
      : (deployment?.squads ?? []).filter((squad) => squadSoldierCount(squad) > 0).map((squad) => ({ ...squad, squadID: null }));

  // 따라가는 중인 스쿼드의 평균 위치. 살아 있는 병사만 세고, 전멸하면 마지막 위치에서 멈춘다.
  const followFocus = useMemo(() => {
    if (followSquadID === null) return null;

    const alive = soldiers.filter((soldier) => soldier.teamFlag === TEAM_FLAG.ALLY && soldier.squadID === followSquadID && soldier.hp > 0);
    if (alive.length === 0) return null;

    const total = alive.reduce((sum, soldier) => ({ x: sum.x + soldier.posX, y: sum.y + soldier.posY }), { x: 0, y: 0 });
    return { x: total.x / alive.length, z: total.y / alive.length };
  }, [soldiers, followSquadID]);

  return (
    <div className="w-full h-dvh">
      <Canvas camera={{ position: [MAP_W / 2, 4200, 7000], far: 50000 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[MAP_W / 2, 4000, MAP_H / 2]} />

        <Suspense fallback={null}>
          <Battlefield />
          <ScenePreloader onReady={handleSceneReady} />
        </Suspense>

        {/* 원점 표시 — 맵의 (0,0) 모서리 */}
        <Box position={[0, 2, 0]} args={[20, 4, 20]}>
          <meshStandardMaterial color="black" />
        </Box>

        <Suspense fallback={null}>
          <Soldiers soldiers={soldiers} />
        </Suspense>

        <ObjectiveMarkers condition={mission.step?.condition ?? null} stepOrigin={mission.stepOrigin} fail={stage?.objective.fail} />

        <OrbitControls ref={controlsRef} target={[MAP_W / 2, 0, MAP_H / 2]} />
        <SquadCamera controlsRef={controlsRef} focus={followFocus} />
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

      {/* 현재 목표 — 지금 무엇을 해야 하는지와 진행도를 화면 위쪽 가운데에 띄운다 */}
      {playing && stage && mission.step && (
        <div className="fixed left-1/2 top-20 w-120 max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-lg border border-white/10 bg-black/75 px-5 py-4 text-white">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-bold tracking-[0.18em] text-sky-400">
              STAGE {stage.id} · {stage.title}
            </span>
            {mission.stepCount > 1 && (
              <span className="tabular-nums text-white/50">
                목표 {mission.stepIndex + 1} / {mission.stepCount}
              </span>
            )}
          </div>

          <p className="mt-2 text-sm font-semibold leading-relaxed">{mission.step.label}</p>

          {mission.progressRatio !== null && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-sky-400 transition-[width]" style={{ width: `${Math.round(mission.progressRatio * 100)}%` }} />
            </div>
          )}
          {mission.progressLabel && <p className="mt-2 text-xs tabular-nums text-white/55">{mission.progressLabel}</p>}

          {isTutorialStage(stage) && (
            <button
              type="button"
              onClick={() => setChatInput(mission.step?.hintCommand ?? "")}
              className="mt-3 w-full truncate rounded-md border border-white/15 bg-white/10 px-3 py-2 text-left text-xs text-white/70 transition hover:border-sky-400/60 hover:bg-sky-400/10 hover:text-sky-200"
            >
              예시 명령 — {mission.step.hintCommand}
            </button>
          )}
        </div>
      )}

      {/* 아군 편성 — 오른쪽 위에 스쿼드별 병종 수만 간결하게 보여준다 */}
      {displaySquads.length > 0 && (
        <div className="fixed top-3 right-3 flex flex-col gap-1 rounded-lg bg-black/70 px-4 py-3 text-white">
          {displaySquads.map((squad, index) => (
            <div key={index} className="flex items-center gap-4 text-sm">
              <span className="flex w-32 items-center gap-1.5">
                <span className="truncate font-bold text-sky-300">{squad.name}</span>
                <button
                  type="button"
                  onClick={() => setFollowSquadID((prev) => (prev === squad.squadID ? null : squad.squadID))}
                  disabled={squad.squadID === null}
                  aria-pressed={followSquadID !== null && followSquadID === squad.squadID}
                  title={squad.squadID === null ? "출전 후 사용할 수 있습니다" : "카메라로 따라가기"}
                  className={`shrink-0 rounded p-1 transition disabled:cursor-not-allowed ${
                    followSquadID !== null && followSquadID === squad.squadID
                      ? "bg-sky-500 text-slate-950"
                      : "bg-white/15 text-white hover:bg-white/30 disabled:bg-white/5 disabled:text-white/35"
                  }`}
                >
                  <CameraIcon />
                  <span className="sr-only">{squad.name} 카메라로 따라가기</span>
                </button>
              </span>
              <span className="flex gap-3 tabular-nums text-white/85">
                <span>
                  보병 <b className="text-white">{squad.warrior}</b>
                </span>
                <span>
                  궁병 <b className="text-white">{squad.archer}</b>
                </span>
                <span>
                  기병 <b className="text-white">{squad.knight}</b>
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 수신한 병사 값 확인용 패널 */}
      <div className="fixed top-20 left-3 w-72 max-h-[calc(100dvh-26rem)] overflow-y-auto rounded-md bg-black/70 p-3 text-white text-xs">
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

      {/* AI 채팅 — 화면 하단 전체를 차지한다 */}
      <section aria-label="AI 채팅" className="fixed inset-x-0 bottom-0 z-20 flex h-72 flex-col border-t border-white/15 bg-slate-950/90 text-white backdrop-blur">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs font-bold">
          <span>AI 채팅 ({chatMessages.length})</span>
          <button type="button" onClick={clearChat} className="rounded bg-white/15 px-2 py-1 font-normal hover:bg-white/25">
            지우기
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2 text-sm leading-relaxed">
          {chatMessages.length === 0 ? (
            <div className="text-white/40">아래 입력창에서 AI에게 명령을 입력해 주세요</div>
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

        <form onSubmit={sendChatMessage} className="flex items-center gap-2 border-t border-white/10 p-3">
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
            placeholder={
              finished ? "스테이지가 끝났습니다" : !playing ? "작전을 시작하면 명령할 수 있습니다" : commandReady ? "AI에게 명령을 입력하세요" : "게임 서버 접속 후 AI 명령을 사용할 수 있습니다"
            }
            className="h-12 min-w-0 flex-1 rounded-lg border border-white/15 bg-white/10 px-4 text-white outline-none transition placeholder:text-white/35 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
          />
          <button
            type="submit"
            disabled={chatPending || !chatInput.trim() || !canCommand}
            className="h-12 min-w-24 rounded-lg bg-sky-500 px-5 font-bold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {chatPending ? "전송 중…" : "전송"}
          </button>
        </form>
      </section>

      {phase === "loading" && <LoadingOverlay networkReady={networkReady} assetsReady={assetsReady} disconnected={connectionClosed} />}

      {phase === "briefing" && stage && <BriefingOverlay stage={stage} squads={displaySquads} onStart={() => setStarted(true)} />}

      {phase === "finished" && stage && (
        <ResultOverlay
          clear={mission.outcome === "clear"}
          reason={mission.reason}
          stageID={stage.id}
          stageTitle={stage.title}
          awardedGold={awardedGold}
          nextHref={mission.outcome === "clear" ? nextStageHref(stage.id) : null}
        />
      )}
    </div>
  );
}
