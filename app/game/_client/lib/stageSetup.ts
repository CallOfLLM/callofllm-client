import { createSquad, TEAM_FLAG } from "../../../(lib)/_packet";
import {
  allySpawnPoint,
  squadSoldierCount,
  type DeploymentSquad,
  type StageDeployment,
} from "../../../(lib)/squadfuncs";
import {
  stageMapID,
  type EnemySquadData,
  type EnemySquadRole as StageEnemySquadRole,
  type EnemyUnitType as StageEnemyUnitType,
  type StageData,
} from "../../../(lib)/stages";

/** 서버가 CREATE 성공 응답으로 알려준 실제 ID와 준비 화면의 스쿼드를 묶은 값. */
export type AllySquad = DeploymentSquad & { squadID: number };

export type EnemySquadRole = StageEnemySquadRole;
export type EnemyUnitType = StageEnemyUnitType;

export interface EnemySquadSeed {
  teamFlag: typeof TEAM_FLAG.ENEMY;
  role: EnemySquadRole;
  unitType: EnemyUnitType;
  warriorCount: number;
  archerCount: number;
  knightCount: number;
}

export type EnemySquad = EnemySquadSeed & { squadID: number };

export type PendingCreate =
  | { kind: "ally"; squad: DeploymentSquad }
  | { kind: "enemy"; squad: EnemySquadSeed };

export interface StagePacket {
  label: string;
  buffer: ArrayBuffer;
  pendingCreate: PendingCreate;
}

/**
 * V15 접속 절차. 순서를 어기면 서버가 INVALID_STATE(-4)로 거절하므로
 * 각 단계의 응답을 확인한 뒤 다음 단계로 넘어간다.
 */
export type SetupPhase =
  | "idle"
  | "resuming"
  | "selectingMap"
  | "startingStage"
  | "creatingSquads"
  | "ready"
  | "failed";

export const SETUP_PHASE_LABEL: Record<SetupPhase, string> = {
  idle: "서버 WELCOME 대기 중",
  resuming: "이전 세션에 다시 붙는 중",
  selectingMap: "맵을 선택하는 중",
  startingStage: "스테이지를 시작하는 중",
  creatingSquads: "부대를 배치하는 중",
  ready: "배치 완료",
  failed: "스테이지 준비 실패",
};

export interface StageSetup {
  phase: SetupPhase;
  stageID: number;
  /** SELECT_MAP으로 보낸 맵 ID. */
  mapID: number;
  /** SELECT_MAP의 Type 104 OK를 받았는지 여부. */
  mapCommandAccepted: boolean;
  /** 가장 최근 Type 106이 알려준 맵 ID. */
  confirmedMapID: number | null;
  /** 아직 보내지 않은 CREATE_SQUAD 패킷. */
  queue: StagePacket[];
  /** 서버가 OK로 받아 준 스쿼드 수. */
  createdCount: number;
  createdAllyCount: number;
  createdEnemyCount: number;
}

export function createIdleStageSetup(): StageSetup {
  return {
    phase: "idle",
    stageID: 0,
    mapID: 0,
    mapCommandAccepted: false,
    confirmedMapID: null,
    queue: [],
    createdCount: 0,
    createdAllyCount: 0,
    createdEnemyCount: 0,
  };
}

/** SELECT_MAP을 보내기 직전의 스테이지 준비 상태를 만든다. */
export function createStageSetup(stage: StageData, deployment: StageDeployment | null): StageSetup {
  return {
    phase: "selectingMap",
    stageID: stage.id,
    mapID: stageMapID(stage),
    mapCommandAccepted: false,
    confirmedMapID: null,
    queue: buildStagePackets(stage, deployment),
    createdCount: 0,
    createdAllyCount: 0,
    createdEnemyCount: 0,
  };
}

/** 데이터의 순수 병종 스쿼드를 서버 생성용 카운트로 변환한다. */
function enemySquadSeed(squad: EnemySquadData): EnemySquadSeed {
  return {
    teamFlag: TEAM_FLAG.ENEMY,
    role: squad.role,
    unitType: squad.unitType,
    archerCount: squad.unitType === "ARCHER" ? squad.count : 0,
    warriorCount: squad.unitType === "WARRIOR" ? squad.count : 0,
    knightCount: squad.unitType === "KNIGHT" ? squad.count : 0,
  };
}

/** 스테이지 정의 하나가 서버 스쿼드 하나와 적군 AI 명령 대상 하나에 그대로 대응한다. */
function buildEnemyStagePackets(stage: StageData): StagePacket[] {
  return stage.enemySquads.map((squad, squadIndex) => {
    const seed = enemySquadSeed(squad);

    return {
      label: `적군 ${squadIndex + 1} ${seed.unitType}`,
      buffer: createSquad(
        seed.archerCount,
        seed.warriorCount,
        seed.knightCount,
        TEAM_FLAG.ENEMY,
        squad.spawnX,
        squad.spawnY,
      ),
      pendingCreate: { kind: "enemy", squad: seed },
    };
  });
}

/**
 * 튜토리얼은 스테이지의 고정 편성을, 일반 스테이지는 준비 화면에서 저장한 편성을 쓴다.
 * 적군은 언제나 스테이지 정의를 따른다.
 */
export function buildStagePackets(stage: StageData, deployment: StageDeployment | null): StagePacket[] {
  const mapID = stageMapID(stage);
  const deployedAllies = (deployment?.squads ?? [])
    .filter((squad) => squadSoldierCount(squad) > 0)
    .map((squad, index) => ({ ...squad, ...allySpawnPoint(index, mapID) }));
  const allies = stage.allySquads ?? deployedAllies;

  const allyPackets: StagePacket[] = allies.map(({ spawnX, spawnY, ...squad }) => ({
    label: squad.name,
    buffer: createSquad(squad.archer, squad.warrior, squad.knight, TEAM_FLAG.ALLY, spawnX, spawnY),
    pendingCreate: { kind: "ally", squad },
  }));

  return [...allyPackets, ...buildEnemyStagePackets(stage)];
}

/** 스테이지 데이터와 실제 생성되는 적군 스쿼드는 1:1이다. */
export function getExpectedEnemySquadCount(stage: StageData | null | undefined): number {
  return stage?.enemySquads.length ?? 0;
}
