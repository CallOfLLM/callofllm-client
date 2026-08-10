// 스테이지 정의 — 선택 화면 메타, 아군/적군 초기 배치, 승패 조건을 한곳에서 관리한다.
// squadID는 서버가 팀별로 0부터 발급하므로 여기에 넣지 않는다.

import { MAP_BOUNDS, SANDBOX_MAP_ID, TEAM_FLAG, type PacketData, type TeamFlag } from "./_packet";

/** 맵 정중앙. 튜토리얼 아군의 배치 앵커다. */
export const MAP_CENTER = {
  x: Math.floor((MAP_BOUNDS.minX + MAP_BOUNDS.maxX) / 2),
  y: Math.floor((MAP_BOUNDS.minY + MAP_BOUNDS.maxY) / 2),
} as const;

/** AI에게 허용할 명령 이름. PacketData의 packetType과 같은 집합이다. */
export type CommandName = PacketData["packetType"];

/** CREATE_SQUAD 한 번에 대응하는 적군 스쿼드 정의 */
export interface SquadData {
  teamFlag: TeamFlag;
  archerCount: number;
  warriorCount: number;
  knightCount: number;
  /** 배치 앵커. SPAWN_BOUNDS(4..6395, 4..3195) 안이어야 한다. */
  spawnX: number;
  spawnY: number;
}

/** 튜토리얼용 고정 아군 스쿼드. 준비 화면 편성(DeploymentSquad)에 배치 앵커를 더한 형태다. */
export interface FixedAllySquad {
  name: string;
  warrior: number;
  archer: number;
  knight: number;
  spawnX: number;
  spawnY: number;
}

/**
 * 단계 하나의 달성 조건.
 * axis/sign은 AI 명령 변환기(app/api/openai/command/user)의 전장 방향 규칙과 같은 기준을 쓴다.
 * 앞(전진)은 x +1, 뒤(후퇴)는 x -1, 우측은 y +1, 좌측은 y -1이다.
 */
export type StepCondition =
  /** 이 단계가 시작된 지점을 기준으로 axis 방향(sign)으로 distance 이상 이동 */
  | { kind: "moveAxis"; axis: "x" | "y"; sign: 1 | -1; distance: number }
  /** 아군 중심이 (x, y) 반경 radius 안으로 진입 */
  | { kind: "reachPoint"; x: number; y: number; radius: number }
  /** 아군이 실제로 움직이기 시작 */
  | { kind: "startMoving" }
  /** 아군이 이동 중일 때 STOP_SQUAD를 보내면 달성. 이미 멈춰 있으면 인정하지 않는다. */
  | { kind: "stopWhileMoving" }
  /** 서버가 ALLY_WIN을 보내면 달성 */
  | { kind: "eliminate" };

/** 추가 패배 조건. 아군 중심이 (x, y) 반경 radius를 벗어나면 즉시 패배한다. */
export type FailCondition = { kind: "leaveArea"; x: number; y: number; radius: number };

export interface ObjectiveStep {
  /** 화면에 띄울 이 단계의 지시문 */
  label: string;
  /** 그대로 입력하면 통과하는 예시 명령 */
  hintCommand: string;
  condition: StepCondition;
}

export interface Objective {
  /** 앞에서부터 차례대로 달성해야 하는 단계. 마지막까지 끝내면 클리어다. */
  steps: ObjectiveStep[];
  /** 아군 전멸(서버 ENEMY_WIN)은 항상 패배이므로 여기엔 추가 조건만 적는다. */
  fail?: FailCondition;
}

