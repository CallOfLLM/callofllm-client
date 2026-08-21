import { createSquad, SPAWN_BOUNDS, TEAM_FLAG } from "../../../(lib)/_packet";
import {
  allySpawnPoint,
  squadSoldierCount,
  type DeploymentSquad,
  type StageDeployment,
} from "../../../(lib)/squadfuncs";
import { stageMapID, type SquadData, type StageData } from "../../../(lib)/stages";

const ENEMY_FORMATION_OFFSET = 160;

/** 서버가 CREATE 성공 응답으로 알려준 실제 ID와 준비 화면의 스쿼드를 묶은 값. */
export type AllySquad = DeploymentSquad & { squadID: number };

export type EnemySquadRole = "infantry" | "archer" | "cavalry";
export type EnemyUnitType = "WARRIOR" | "ARCHER" | "KNIGHT";

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

interface EnemyGroup {
  count: number;
  offsetX: number;
  offsetY: number;
  squad: EnemySquadSeed;
}

function getEnemyGroups(squad: SquadData, squadIndex: number): EnemyGroup[] {
  const flankDirection = squadIndex % 2 === 0 ? -1 : 1;

  return [
    {
      count: squad.warriorCount,
      offsetX: -ENEMY_FORMATION_OFFSET,
      offsetY: 0,
      squad: {
        teamFlag: TEAM_FLAG.ENEMY,
        role: "infantry",
        unitType: "WARRIOR",
        archerCount: 0,
        warriorCount: squad.warriorCount,
        knightCount: 0,
      },
    },
    {
      count: squad.archerCount,
      offsetX: ENEMY_FORMATION_OFFSET,
      offsetY: 0,
      squad: {
        teamFlag: TEAM_FLAG.ENEMY,
        role: "archer",
        unitType: "ARCHER",
        archerCount: squad.archerCount,
        warriorCount: 0,
        knightCount: 0,
      },
    },
    {
      count: squad.knightCount,
      offsetX: 0,
      offsetY: flankDirection * ENEMY_FORMATION_OFFSET,
      squad: {
        teamFlag: TEAM_FLAG.ENEMY,
        role: "cavalry",
        unitType: "KNIGHT",
        archerCount: 0,
        warriorCount: 0,
        knightCount: squad.knightCount,
      },
    },
  ];
}

function clampSpawn(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 전술 명령은 스쿼드 단위이므로 혼성 적군을 병종별 순수 스쿼드로 나눈다.
 * 적군의 진격 방향은 -X다. 보병은 전방, 궁병은 후방, 기병은 측면에 둔다.
 */
function buildEnemyStagePackets(stage: StageData): StagePacket[] {
  return stage.enemySquads.flatMap((squad, squadIndex) =>
    getEnemyGroups(squad, squadIndex)
      .filter((group) => group.count > 0)
      .map((group) => {
        const spawnX = clampSpawn(squad.spawnX + group.offsetX, SPAWN_BOUNDS.minX, SPAWN_BOUNDS.maxX);
        const spawnY = clampSpawn(squad.spawnY + group.offsetY, SPAWN_BOUNDS.minY, SPAWN_BOUNDS.maxY);
        const { archerCount, warriorCount, knightCount, unitType } = group.squad;

        return {
          label: `적군 ${squadIndex + 1} ${unitType}`,
          buffer: createSquad(archerCount, warriorCount, knightCount, TEAM_FLAG.ENEMY, spawnX, spawnY),
          pendingCreate: { kind: "enemy", squad: group.squad },
        };
      }),
  );
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

/** 병종별로 분리해 실제 생성될 적군 스쿼드 수를 계산한다. */
export function getExpectedEnemySquadCount(stage: StageData | null | undefined): number {
  if (!stage) return 0;

  return stage.enemySquads.reduce(
    (count, squad, squadIndex) => count + getEnemyGroups(squad, squadIndex).filter((group) => group.count > 0).length,
    0,
  );
}
