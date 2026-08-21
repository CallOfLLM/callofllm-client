// 스테이지 정의 — 선택 화면 메타, 아군/적군 초기 배치, 승패 조건을 한곳에서 관리한다.
// squadID는 서버가 팀별로 0부터 발급하므로 여기에 넣지 않는다.

import { MAP_BOUNDS, SANDBOX_MAP_ID, TEAM_FLAG, type PacketData, type TeamFlag } from "./_packet";

/** 맵 정중앙. 튜토리얼 아군의 배치 앵커다. */
export const MAP_CENTER = {
  x: Math.floor((MAP_BOUNDS.minX + MAP_BOUNDS.maxX) / 2),
  y: Math.floor((MAP_BOUNDS.minY + MAP_BOUNDS.maxY) / 2),
} as const;

const MOVEMENT_MAP_ID = 1;
const BATTLE_MAP_ID = 2;
const TUTORIAL_FLANK_OFFSET = 500;

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

export interface Objective {
  /** 전투 중 화면에 띄울 목표 */
  label: string;
  /** 입력창에 채워 줄 추천 명령 */
  hintCommand: string;
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

/** Map 1 튜토리얼 아군은 중앙의 검증된 바닥 좌표에 선다. */
function centerSquad(warrior: number, archer = 0, knight = 0): FixedAllySquad {
  return { name: "1소대", warrior, archer, knight, spawnX: MAP_CENTER.x, spawnY: MAP_CENTER.y };
}

/** Map 2 중앙은 장애물이므로 서쪽의 열린 바닥에 아군을 배치한다. */
function mapTwoSquad(warrior: number, archer = 0, knight = 0): FixedAllySquad {
  return { name: "1소대", warrior, archer, knight, spawnX: 1200, spawnY: 1611 };
}

function enemySquad(spawnX: number, spawnY: number, warriorCount: number, archerCount = 0, knightCount = 0): SquadData {
  return { teamFlag: TEAM_FLAG.ENEMY, archerCount, warriorCount, knightCount, spawnX, spawnY };
}

export const STAGES: StageData[] = [
  {
    id: 1,
    title: "이동과 첫 공격",
    description: "도움말의 순서대로 부대를 이동시킨 뒤 공격 명령을 내려 첫 전투를 마무리하세요.",
    mapID: MOVEMENT_MAP_ID,
    allySquads: [centerSquad(20)],
    enemySquads: [enemySquad(4200, MAP_CENTER.y, 10)],
    objective: {
      label: "적군 10명을 모두 처치하세요. 적군이 전멸하면 즉시 클리어됩니다.",
      hintCommand: "모두 공격!",
    },
    allowedCommands: ["MOVE_SQUAD", "ATTACK_SQUAD"],
    rewardGold: 50,
  },
  {
    id: 2,
    title: "방향 이동과 교전",
    description: "왼쪽 대각선의 적에게 접근하며 방향 이동을 익힌 뒤 적군을 모두 처치하세요.",
    mapID: MOVEMENT_MAP_ID,
    allySquads: [centerSquad(16, 4)],
    enemySquads: [enemySquad(4200, MAP_CENTER.y - TUTORIAL_FLANK_OFFSET, 12)],
    objective: {
      label: "왼쪽 대각선으로 위치를 조정한 뒤 적군을 전멸시키세요.",
      hintCommand: "1소대를 앞으로 그리고 왼쪽으로 이동해",
    },
    allowedCommands: ["MOVE_SQUAD", "ATTACK_SQUAD", "STOP_SQUAD"],
    rewardGold: 50,
  },
  {
    id: 3,
    title: "이동 중 교전",
    description: "오른쪽 대각선으로 진격하며 마주치는 적과 한 번에 교전하세요.",
    mapID: MOVEMENT_MAP_ID,
    allySquads: [centerSquad(15, 5)],
    enemySquads: [enemySquad(4200, MAP_CENTER.y + TUTORIAL_FLANK_OFFSET, 15)],
    objective: {
      label: "오른쪽 대각선으로 진격하며 적군을 모두 처치하세요.",
      hintCommand: "1소대를 앞으로 그리고 오른쪽으로 전진하면서 적을 발견하면 교전해",
    },
    allowedCommands: ["MOVE_SQUAD", "ATTACK_SQUAD", "STOP_SQUAD", "MOVE_ENGAGE_ON_SIGHT"],
    rewardGold: 80,
  },
  {
    id: 4,
    title: "지형을 이용한 전투",
    description: "이동과 공격 명령을 활용해 장애물 너머의 적을 모두 처치하세요.",
    mapID: BATTLE_MAP_ID,
    allySquads: [mapTwoSquad(12)],
    enemySquads: [enemySquad(5200, 2200, 6)],
    objective: {
      label: "앞쪽 적군을 전멸시키세요.",
      hintCommand: "모두 공격!",
    },
    allowedCommands: ["MOVE_SQUAD", "ATTACK_SQUAD", "STOP_SQUAD", "MOVE_ENGAGE_ON_SIGHT"],
    rewardGold: 120,
  },
  {
    id: 5,
    title: "접근 후 교전",
    description: "이동과 공격을 이어 붙여 흩어진 적을 정리합니다.",
    mapID: BATTLE_MAP_ID,
    allySquads: [mapTwoSquad(10, 5)],
    enemySquads: [enemySquad(5400, 800, 0, 4), enemySquad(5200, 2200, 6)],
    objective: {
      label: "좌우로 나뉜 적군을 모두 정리하세요.",
      hintCommand: "모두 앞으로 200미터 전진하면서 적을 발견하면 교전해",
    },
    allowedCommands: ["MOVE_SQUAD", "ATTACK_SQUAD", "STOP_SQUAD", "MOVE_ENGAGE_ON_SIGHT", "FOCUS_ATTACK"],
    rewardGold: 150,
  },
  {
    id: 6,
    title: "평원의 첫 전투",
    description: "부대를 지휘해 평원에 자리 잡은 적군을 물리치세요.",
    mapID: BATTLE_MAP_ID,
    enemySquads: [enemySquad(5200, 2200, 12)],
    objective: {
      label: "적군을 전멸시키세요.",
      hintCommand: "1소대 공격",
    },
    rewardGold: 300,
  },
  {
    id: 7,
    title: "안개 낀 협곡",
    description: "좁은 협곡의 지형을 활용해 적의 진격을 막아내세요.",
    mapID: BATTLE_MAP_ID,
    enemySquads: [enemySquad(5200, 2000, 14, 8, 2), enemySquad(5600, 800, 14, 8, 2)],
    objective: {
      label: "적군을 전멸시키세요.",
      hintCommand: "1소대 공격",
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