export interface StageData {
  id: number;
  title: string;
  description: string;
  /**
   * SELECT_MAP으로 보낼 서버 맵 ID. 생략하면 장애물이 없는 내장 sandbox(0)를 쓴다.
   * 외부 JSON 맵(1~3)으로 바꿀 때는 아래 spawn 좌표가 그 맵의 WALL 셀이 아닌지 먼저 확인해야 한다.
   * WALL이면 서버가 CREATE_SQUAD를 INVALID_PAYLOAD(-1)로 거절한다.
   */
  mapID?: number;
  /** 있으면 준비 화면을 건너뛰고 이 편성을 그대로 배치한다(튜토리얼). 없으면 준비 화면 편성을 쓴다. */
  allySquads?: FixedAllySquad[];
  enemySquads: SquadData[];
  objective: Objective;
  /** AI가 만들 수 있는 명령. 생략하면 전체 허용. */
  allowedCommands?: CommandName[];
  /** 첫 클리어 시 지급하는 골드 */
  rewardGold: number;
}

/**
 * 이동 튜토리얼에는 싸울 적이 없다. 적이 0이면 서버가 스테이지를 시작하지 않거나
 * 곧바로 승리로 끝낼 수 있어, 절대 마주치지 않는 맵 구석에 표식용 적 하나를 둔다.
 */
const DISTANT_DUMMY: SquadData = {
  teamFlag: TEAM_FLAG.ENEMY,
  archerCount: 0,
  warriorCount: 1,
  knightCount: 0,
  spawnX: 6300,
  spawnY: 3100,
};

/** 튜토리얼 아군은 언제나 정중앙에 같은 이름으로 선다. */
function centerSquad(warrior: number, archer = 0, knight = 0): FixedAllySquad {
  return { name: "1소대", warrior, archer, knight, spawnX: MAP_CENTER.x, spawnY: MAP_CENTER.y };
}

function enemySquad(spawnX: number, spawnY: number, warriorCount: number, archerCount = 0, knightCount = 0): SquadData {
  return { teamFlag: TEAM_FLAG.ENEMY, archerCount, warriorCount, knightCount, spawnX, spawnY };
}

