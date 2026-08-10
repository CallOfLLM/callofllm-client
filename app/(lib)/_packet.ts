// CLIENT_PACKET_SPEC_V15.md 기준 바이너리 직렬화/역직렬화

export const PROTOCOL_VERSION = 15;
export const HEADER_SIZE = 8;
export const SOLDIER_SIZE = 32;
export const MAX_SQUAD_SIZE = 200;

/** 한 세션에 만들 수 있는 스쿼드 수와 병사 수 상한 */
export const MAX_SESSION_SQUADS = 128;
export const MAX_SESSION_SOLDIERS = 2_000;

/** 서버 내장 sandbox 맵. 장애물이 없어 어떤 좌표에도 스쿼드를 놓을 수 있다. */
export const SANDBOX_MAP_ID = 0;

/** maps/Map_00#_map_640x320.json으로 등록된 외부 맵 ID */
export const EXTERNAL_MAP_IDS = [1, 2, 3] as const;

export const MAP_BOUNDS = {
  minX: 0,
  maxX: 6399,
  minY: 0,
  maxY: 3199,
} as const;

export const SPAWN_BOUNDS = {
  minX: 4,
  maxX: 6395,
  minY: 4,
  maxY: 3195,
} as const;

export const TEAM_FLAG = {
  ALLY: 0,
  ENEMY: 1,
} as const;

export type TeamFlag = (typeof TEAM_FLAG)[keyof typeof TEAM_FLAG];

export const SOLDIER_STATE = {
  IDLE: 0,
  MOVING: 1,
  CHASING: 2,
  ATTACKING: 3,
  DEAD: 4,
  HIT: 5,
  FORMING: 6,
} as const;

export type SoldierState = (typeof SOLDIER_STATE)[keyof typeof SOLDIER_STATE];

/**
 * V15의 direction은 0..359도 정수다. 0=+X, 90=+Y, 180=-X, 270=-Y이며 +Y 쪽으로 각도가 커진다.
 * V11까지 쓰던 0..7 8방향 코드가 아니므로 인덱스 테이블로 해석하면 안 된다.
 */
export const DIRECTION_DEGREE = {
  POSITIVE_X: 0,
  POSITIVE_Y: 90,
  NEGATIVE_X: 180,
  NEGATIVE_Y: 270,
} as const;

/** direction(도)을 서버 평면의 단위 벡터로 바꾼다. */
export function directionToVector(direction: number): { x: number; y: number } {
  const radian = (direction * Math.PI) / 180;
  return { x: Math.cos(radian), y: Math.sin(radian) };
}

export const COMMAND_RESULT_CODE = {
  OK: 0,
  INVALID_PAYLOAD: -1,
  NOT_OWNER: -2,
  NOT_FOUND: -3,
  INVALID_STATE: -4,
  PATH_NOT_FOUND: -5,
  LIMIT_EXCEEDED: -6,
} as const;

export const STAGE_STATE = {
  WAITING: 0,
  RUNNING: 1,
  ALLY_WIN: 2,
  ENEMY_WIN: 3,
  DRAW: 4,
} as const;

export const PKT = {
  CS_CREATE_SQUAD: 0,
  CS_MOVE_SQUAD: 1,
  CS_ATTACK_SQUAD: 2,
  CS_TRANSFER_SOLDIER: 3,
  CS_STOP_SQUAD: 4,
  CS_SWAP_SOLDIER_POSITION: 5,
  CS_FOCUS_ATTACK: 6,
  CS_SET_ATTACK_DAMAGE: 7,
  CS_MOVE_ENGAGE_ON_SIGHT: 8,
  CS_MOVE_FIRE_IN_RANGE: 9,
  CS_RESUME_SESSION: 10,
  CS_SELECT_MAP: 11,
  CS_START_STAGE: 12,
  SC_SOLDIER_POSITIONS: 100,
  SC_WELCOME: 101,
  SC_RESERVED_102: 102,
  SC_RESERVED_103: 103,
  SC_COMMAND_RESULT: 104,
  SC_STAGE_STATE: 105,
  SC_MAP_INFO: 106,
} as const;

