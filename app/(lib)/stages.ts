// 스테이지 정의 — 선택 화면 메타, 아군/적군 초기 배치, 승패 조건을 한곳에서 관리한다.
// squadID는 서버가 팀별로 0부터 발급하므로 여기에 넣지 않는다.

import {
  MAP_BOUNDS,
  MAX_SQUAD_SIZE,
  SANDBOX_MAP_ID,
  SPAWN_BOUNDS,
} from "./_packet";

/** 맵 정중앙. 고정 아군의 배치 앵커다. */
export const MAP_CENTER = {
  x: Math.floor((MAP_BOUNDS.minX + MAP_BOUNDS.maxX) / 2),
  y: Math.floor((MAP_BOUNDS.minY + MAP_BOUNDS.maxY) / 2),
} as const;

const PLAYABLE_STAGE_COUNT = 20;
const PLAYABLE_MAP_ID = 1;
const NEARBY_ENEMY_FORWARD_OFFSET = 450;
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

/** 준비 화면을 건너뛰고 사용할 고정 아군 스쿼드. */
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
  /** 있으면 준비 화면을 건너뛰고 이 편성을 그대로 배치한다. 없으면 준비 화면 편성을 쓴다. */
  allySquads?: FixedAllySquad[];
  enemySquads: EnemySquadData[];
  objective: Objective;
  /** 첫 클리어 시 지급하는 골드 */
  rewardGold: number;
}

/** Map 1 중앙의 검증된 바닥 좌표에 고정 아군을 배치한다. */
function centerSquad(warrior: number, archer = 0, knight = 0): FixedAllySquad {
  return { name: "1소대", warrior, archer, knight, spawnX: MAP_CENTER.x, spawnY: MAP_CENTER.y };
}

function infantrySquad(count: number, spawnX: number, spawnY: number): EnemySquadData {
  return { role: "infantry", unitType: "WARRIOR", count, spawnX, spawnY };
}

/** 임시 플레이 구성을 위해 모든 ID에 스테이지 1의 소규모 전투를 복제한다. */
function stageOneCopy(id: number): StageData {
  return {
    id,
    title: "이동과 첫 공격",
    description: "고정 부대로 이동과 공격 명령을 사용해 소규모 전투를 마무리하세요.",
    mapID: PLAYABLE_MAP_ID,
    allySquads: [centerSquad(20)],
    enemySquads: [infantrySquad(10, MAP_CENTER.x + NEARBY_ENEMY_FORWARD_OFFSET, MAP_CENTER.y)],
    objective: {
      label: "적군 10명을 모두 처치하세요. 적군이 전멸하면 즉시 클리어됩니다.",
      hintCommand: "모두 공격!",
    },
    rewardGold: 10,
  };
}

export const STAGES: StageData[] = Array.from(
  { length: PLAYABLE_STAGE_COUNT },
  (_, index) => stageOneCopy(index + 1),
);

function validateStages(stages: StageData[]) {
  stages.forEach((stage, index) => {
    if (stage.id !== index + 1) throw new Error(`스테이지 ID는 1부터 연속이어야 합니다. index=${index}`);
    if (stage.mapID !== PLAYABLE_MAP_ID) {
      throw new Error(`STAGE ${stage.id}는 임시 플레이 맵 ${PLAYABLE_MAP_ID}을 사용해야 합니다.`);
    }
    if (!stage.allySquads || stage.allySquads.length === 0) {
      throw new Error(`STAGE ${stage.id}에 고정 아군 스쿼드가 필요합니다.`);
    }
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
