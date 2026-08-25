// 스테이지 정의 — 선택 화면 메타, 아군/적군 초기 배치, 승패 조건을 한곳에서 관리한다.
// squadID는 서버가 팀별로 0부터 발급하므로 여기에 넣지 않는다.

import {
  MAP_BOUNDS,
  MAX_SQUAD_SIZE,
  SANDBOX_MAP_ID,
  SPAWN_BOUNDS,
} from "./_packet";

/** 맵 정중앙. 튜토리얼 아군의 배치 앵커다. */
export const MAP_CENTER = {
  x: Math.floor((MAP_BOUNDS.minX + MAP_BOUNDS.maxX) / 2),
  y: Math.floor((MAP_BOUNDS.minY + MAP_BOUNDS.maxY) / 2),
} as const;

const MOVEMENT_MAP_ID = 1;
const BATTLE_MAP_ID = 2;
const MAIN_BATTLE_MAP_ID = SANDBOX_MAP_ID;
const TUTORIAL_FLANK_OFFSET = 500;
const MAX_ENEMY_AI_SQUADS = 6;

export type EnemySquadRole = "infantry" | "archer" | "cavalry";
export type EnemyUnitType = "WARRIOR" | "ARCHER" | "KNIGHT";

/** CREATE_SQUAD 한 번과 적 AI 명령 하나에 정확히 대응하는 순수 병종 스쿼드. */
export interface EnemySquadData {
  role: EnemySquadRole;
  unitType: EnemyUnitType;
  count: number;
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
  enemySquads: EnemySquadData[];
  objective: Objective;
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

function infantrySquad(count: number, spawnX: number, spawnY: number): EnemySquadData {
  return { role: "infantry", unitType: "WARRIOR", count, spawnX, spawnY };
}

function archerSquad(count: number, spawnX: number, spawnY: number): EnemySquadData {
  return { role: "archer", unitType: "ARCHER", count, spawnX, spawnY };
}

function cavalrySquad(count: number, spawnX: number, spawnY: number): EnemySquadData {
  return { role: "cavalry", unitType: "KNIGHT", count, spawnX, spawnY };
}

// 장애물이 없는 본전투 맵에서 보병은 전열, 궁병은 동쪽 후열, 기병은 Y축 양익에 선다.
const OPEN_FIELD_FORMATION = {
  infantryCenter: { x: 4800, y: 1600 },
  infantryLow: { x: 4800, y: 900 },
  infantryHigh: { x: 4800, y: 2300 },
  archerCenter: { x: 5400, y: 1600 },
  archerLow: { x: 5400, y: 900 },
  archerHigh: { x: 5400, y: 2300 },
  cavalryLow: { x: 5100, y: 600 },
  cavalryHigh: { x: 5100, y: 2600 },
} as const;

function mainBattleStage(
  id: number,
  title: string,
  description: string,
  enemySquads: EnemySquadData[],
  rewardGold: number,
): StageData {
  const enemyCount = enemySquads.reduce((total, squad) => total + squad.count, 0);

  return {
    id,
    title,
    description,
    mapID: MAIN_BATTLE_MAP_ID,
    enemySquads,
    objective: {
      label: `적군 ${enemyCount}명을 모두 처치하세요.`,
      hintCommand: "1소대 공격",
    },
    rewardGold,
  };
}

export const STAGES: StageData[] = [
  {
    id: 1,
    title: "이동과 첫 공격",
    description: "도움말의 순서대로 부대를 이동시킨 뒤 공격 명령을 내려 첫 전투를 마무리하세요.",
    mapID: MOVEMENT_MAP_ID,
    allySquads: [centerSquad(20)],
    enemySquads: [infantrySquad(10, 4040, MAP_CENTER.y)],
    objective: {
      label: "적군 10명을 모두 처치하세요. 적군이 전멸하면 즉시 클리어됩니다.",
      hintCommand: "모두 공격!",
    },
    rewardGold: 10,
  },
  {
    id: 2,
    title: "방향 이동과 교전",
    description: "왼쪽 대각선의 적에게 접근하며 방향 이동을 익힌 뒤 적군을 모두 처치하세요.",
    mapID: MOVEMENT_MAP_ID,
    allySquads: [centerSquad(16, 4)],
    enemySquads: [infantrySquad(12, 4040, MAP_CENTER.y - TUTORIAL_FLANK_OFFSET)],
    objective: {
      label: "왼쪽 대각선으로 위치를 조정한 뒤 적군을 전멸시키세요.",
      hintCommand: "1소대를 앞으로 그리고 왼쪽으로 이동해",
    },
    rewardGold: 15,
  },
  {
    id: 3,
    title: "이동 중 교전",
    description: "오른쪽 대각선으로 진격하며 마주치는 적과 한 번에 교전하세요.",
    mapID: MOVEMENT_MAP_ID,
    allySquads: [centerSquad(15, 5)],
    enemySquads: [infantrySquad(15, 4040, MAP_CENTER.y + TUTORIAL_FLANK_OFFSET)],
    objective: {
      label: "오른쪽 대각선으로 진격하며 적군을 모두 처치하세요.",
      hintCommand: "1소대를 앞으로 그리고 오른쪽으로 전진하면서 적을 발견하면 교전해",
    },
    rewardGold: 20,
  },
  {
    id: 4,
    title: "지형을 이용한 전투",
    description: "이동과 공격 명령을 활용해 장애물 너머의 적을 모두 처치하세요.",
    mapID: BATTLE_MAP_ID,
    allySquads: [mapTwoSquad(12)],
    enemySquads: [infantrySquad(6, 5040, 2200)],
    objective: {
      label: "앞쪽 적군을 전멸시키세요.",
      hintCommand: "모두 공격!",
    },
    rewardGold: 25,
  },
  {
    id: 5,
    title: "접근 후 교전",
    description: "이동과 공격을 이어 붙여 흩어진 적을 정리합니다.",
    mapID: BATTLE_MAP_ID,
    allySquads: [mapTwoSquad(10, 5)],
    enemySquads: [infantrySquad(6, 5040, 2200), archerSquad(4, 5560, 800)],
    objective: {
      label: "좌우로 나뉜 적군을 모두 정리하세요.",
      hintCommand: "모두 앞으로 200미터 전진하면서 적을 발견하면 교전해",
    },
    rewardGold: 30,
  },
  mainBattleStage(
    6,
    "평원의 전초전",
    "첫 자유 편성 부대로 단일 보병 전열을 격파하세요.",
    [infantrySquad(12, OPEN_FIELD_FORMATION.infantryCenter.x, OPEN_FIELD_FORMATION.infantryCenter.y)],
    30,
  ),
  mainBattleStage(
    7,
    "후열의 화살",
    "보병 뒤에서 사격하는 궁병대를 돌파하세요.",
    [
      infantrySquad(12, OPEN_FIELD_FORMATION.infantryCenter.x, OPEN_FIELD_FORMATION.infantryCenter.y),
      archerSquad(6, OPEN_FIELD_FORMATION.archerCenter.x, OPEN_FIELD_FORMATION.archerCenter.y),
    ],
    35,
  ),
  mainBattleStage(
    8,
    "갈라진 전열",
    "두 방향으로 나뉜 보병대를 차례로 무너뜨리세요.",
    [
      infantrySquad(12, OPEN_FIELD_FORMATION.infantryLow.x, OPEN_FIELD_FORMATION.infantryLow.y),
      infantrySquad(12, OPEN_FIELD_FORMATION.infantryHigh.x, OPEN_FIELD_FORMATION.infantryHigh.y),
    ],
    40,
  ),
  mainBattleStage(
    9,
    "첫 기병대",
    "보병과 궁병을 지원하는 첫 기병 측면대를 상대하세요.",
    [
      infantrySquad(18, OPEN_FIELD_FORMATION.infantryCenter.x, OPEN_FIELD_FORMATION.infantryCenter.y),
      archerSquad(8, OPEN_FIELD_FORMATION.archerCenter.x, OPEN_FIELD_FORMATION.archerCenter.y),
      cavalrySquad(4, OPEN_FIELD_FORMATION.cavalryLow.x, OPEN_FIELD_FORMATION.cavalryLow.y),
    ],
    45,
  ),
  mainBattleStage(
    10,
    "삼병종 연합",
    "전열·후열·양익으로 역할을 나눈 연합 부대를 격파하세요.",
    [
      infantrySquad(20, OPEN_FIELD_FORMATION.infantryCenter.x, OPEN_FIELD_FORMATION.infantryCenter.y),
      archerSquad(10, OPEN_FIELD_FORMATION.archerCenter.x, OPEN_FIELD_FORMATION.archerCenter.y),
      cavalrySquad(3, OPEN_FIELD_FORMATION.cavalryLow.x, OPEN_FIELD_FORMATION.cavalryLow.y),
      cavalrySquad(3, OPEN_FIELD_FORMATION.cavalryHigh.x, OPEN_FIELD_FORMATION.cavalryHigh.y),
    ],
    50,
  ),
  mainBattleStage(
    11,
    "쌍열 방진",
    "두 보병 전열과 중앙 궁병 후열을 분리해 공략하세요.",
    [
      infantrySquad(16, OPEN_FIELD_FORMATION.infantryLow.x, OPEN_FIELD_FORMATION.infantryLow.y),
      infantrySquad(16, OPEN_FIELD_FORMATION.infantryHigh.x, OPEN_FIELD_FORMATION.infantryHigh.y),
      archerSquad(12, OPEN_FIELD_FORMATION.archerCenter.x, OPEN_FIELD_FORMATION.archerCenter.y),
    ],
    55,
  ),
  mainBattleStage(
    12,
    "기병의 쐐기",
    "양익 기병이 돌파하기 전에 중앙 전선을 정리하세요.",
    [
      infantrySquad(18, OPEN_FIELD_FORMATION.infantryLow.x, OPEN_FIELD_FORMATION.infantryLow.y),
      infantrySquad(18, OPEN_FIELD_FORMATION.infantryHigh.x, OPEN_FIELD_FORMATION.infantryHigh.y),
      archerSquad(10, OPEN_FIELD_FORMATION.archerCenter.x, OPEN_FIELD_FORMATION.archerCenter.y),
      cavalrySquad(3, OPEN_FIELD_FORMATION.cavalryLow.x, OPEN_FIELD_FORMATION.cavalryLow.y),
      cavalrySquad(3, OPEN_FIELD_FORMATION.cavalryHigh.x, OPEN_FIELD_FORMATION.cavalryHigh.y),
    ],
    60,
  ),
  mainBattleStage(
    13,
    "분산 포위망",
    "넓게 퍼진 전열과 기병 양익의 포위를 끊어내세요.",
    [
      infantrySquad(20, OPEN_FIELD_FORMATION.infantryLow.x, OPEN_FIELD_FORMATION.infantryLow.y),
      infantrySquad(20, OPEN_FIELD_FORMATION.infantryHigh.x, OPEN_FIELD_FORMATION.infantryHigh.y),
      archerSquad(14, OPEN_FIELD_FORMATION.archerCenter.x, OPEN_FIELD_FORMATION.archerCenter.y),
      cavalrySquad(4, OPEN_FIELD_FORMATION.cavalryLow.x, OPEN_FIELD_FORMATION.cavalryLow.y),
      cavalrySquad(4, OPEN_FIELD_FORMATION.cavalryHigh.x, OPEN_FIELD_FORMATION.cavalryHigh.y),
    ],
    65,
  ),
  mainBattleStage(
    14,
    "교차 사격선",
    "두 궁병 후열의 교차 사격과 양익 기병을 동시에 상대하세요.",
    [
      infantrySquad(22, OPEN_FIELD_FORMATION.infantryLow.x, OPEN_FIELD_FORMATION.infantryLow.y),
      infantrySquad(22, OPEN_FIELD_FORMATION.infantryHigh.x, OPEN_FIELD_FORMATION.infantryHigh.y),
      archerSquad(10, OPEN_FIELD_FORMATION.archerLow.x, OPEN_FIELD_FORMATION.archerLow.y),
      archerSquad(10, OPEN_FIELD_FORMATION.archerHigh.x, OPEN_FIELD_FORMATION.archerHigh.y),
      cavalrySquad(5, OPEN_FIELD_FORMATION.cavalryLow.x, OPEN_FIELD_FORMATION.cavalryLow.y),
      cavalrySquad(5, OPEN_FIELD_FORMATION.cavalryHigh.x, OPEN_FIELD_FORMATION.cavalryHigh.y),
    ],
    70,
  ),
  mainBattleStage(
    15,
    "철갑 돌파대",
    "강화된 전열을 묶어 두고 후열과 양익을 각개격파하세요.",
    [
      infantrySquad(26, OPEN_FIELD_FORMATION.infantryLow.x, OPEN_FIELD_FORMATION.infantryLow.y),
      infantrySquad(26, OPEN_FIELD_FORMATION.infantryHigh.x, OPEN_FIELD_FORMATION.infantryHigh.y),
      archerSquad(12, OPEN_FIELD_FORMATION.archerLow.x, OPEN_FIELD_FORMATION.archerLow.y),
      archerSquad(12, OPEN_FIELD_FORMATION.archerHigh.x, OPEN_FIELD_FORMATION.archerHigh.y),
      cavalrySquad(6, OPEN_FIELD_FORMATION.cavalryLow.x, OPEN_FIELD_FORMATION.cavalryLow.y),
      cavalrySquad(6, OPEN_FIELD_FORMATION.cavalryHigh.x, OPEN_FIELD_FORMATION.cavalryHigh.y),
    ],
    75,
  ),
  mainBattleStage(
    16,
    "양익 기병대",
    "보병과 궁병이 버티는 동안 양쪽에서 파고드는 기병을 차단하세요.",
    [
      infantrySquad(28, OPEN_FIELD_FORMATION.infantryLow.x, OPEN_FIELD_FORMATION.infantryLow.y),
      infantrySquad(28, OPEN_FIELD_FORMATION.infantryHigh.x, OPEN_FIELD_FORMATION.infantryHigh.y),
      archerSquad(13, OPEN_FIELD_FORMATION.archerLow.x, OPEN_FIELD_FORMATION.archerLow.y),
      archerSquad(13, OPEN_FIELD_FORMATION.archerHigh.x, OPEN_FIELD_FORMATION.archerHigh.y),
      cavalrySquad(10, OPEN_FIELD_FORMATION.cavalryLow.x, OPEN_FIELD_FORMATION.cavalryLow.y),
      cavalrySquad(10, OPEN_FIELD_FORMATION.cavalryHigh.x, OPEN_FIELD_FORMATION.cavalryHigh.y),
    ],
    80,
  ),
  mainBattleStage(
    17,
    "붉은 평원의 역습",
    "증원된 여섯 전투 소대의 동시 반격을 버텨내세요.",
    [
      infantrySquad(32, OPEN_FIELD_FORMATION.infantryLow.x, OPEN_FIELD_FORMATION.infantryLow.y),
      infantrySquad(32, OPEN_FIELD_FORMATION.infantryHigh.x, OPEN_FIELD_FORMATION.infantryHigh.y),
      archerSquad(15, OPEN_FIELD_FORMATION.archerLow.x, OPEN_FIELD_FORMATION.archerLow.y),
      archerSquad(15, OPEN_FIELD_FORMATION.archerHigh.x, OPEN_FIELD_FORMATION.archerHigh.y),
      cavalrySquad(11, OPEN_FIELD_FORMATION.cavalryLow.x, OPEN_FIELD_FORMATION.cavalryLow.y),
      cavalrySquad(11, OPEN_FIELD_FORMATION.cavalryHigh.x, OPEN_FIELD_FORMATION.cavalryHigh.y),
    ],
    85,
  ),
  mainBattleStage(
    18,
    "왕도 외곽전",
    "대규모 연합 전열을 돌파해 왕도로 향하는 길을 여세요.",
    [
      infantrySquad(36, OPEN_FIELD_FORMATION.infantryLow.x, OPEN_FIELD_FORMATION.infantryLow.y),
      infantrySquad(36, OPEN_FIELD_FORMATION.infantryHigh.x, OPEN_FIELD_FORMATION.infantryHigh.y),
      archerSquad(17, OPEN_FIELD_FORMATION.archerLow.x, OPEN_FIELD_FORMATION.archerLow.y),
      archerSquad(17, OPEN_FIELD_FORMATION.archerHigh.x, OPEN_FIELD_FORMATION.archerHigh.y),
      cavalrySquad(13, OPEN_FIELD_FORMATION.cavalryLow.x, OPEN_FIELD_FORMATION.cavalryLow.y),
      cavalrySquad(13, OPEN_FIELD_FORMATION.cavalryHigh.x, OPEN_FIELD_FORMATION.cavalryHigh.y),
    ],
    90,
  ),
  mainBattleStage(
    19,
    "근위 연합군",
    "왕국 근위대의 두꺼운 전열과 정예 양익을 무너뜨리세요.",
    [
      infantrySquad(40, OPEN_FIELD_FORMATION.infantryLow.x, OPEN_FIELD_FORMATION.infantryLow.y),
      infantrySquad(40, OPEN_FIELD_FORMATION.infantryHigh.x, OPEN_FIELD_FORMATION.infantryHigh.y),
      archerSquad(20, OPEN_FIELD_FORMATION.archerLow.x, OPEN_FIELD_FORMATION.archerLow.y),
      archerSquad(20, OPEN_FIELD_FORMATION.archerHigh.x, OPEN_FIELD_FORMATION.archerHigh.y),
      cavalrySquad(14, OPEN_FIELD_FORMATION.cavalryLow.x, OPEN_FIELD_FORMATION.cavalryLow.y),
      cavalrySquad(14, OPEN_FIELD_FORMATION.cavalryHigh.x, OPEN_FIELD_FORMATION.cavalryHigh.y),
    ],
    100,
  ),
  mainBattleStage(
    20,
    "최후의 군단",
    "최대 규모로 집결한 여섯 정예 소대를 격파하고 원정을 끝내세요.",
    [
      infantrySquad(45, OPEN_FIELD_FORMATION.infantryLow.x, OPEN_FIELD_FORMATION.infantryLow.y),
      infantrySquad(45, OPEN_FIELD_FORMATION.infantryHigh.x, OPEN_FIELD_FORMATION.infantryHigh.y),
      archerSquad(22, OPEN_FIELD_FORMATION.archerLow.x, OPEN_FIELD_FORMATION.archerLow.y),
      archerSquad(22, OPEN_FIELD_FORMATION.archerHigh.x, OPEN_FIELD_FORMATION.archerHigh.y),
      cavalrySquad(17, OPEN_FIELD_FORMATION.cavalryLow.x, OPEN_FIELD_FORMATION.cavalryLow.y),
      cavalrySquad(17, OPEN_FIELD_FORMATION.cavalryHigh.x, OPEN_FIELD_FORMATION.cavalryHigh.y),
    ],
    120,
  ),
];

function validateStages(stages: StageData[]) {
  stages.forEach((stage, index) => {
    if (stage.id !== index + 1) throw new Error(`스테이지 ID는 1부터 연속이어야 합니다. index=${index}`);
    if (stage.enemySquads.length === 0 || stage.enemySquads.length > MAX_ENEMY_AI_SQUADS) {
      throw new Error(`STAGE ${stage.id} 적군 스쿼드는 1..${MAX_ENEMY_AI_SQUADS}개여야 합니다.`);
    }

    for (const squad of stage.enemySquads) {
      if (!Number.isInteger(squad.count) || squad.count < 1 || squad.count > MAX_SQUAD_SIZE) {
        throw new Error(`STAGE ${stage.id} ${squad.role} 병력 수가 올바르지 않습니다.`);
      }
      if (
        !Number.isInteger(squad.spawnX) ||
        squad.spawnX < SPAWN_BOUNDS.minX ||
        squad.spawnX > SPAWN_BOUNDS.maxX ||
        !Number.isInteger(squad.spawnY) ||
        squad.spawnY < SPAWN_BOUNDS.minY ||
        squad.spawnY > SPAWN_BOUNDS.maxY
      ) {
        throw new Error(`STAGE ${stage.id} ${squad.role} 생성 좌표가 범위를 벗어났습니다.`);
      }
    }
  });
}

validateStages(STAGES);

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