export const PKT_NAME: Record<number, string> = {
  [PKT.CS_CREATE_SQUAD]: "CREATE_SQUAD",
  [PKT.CS_MOVE_SQUAD]: "MOVE_SQUAD",
  [PKT.CS_ATTACK_SQUAD]: "ATTACK_SQUAD",
  [PKT.CS_TRANSFER_SOLDIER]: "TRANSFER_SOLDIER",
  [PKT.CS_STOP_SQUAD]: "STOP_SQUAD",
  [PKT.CS_SWAP_SOLDIER_POSITION]: "SWAP_SOLDIER_POSITION",
  [PKT.CS_FOCUS_ATTACK]: "FOCUS_ATTACK",
  [PKT.CS_SET_ATTACK_DAMAGE]: "SET_ATTACK_DAMAGE",
  [PKT.CS_MOVE_ENGAGE_ON_SIGHT]: "MOVE_ENGAGE_ON_SIGHT",
  [PKT.CS_MOVE_FIRE_IN_RANGE]: "MOVE_FIRE_IN_RANGE",
  [PKT.CS_RESUME_SESSION]: "RESUME_SESSION",
  [PKT.CS_SELECT_MAP]: "SELECT_MAP",
  [PKT.CS_START_STAGE]: "START_STAGE",
  [PKT.SC_SOLDIER_POSITIONS]: "SOLDIER_POSITIONS",
  [PKT.SC_WELCOME]: "WELCOME",
  [PKT.SC_RESERVED_102]: "RESERVED_102",
  [PKT.SC_RESERVED_103]: "RESERVED_103",
  [PKT.SC_COMMAND_RESULT]: "COMMAND_RESULT",
  [PKT.SC_STAGE_STATE]: "STAGE_STATE",
  [PKT.SC_MAP_INFO]: "MAP_INFO",
};

/** OpenAI API와 게임 클라이언트가 JSON으로 주고받는 단일 게임 명령. */
export type PacketData =
  | {
      packetType: "CREATE_SQUAD";
      archerCount: number;
      warriorCount: number;
      knightCount: number;
      teamFlag: TeamFlag;
      spawnX: number;
      spawnY: number;
    }
  | {
      packetType: "MOVE_SQUAD";
      squadID: number;
      teamFlag: TeamFlag;
      destinationX: number;
      destinationY: number;
    }
  | { packetType: "ATTACK_SQUAD"; squadID: number; teamFlag: TeamFlag }
  | {
      packetType: "TRANSFER_SOLDIER";
      teamFlag: TeamFlag;
      soldierID: number;
      currentSquadID: number;
      nextSquadID: number;
    }
  | { packetType: "STOP_SQUAD"; teamFlag: TeamFlag; squadID: number }
  | {
      packetType: "SWAP_SOLDIER_POSITION";
      teamFlag: TeamFlag;
      squadID: number;
      firstSoldierID: number;
      secondSoldierID: number;
    }
  | {
      packetType: "FOCUS_ATTACK";
      ownTeamFlag: TeamFlag;
      ownSquadID: number;
      targetTeamFlag: TeamFlag;
      targetSquadID: number;
    }
  | {
      packetType: "SET_ATTACK_DAMAGE";
      teamFlag: TeamFlag;
      squadID: number;
      soldierID: number;
      attackDamage: number;
    }
  | {
      packetType: "MOVE_ENGAGE_ON_SIGHT";
      teamFlag: TeamFlag;
      squadID: number;
      destinationX: number;
      destinationY: number;
    }
  | {
      packetType: "MOVE_FIRE_IN_RANGE";
      teamFlag: TeamFlag;
      squadID: number;
      destinationX: number;
      destinationY: number;
    };

const TEAM_FLAG_SCHEMA = { type: "integer", enum: [TEAM_FLAG.ALLY, TEAM_FLAG.ENEMY] } as const;
const ID_SCHEMA = { type: "integer", minimum: 0, maximum: 0x7fffffff } as const;