export const STAGES: StageData[] = [
  {
    id: 1,
    title: "앞뒤로 이동",
    description: "부대를 전진시켰다가 다시 후퇴시키며 이동 명령을 익힙니다.",
    allySquads: [centerSquad(10)],
    enemySquads: [DISTANT_DUMMY],
    objective: {
      steps: [
        {
          label: "부대를 앞(적진 쪽)으로 600 이상 전진시키세요.",
          hintCommand: "1소대를 앞으로 1000 전진시켜",
          condition: { kind: "moveAxis", axis: "x", sign: 1, distance: 600 },
        },
        {
          label: "이번에는 뒤로 600 이상 후퇴시키세요.",
          hintCommand: "1소대를 뒤로 1000 후퇴시켜",
          condition: { kind: "moveAxis", axis: "x", sign: -1, distance: 600 },
        },
      ],
    },
    allowedCommands: ["MOVE_SQUAD"],
    rewardGold: 50,
  },
  {
    id: 2,
    title: "좌우로 이동",
    description: "같은 이동 명령을 좌우 방향으로 연습합니다.",
    allySquads: [centerSquad(10)],
    enemySquads: [DISTANT_DUMMY],
    objective: {
      steps: [
        {
          label: "부대를 오른쪽으로 600 이상 이동시키세요.",
          hintCommand: "1소대를 오른쪽으로 1000 이동시켜",
          condition: { kind: "moveAxis", axis: "y", sign: 1, distance: 600 },
        },
        {
          label: "이번에는 왼쪽으로 600 이상 되돌아오세요.",
          hintCommand: "1소대를 왼쪽으로 1000 이동시켜",
          condition: { kind: "moveAxis", axis: "y", sign: -1, distance: 600 },
        },
      ],
    },
    allowedCommands: ["MOVE_SQUAD"],
    rewardGold: 50,
  },
  {
    id: 3,
    title: "가다가 정지",
    description: "거리를 말하지 않은 전진 명령은 맵 끝까지 갑니다. 원하는 순간에 멈춰 세우세요.",
    allySquads: [centerSquad(10)],
    enemySquads: [DISTANT_DUMMY],
    objective: {
      steps: [
        {
          label: "거리를 말하지 말고 부대를 앞으로 전진시키세요. 맵 끝까지 나아갑니다.",
          hintCommand: "1소대 앞으로 전진",
          condition: { kind: "startMoving" },
        },
        {
          label: "빨간 원을 넘기 전에 부대를 정지시키세요. 넘으면 전장 이탈로 즉시 패배합니다.",
          hintCommand: "1소대 정지",
          condition: { kind: "stopWhileMoving" },
        },
      ],
      fail: { kind: "leaveArea", x: MAP_CENTER.x, y: MAP_CENTER.y, radius: 1300 },
    },
    allowedCommands: ["MOVE_SQUAD", "STOP_SQUAD"],
    rewardGold: 80,
  },
  {
    id: 4,
    title: "첫 교전",
    description: "앞에 있는 적에게 공격을 명령합니다.",
    allySquads: [centerSquad(12)],
    enemySquads: [enemySquad(4200, MAP_CENTER.y, 6)],
    objective: {
      steps: [
        {
          label: "앞쪽 적군을 전멸시키세요.",
          hintCommand: "1소대 공격",
          condition: { kind: "eliminate" },
        },
      ],
    },
    allowedCommands: ["MOVE_SQUAD", "ATTACK_SQUAD", "STOP_SQUAD"],
    rewardGold: 120,
  },
  {
    id: 5,
    title: "접근 후 교전",
    description: "이동과 공격을 이어 붙여 흩어진 적을 정리합니다.",
    allySquads: [centerSquad(10, 5)],
    enemySquads: [enemySquad(5200, 1000, 0, 4), enemySquad(5200, 2200, 6)],
    objective: {
      steps: [
        {
          label: "좌우로 나뉜 적군을 모두 정리하세요.",
          hintCommand: "1소대를 앞으로 2000 전진하면서 적을 발견하면 교전해",
          condition: { kind: "eliminate" },
        },
      ],
    },
    allowedCommands: ["MOVE_SQUAD", "ATTACK_SQUAD", "STOP_SQUAD", "MOVE_ENGAGE_ON_SIGHT", "FOCUS_ATTACK"],
    rewardGold: 150,
  },
  {
    id: 6,
    title: "평원의 첫 전투",
    description: "부대를 지휘해 평원에 자리 잡은 적군을 물리치세요.",
    enemySquads: [enemySquad(5200, 1600, 12)],
    objective: {
      steps: [{ label: "적군을 전멸시키세요.", hintCommand: "1소대 공격", condition: { kind: "eliminate" } }],
    },
    rewardGold: 300,
  },
  {
    id: 7,
    title: "안개 낀 협곡",
    description: "좁은 협곡의 지형을 활용해 적의 진격을 막아내세요.",
    enemySquads: [enemySquad(5400, 800, 14, 8, 2), enemySquad(5400, 2400, 14, 8, 2)],
    objective: {
      steps: [{ label: "적군을 전멸시키세요.", hintCommand: "1소대 공격", condition: { kind: "eliminate" } }],
    },
    rewardGold: 500,
  },
];

/** 스테이지가 사용할 서버 맵 ID. 지정하지 않은 스테이지는 sandbox 맵이다. */
export function stageMapID(stage: StageData): number {
  return stage.mapID ?? SANDBOX_MAP_ID;
}

export function findStage(stageID: number): StageData | undefined {
  return STAGES.find((stage) => stage.id === stageID);
}

/** 바로 다음 스테이지. 마지막 스테이지면 null. */
export function nextStageID(stageID: number): number | null {
  return STAGES.some((stage) => stage.id === stageID + 1) ? stageID + 1 : null;
}

/** 클리어한 스테이지의 바로 다음 스테이지까지 열어 준다. */
export function isStageAvailable(stageID: number, clearedStage: number): boolean {
  return stageID <= clearedStage + 1;
}

/** 고정 편성 스테이지는 준비 화면을 거치지 않는다. */
export function isTutorialStage(stage: StageData): boolean {
  return stage.allySquads !== undefined;
}