/** Structured Outputs에서 사용하는 PacketData JSON Schema. */
export const PACKET_DATA_JSON_SCHEMA = {
  anyOf: [
    {
      type: "object",
      properties: {
        packetType: { type: "string", enum: ["CREATE_SQUAD"] },
        archerCount: { type: "integer", minimum: 0, maximum: MAX_SQUAD_SIZE },
        warriorCount: { type: "integer", minimum: 0, maximum: MAX_SQUAD_SIZE },
        knightCount: { type: "integer", minimum: 0, maximum: MAX_SQUAD_SIZE },
        teamFlag: TEAM_FLAG_SCHEMA,
        spawnX: { type: "integer", minimum: SPAWN_BOUNDS.minX, maximum: SPAWN_BOUNDS.maxX },
        spawnY: { type: "integer", minimum: SPAWN_BOUNDS.minY, maximum: SPAWN_BOUNDS.maxY },
      },
      required: ["packetType", "archerCount", "warriorCount", "knightCount", "teamFlag", "spawnX", "spawnY"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        packetType: { type: "string", enum: ["MOVE_SQUAD"] },
        squadID: ID_SCHEMA,
        teamFlag: TEAM_FLAG_SCHEMA,
        destinationX: { type: "integer", minimum: MAP_BOUNDS.minX, maximum: MAP_BOUNDS.maxX },
        destinationY: { type: "integer", minimum: MAP_BOUNDS.minY, maximum: MAP_BOUNDS.maxY },
      },
      required: ["packetType", "squadID", "teamFlag", "destinationX", "destinationY"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        packetType: { type: "string", enum: ["ATTACK_SQUAD"] },
        squadID: ID_SCHEMA,
        teamFlag: TEAM_FLAG_SCHEMA,
      },
      required: ["packetType", "squadID", "teamFlag"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        packetType: { type: "string", enum: ["TRANSFER_SOLDIER"] },
        teamFlag: TEAM_FLAG_SCHEMA,
        soldierID: ID_SCHEMA,
        currentSquadID: ID_SCHEMA,
        nextSquadID: ID_SCHEMA,
      },
      required: ["packetType", "teamFlag", "soldierID", "currentSquadID", "nextSquadID"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        packetType: { type: "string", enum: ["STOP_SQUAD"] },
        teamFlag: TEAM_FLAG_SCHEMA,
        squadID: ID_SCHEMA,
      },
      required: ["packetType", "teamFlag", "squadID"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        packetType: { type: "string", enum: ["SWAP_SOLDIER_POSITION"] },
        teamFlag: TEAM_FLAG_SCHEMA,
        squadID: ID_SCHEMA,
        firstSoldierID: ID_SCHEMA,
        secondSoldierID: ID_SCHEMA,
      },
      required: ["packetType", "teamFlag", "squadID", "firstSoldierID", "secondSoldierID"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        packetType: { type: "string", enum: ["FOCUS_ATTACK"] },
        ownTeamFlag: TEAM_FLAG_SCHEMA,
        ownSquadID: ID_SCHEMA,
        targetTeamFlag: TEAM_FLAG_SCHEMA,
        targetSquadID: ID_SCHEMA,
      },
      required: ["packetType", "ownTeamFlag", "ownSquadID", "targetTeamFlag", "targetSquadID"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        packetType: { type: "string", enum: ["SET_ATTACK_DAMAGE"] },
        teamFlag: TEAM_FLAG_SCHEMA,
        squadID: ID_SCHEMA,
        soldierID: ID_SCHEMA,
        attackDamage: { type: "integer", minimum: 1, maximum: 0x7fffffff },
      },
      required: ["packetType", "teamFlag", "squadID", "soldierID", "attackDamage"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        packetType: { type: "string", enum: ["MOVE_ENGAGE_ON_SIGHT"] },
        teamFlag: TEAM_FLAG_SCHEMA,
        squadID: ID_SCHEMA,
        destinationX: { type: "integer", minimum: MAP_BOUNDS.minX, maximum: MAP_BOUNDS.maxX },
        destinationY: { type: "integer", minimum: MAP_BOUNDS.minY, maximum: MAP_BOUNDS.maxY },
      },
      required: ["packetType", "teamFlag", "squadID", "destinationX", "destinationY"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        packetType: { type: "string", enum: ["MOVE_FIRE_IN_RANGE"] },
        teamFlag: TEAM_FLAG_SCHEMA,
        squadID: ID_SCHEMA,
        destinationX: { type: "integer", minimum: MAP_BOUNDS.minX, maximum: MAP_BOUNDS.maxX },
        destinationY: { type: "integer", minimum: MAP_BOUNDS.minY, maximum: MAP_BOUNDS.maxY },
      },
      required: ["packetType", "teamFlag", "squadID", "destinationX", "destinationY"],
      additionalProperties: false,
    },
    { type: "null" },
  ],
} as const;

const LITTLE_ENDIAN = true;
const MAX_INT32 = 0x7fffffff;
const COUNT_OFFSET = HEADER_SIZE;
const BODY_OFFSET = HEADER_SIZE + 4;

function assertIntegerInRange(name: string, value: number, min: number, max: number) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} 값은 ${min}~${max} 범위의 정수여야 합니다. (현재: ${value})`);
  }
}

function assertID(name: string, value: number) {
  assertIntegerInRange(name, value, 0, MAX_INT32);
}

function assertTeamFlag(teamFlag: number): asserts teamFlag is TeamFlag {
  assertIntegerInRange("teamFlag", teamFlag, TEAM_FLAG.ALLY, TEAM_FLAG.ENEMY);
}

/** 헤더와 모든 int32 필드를 little-endian으로 직렬화한다. */
function build(pktType: number, fields: number[]): ArrayBuffer {
  const pktLen = HEADER_SIZE + fields.length * 4;
  const buf = new ArrayBuffer(pktLen);
  const view = new DataView(buf);

  view.setInt32(0, pktType, LITTLE_ENDIAN);
  view.setInt32(4, pktLen, LITTLE_ENDIAN);
  fields.forEach((value, index) => view.setInt32(HEADER_SIZE + index * 4, value, LITTLE_ENDIAN));

  return buf;
}

/** Type 0, 32 bytes — 병종 구성, 팀, 생성 앵커를 지정해 스쿼드를 생성한다. */
export function createSquad(
  archerCount: number,
  warriorCount: number,
  knightCount: number,
  teamFlag: TeamFlag,
  spawnX: number,
  spawnY: number,
): ArrayBuffer {
  assertIntegerInRange("archerCount", archerCount, 0, MAX_SQUAD_SIZE);
  assertIntegerInRange("warriorCount", warriorCount, 0, MAX_SQUAD_SIZE);
  assertIntegerInRange("knightCount", knightCount, 0, MAX_SQUAD_SIZE);

  const totalCount = archerCount + warriorCount + knightCount;
  assertIntegerInRange("전체 병사 수", totalCount, 1, MAX_SQUAD_SIZE);
  assertTeamFlag(teamFlag);
  assertIntegerInRange("spawnX", spawnX, SPAWN_BOUNDS.minX, SPAWN_BOUNDS.maxX);
  assertIntegerInRange("spawnY", spawnY, SPAWN_BOUNDS.minY, SPAWN_BOUNDS.maxY);

  return build(PKT.CS_CREATE_SQUAD, [archerCount, warriorCount, knightCount, teamFlag, spawnX, spawnY]);
}

/** Type 1, 24 bytes — 지정한 팀의 스쿼드를 목적지로 이동시킨다. */
export function moveSquad(squadID: number, teamFlag: TeamFlag, destinationX: number, destinationY: number): ArrayBuffer {
  assertID("squadID", squadID);
  assertTeamFlag(teamFlag);
  assertIntegerInRange("destinationX", destinationX, MAP_BOUNDS.minX, MAP_BOUNDS.maxX);
  assertIntegerInRange("destinationY", destinationY, MAP_BOUNDS.minY, MAP_BOUNDS.maxY);
  return build(PKT.CS_MOVE_SQUAD, [squadID, teamFlag, destinationX, destinationY]);
}

/** Type 2, 16 bytes — 지정한 팀의 스쿼드가 가장 가까운 적을 자동 공격한다. */
export function attackSquad(squadID: number, teamFlag: TeamFlag): ArrayBuffer {
  assertID("squadID", squadID);
  assertTeamFlag(teamFlag);
  return build(PKT.CS_ATTACK_SQUAD, [squadID, teamFlag]);
}

/** Type 3, 24 bytes — 같은 팀 안에서 병사 한 명을 다른 스쿼드로 편입한다. */
export function transferSoldier(teamFlag: TeamFlag, soldierID: number, currentSquadID: number, nextSquadID: number): ArrayBuffer {
  assertTeamFlag(teamFlag);
  assertID("soldierID", soldierID);
  assertID("currentSquadID", currentSquadID);
  assertID("nextSquadID", nextSquadID);
  if (currentSquadID === nextSquadID) throw new RangeError("원본 스쿼드와 대상 스쿼드는 달라야 합니다.");
  return build(PKT.CS_TRANSFER_SOLDIER, [teamFlag, soldierID, currentSquadID, nextSquadID]);
}

/** Type 4, 16 bytes — 지정한 팀 스쿼드의 현재 행동을 취소하고 정지한다. */
export function stopSquad(teamFlag: TeamFlag, squadID: number): ArrayBuffer {
  assertTeamFlag(teamFlag);
  assertID("squadID", squadID);
  return build(PKT.CS_STOP_SQUAD, [teamFlag, squadID]);
}

/** Type 5, 24 bytes — STOP 상태인 지정 팀 스쿼드의 두 병사 위치를 맞바꾼다. */
export function swapSoldierPosition(teamFlag: TeamFlag, squadID: number, firstSoldierID: number, secondSoldierID: number): ArrayBuffer {
  assertTeamFlag(teamFlag);
  assertID("squadID", squadID);
  assertID("firstSoldierID", firstSoldierID);
  assertID("secondSoldierID", secondSoldierID);
  if (firstSoldierID === secondSoldierID) throw new RangeError("서로 다른 두 병사를 선택해야 합니다.");
  return build(PKT.CS_SWAP_SOLDIER_POSITION, [teamFlag, squadID, firstSoldierID, secondSoldierID]);
}

/** Type 6, 24 bytes — 상대 팀의 지정 스쿼드만 집중 공격한다. */
export function focusAttack(ownTeamFlag: TeamFlag, ownSquadID: number, targetTeamFlag: TeamFlag, targetSquadID: number): ArrayBuffer {
  assertTeamFlag(ownTeamFlag);
  assertID("ownSquadID", ownSquadID);
  assertTeamFlag(targetTeamFlag);
  assertID("targetSquadID", targetSquadID);
  if (ownTeamFlag === targetTeamFlag) throw new RangeError("집중 공격 대상은 상대 팀이어야 합니다.");
  return build(PKT.CS_FOCUS_ATTACK, [ownTeamFlag, ownSquadID, targetTeamFlag, targetSquadID]);
}

/** Type 7, 24 bytes — 지정한 병사의 공격력을 설정한다. */
export function setAttackDamage(teamFlag: TeamFlag, squadID: number, soldierID: number, attackDamage: number): ArrayBuffer {
  assertTeamFlag(teamFlag);
  assertID("squadID", squadID);
  assertID("soldierID", soldierID);
  assertIntegerInRange("attackDamage", attackDamage, 1, 1_000_000);
  return build(PKT.CS_SET_ATTACK_DAMAGE, [teamFlag, squadID, soldierID, attackDamage]);
}

/** Type 8, 24 bytes — 이동 중 적을 발견하면 목적지를 포기하고 일반 공격으로 전환한다. */
export function moveEngageOnSight(teamFlag: TeamFlag, squadID: number, destinationX: number, destinationY: number): ArrayBuffer {
  assertTeamFlag(teamFlag);
  assertID("squadID", squadID);
  assertIntegerInRange("destinationX", destinationX, MAP_BOUNDS.minX, MAP_BOUNDS.maxX);
  assertIntegerInRange("destinationY", destinationY, MAP_BOUNDS.minY, MAP_BOUNDS.maxY);
  return build(PKT.CS_MOVE_ENGAGE_ON_SIGHT, [teamFlag, squadID, destinationX, destinationY]);
}

/** Type 9, 24 bytes — 이동을 계속하면서 현재 공격 사거리 안의 적만 공격한다. */
export function moveFireInRange(teamFlag: TeamFlag, squadID: number, destinationX: number, destinationY: number): ArrayBuffer {
  assertTeamFlag(teamFlag);
  assertID("squadID", squadID);
  assertIntegerInRange("destinationX", destinationX, MAP_BOUNDS.minX, MAP_BOUNDS.maxX);
  assertIntegerInRange("destinationY", destinationY, MAP_BOUNDS.minY, MAP_BOUNDS.maxY);
  return build(PKT.CS_MOVE_FIRE_IN_RANGE, [teamFlag, squadID, destinationX, destinationY]);
}

/** Type 10, 12 bytes — 끊어진 논리 세션에 다시 붙는다. 새 연결에서 가장 먼저 보낸다. */
export function resumeSession(previousSessionID: number): ArrayBuffer {
  assertID("previousSessionID", previousSessionID);
  return build(PKT.CS_RESUME_SESSION, [previousSessionID]);
}

/** Type 11, 12 bytes — START_STAGE 전, 병사가 없을 때만 정적 Grid를 고른다. */
export function selectMap(mapID: number): ArrayBuffer {
  assertID("mapID", mapID);
  return build(PKT.CS_SELECT_MAP, [mapID]);
}

/** Type 12, 8 bytes — 선택한 맵을 확정해 잠근다. payload가 없는 헤더 전용 패킷이다. */
export function startStage(): ArrayBuffer {
  return build(PKT.CS_START_STAGE, []);
}

/** API가 반환한 PacketData를 검증하면서 V15 바이너리 패킷으로 변환한다. */
export function packetDataToBuffer(packetData: unknown): ArrayBuffer {
  if (typeof packetData !== "object" || packetData === null || Array.isArray(packetData)) {
    throw new TypeError("packetData는 게임 명령 JSON 객체여야 합니다.");
  }

  const data = packetData as Record<string, unknown>;
  switch (data.packetType) {
    case "CREATE_SQUAD":
      return createSquad(
        data.archerCount as number,
        data.warriorCount as number,
        data.knightCount as number,
        data.teamFlag as TeamFlag,
        data.spawnX as number,
        data.spawnY as number,
      );
    case "MOVE_SQUAD":
      return moveSquad(data.squadID as number, data.teamFlag as TeamFlag, data.destinationX as number, data.destinationY as number);
    case "ATTACK_SQUAD":
      return attackSquad(data.squadID as number, data.teamFlag as TeamFlag);
    case "TRANSFER_SOLDIER":
      return transferSoldier(data.teamFlag as TeamFlag, data.soldierID as number, data.currentSquadID as number, data.nextSquadID as number);
    case "STOP_SQUAD":
      return stopSquad(data.teamFlag as TeamFlag, data.squadID as number);
    case "SWAP_SOLDIER_POSITION":
      return swapSoldierPosition(data.teamFlag as TeamFlag, data.squadID as number, data.firstSoldierID as number, data.secondSoldierID as number);
    case "FOCUS_ATTACK":
      return focusAttack(data.ownTeamFlag as TeamFlag, data.ownSquadID as number, data.targetTeamFlag as TeamFlag, data.targetSquadID as number);
    case "SET_ATTACK_DAMAGE":
      return setAttackDamage(data.teamFlag as TeamFlag, data.squadID as number, data.soldierID as number, data.attackDamage as number);
    case "MOVE_ENGAGE_ON_SIGHT":
      return moveEngageOnSight(data.teamFlag as TeamFlag, data.squadID as number, data.destinationX as number, data.destinationY as number);
    case "MOVE_FIRE_IN_RANGE":
      return moveFireInRange(data.teamFlag as TeamFlag, data.squadID as number, data.destinationX as number, data.destinationY as number);
    default:
      throw new TypeError(`지원하지 않는 packetType입니다. (현재: ${String(data.packetType)})`);
  }
}

export interface Soldier {
  squadID: number;
  soldierID: number;
  teamFlag: TeamFlag;
  posX: number;
  posY: number;
  hp: number;
  state: SoldierState;
  /** 0..359도. 0=+X, 90=+Y다. */
  direction: number;
}

export interface SoldierSnapshot {
  pktType: typeof PKT.SC_SOLDIER_POSITIONS;
  pktLen: number;
  soldierCount: number;
  soldiers: Soldier[];
}

export interface WelcomePacket {
  pktType: typeof PKT.SC_WELCOME;
  pktLen: number;
  protocolVersion: number;
  sessionID: number;
  serverTickMs: number;
  /** 논리 세션을 보관해 주는 시간(ms). 서버가 알려준 값을 그대로 쓴다. */
  reconnectTimeoutMs: number;
}

export interface CommandResultPacket {
  pktType: typeof PKT.SC_COMMAND_RESULT;
  pktLen: number;
  requestPacketType: number;
  resultCode: number;
  teamFlag: number;
  entityID: number;
}

export interface StageStatePacket {
  pktType: typeof PKT.SC_STAGE_STATE;
  pktLen: number;
  stageState: number;
  aliveAllyCount: number;
  aliveEnemyCount: number;
}

export interface MapInfoPacket {
  pktType: typeof PKT.SC_MAP_INFO;
  pktLen: number;
  mapID: number;
  mapVersion: number;
  worldWidth: number;
  worldHeight: number;
  gridCellSize: number;
}

export type ServerPacket = SoldierSnapshot | WelcomePacket | CommandResultPacket | StageStatePacket | MapInfoPacket;

function getFixedPacketView(buf: ArrayBuffer, expectedType: number, expectedLength: number): DataView | null {
  if (buf.byteLength !== expectedLength) return null;
  const view = new DataView(buf);
  if (view.getInt32(0, LITTLE_ENDIAN) !== expectedType) return null;
  if (view.getInt32(4, LITTLE_ENDIAN) !== expectedLength) return null;
  return view;
}

/** Type 100 스냅샷을 파싱하고 타입, 헤더 길이, 레코드 길이를 모두 검증한다. */
export function parseSoldierSnapshot(buf: ArrayBuffer): SoldierSnapshot | null {
  if (buf.byteLength < BODY_OFFSET) return null;

  const view = new DataView(buf);
  const pktType = view.getInt32(0, LITTLE_ENDIAN);
  const pktLen = view.getInt32(4, LITTLE_ENDIAN);
  const soldierCount = view.getInt32(COUNT_OFFSET, LITTLE_ENDIAN);

  if (pktType !== PKT.SC_SOLDIER_POSITIONS) return null;
  if (pktLen !== buf.byteLength || soldierCount < 0) return null;
  if (BODY_OFFSET + soldierCount * SOLDIER_SIZE !== buf.byteLength) return null;

  const soldiers: Soldier[] = [];
  for (let i = 0; i < soldierCount; i++) {
    const offset = BODY_OFFSET + i * SOLDIER_SIZE;
    const teamFlag = view.getInt32(offset + 8, LITTLE_ENDIAN);
    const state = view.getInt32(offset + 24, LITTLE_ENDIAN);
    const direction = view.getInt32(offset + 28, LITTLE_ENDIAN);
    if (teamFlag < TEAM_FLAG.ALLY || teamFlag > TEAM_FLAG.ENEMY) return null;
    if (state < SOLDIER_STATE.IDLE || state > SOLDIER_STATE.FORMING) return null;

    soldiers.push({
      squadID: view.getInt32(offset, LITTLE_ENDIAN),
      soldierID: view.getInt32(offset + 4, LITTLE_ENDIAN),
      teamFlag: teamFlag as TeamFlag,
      posX: view.getInt32(offset + 12, LITTLE_ENDIAN),
      posY: view.getInt32(offset + 16, LITTLE_ENDIAN),
      hp: view.getInt32(offset + 20, LITTLE_ENDIAN),
      state: state as SoldierState,
      direction,
    });
  }

  return { pktType, pktLen, soldierCount, soldiers };
}

/** V15 활성 서버 패킷(Type 100, 101, 104, 105, 106)을 판별하고 길이를 검증한다. */
export function parseServerPacket(buf: ArrayBuffer): ServerPacket | null {
  if (buf.byteLength < HEADER_SIZE) return null;

  const header = new DataView(buf);
  const pktType = header.getInt32(0, LITTLE_ENDIAN);
  const pktLen = header.getInt32(4, LITTLE_ENDIAN);
  if (pktLen !== buf.byteLength) return null;

  if (pktType === PKT.SC_SOLDIER_POSITIONS) return parseSoldierSnapshot(buf);

  if (pktType === PKT.SC_WELCOME) {
    const view = getFixedPacketView(buf, PKT.SC_WELCOME, 24);
    if (!view) return null;
    return {
      pktType: PKT.SC_WELCOME,
      pktLen,
      protocolVersion: view.getInt32(8, LITTLE_ENDIAN),
      sessionID: view.getInt32(12, LITTLE_ENDIAN),
      serverTickMs: view.getInt32(16, LITTLE_ENDIAN),
      reconnectTimeoutMs: view.getInt32(20, LITTLE_ENDIAN),
    };
  }

  if (pktType === PKT.SC_COMMAND_RESULT) {
    const view = getFixedPacketView(buf, PKT.SC_COMMAND_RESULT, 24);
    if (!view) return null;
    return {
      pktType: PKT.SC_COMMAND_RESULT,
      pktLen,
      requestPacketType: view.getInt32(8, LITTLE_ENDIAN),
      resultCode: view.getInt32(12, LITTLE_ENDIAN),
      teamFlag: view.getInt32(16, LITTLE_ENDIAN),
      entityID: view.getInt32(20, LITTLE_ENDIAN),
    };
  }

  if (pktType === PKT.SC_STAGE_STATE) {
    const view = getFixedPacketView(buf, PKT.SC_STAGE_STATE, 20);
    if (!view) return null;
    return {
      pktType: PKT.SC_STAGE_STATE,
      pktLen,
      stageState: view.getInt32(8, LITTLE_ENDIAN),
      aliveAllyCount: view.getInt32(12, LITTLE_ENDIAN),
      aliveEnemyCount: view.getInt32(16, LITTLE_ENDIAN),
    };
  }

  if (pktType === PKT.SC_MAP_INFO) {
    const view = getFixedPacketView(buf, PKT.SC_MAP_INFO, 28);
    if (!view) return null;
    return {
      pktType: PKT.SC_MAP_INFO,
      pktLen,
      mapID: view.getInt32(8, LITTLE_ENDIAN),
      mapVersion: view.getInt32(12, LITTLE_ENDIAN),
      worldWidth: view.getInt32(16, LITTLE_ENDIAN),
      worldHeight: view.getInt32(20, LITTLE_ENDIAN),
      gridCellSize: view.getInt32(24, LITTLE_ENDIAN),
    };
  }

  return null;
}

/** 디버그용 바이트 문자열 */
export function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

/** 디버그용 패킷 구조 출력 */
export function dump(buf: ArrayBuffer) {
  if (buf.byteLength < HEADER_SIZE) {
    return {
      pktType: null,
      name: "MALFORMED",
      pktLen: null,
      byteLength: buf.byteLength,
      lenMatches: false,
      fields: [] as number[],
      hex: hex(buf),
    };
  }

  const view = new DataView(buf);
  const pktType = view.getInt32(0, LITTLE_ENDIAN);
  const pktLen = view.getInt32(4, LITTLE_ENDIAN);
  const fields: number[] = [];
  for (let offset = HEADER_SIZE; offset + 4 <= buf.byteLength; offset += 4) {
    fields.push(view.getInt32(offset, LITTLE_ENDIAN));
  }

  return {
    pktType,
    name: PKT_NAME[pktType] ?? "UNKNOWN",
    pktLen,
    byteLength: buf.byteLength,
    lenMatches: pktLen === buf.byteLength,
    fields,
    hex: hex(buf),
  };
}
