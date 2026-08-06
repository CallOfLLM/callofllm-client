// 패킷 명세서 v1.0 기준 바이너리 직렬화
//
// 공통 헤더 (8 bytes)
//   int pkt_type;  // 패킷 타입
//   int pkt_len;   // 패킷 전체 길이 (헤더 포함)

export const PKT = {
  CS_CREATE_SQUAD: 0,
  CS_MOVE_SQUAD: 1,
  CS_ATK_SQUAD: 2,
  CS_DEF_SQUAD: 3,
  CS_STOP_SQUAD: 4,
  CS_RETREAT_SQUAD: 5,
} as const;

export const PKT_NAME: Record<number, string> = {
  0: "PKT_CS_CREATE_SQUAD",
  1: "PKT_CS_MOVE_SQUAD",
  2: "PKT_CS_ATK_SQUAD",
  3: "PKT_CS_DEF_SQUAD",
  4: "PKT_CS_STOP_SQUAD",
  5: "PKT_CS_RETREAT_SQUAD",
};

export const HEADER_SIZE = 8;

// 서버가 x86 C++ 이면 리틀엔디안. 서버가 htonl 등으로 빅엔디안을 쓰면 false로 바꾸세요.
const LITTLE_ENDIAN = true;

/** 헤더 + int 필드들을 하나의 ArrayBuffer로 직렬화한다. */
function build(pktType: number, fields: number[]): ArrayBuffer {
  const pktLen = HEADER_SIZE + fields.length * 4;
  const buf = new ArrayBuffer(pktLen);
  const view = new DataView(buf);

  view.setInt32(0, pktType, LITTLE_ENDIAN);
  view.setInt32(4, pktLen, LITTLE_ENDIAN);
  fields.forEach((v, i) => view.setInt32(HEADER_SIZE + i * 4, v, LITTLE_ENDIAN));

  return buf;
}

/** 5.1 PKT_CS_CREATE_SQUAD (0) — 궁수/전사/기사 수 */
export function createSquad(archerNum: number, warriorNum: number, knightNum: number) {
  return build(PKT.CS_CREATE_SQUAD, [archerNum, warriorNum, knightNum]);
}

/** 5.2 PKT_CS_MOVE_SQUAD (1) */
export function moveSquad(squadNum: number, posX: number, posY: number) {
  return build(PKT.CS_MOVE_SQUAD, [squadNum, posX, posY]);
}

/** 5.3 PKT_CS_ATK_SQUAD (2) */
export function atkSquad(squadNum: number, posX: number, posY: number) {
  return build(PKT.CS_ATK_SQUAD, [squadNum, posX, posY]);
}

/** 5.4 PKT_CS_DEF_SQUAD (3) */
export function defSquad(squadNum: number) {
  return build(PKT.CS_DEF_SQUAD, [squadNum]);
}

/** 5.5 PKT_CS_STOP_SQUAD (4) */
export function stopSquad(squadNum: number) {
  return build(PKT.CS_STOP_SQUAD, [squadNum]);
}

/** 5.6 PKT_CS_RETREAT_SQUAD (5) */
export function retreatSquad(squadNum: number, posX: number, posY: number) {
  return build(PKT.CS_RETREAT_SQUAD, [squadNum, posX, posY]);
}

// ---------------------------------------------------------------------------
// 서버 → 클라이언트: 병사 스냅샷
//
//   0   4  pkt_type
//   4   4  pkt_len
//   8   4  soldierCount
//  이후 soldierCount 개만큼 28바이트씩 반복:
//  +0   4  squadID
//  +4   4  soldierID
//  +8   4  teamFlag
//  +12  4  posX
//  +16  4  posY
//  +20  4  HP
//  +24  4  state
// ---------------------------------------------------------------------------

export const SOLDIER_SIZE = 28;
const COUNT_OFFSET = HEADER_SIZE; // soldierCount 위치
const BODY_OFFSET = HEADER_SIZE + 4; // 병사 배열 시작 위치

export interface Soldier {
  squadID: number;
  soldierID: number;
  teamFlag: number;
  posX: number;
  posY: number;
  hp: number;
  state: number;
}

export interface SoldierSnapshot {
  pktType: number;
  pktLen: number;
  soldierCount: number;
  soldiers: Soldier[];
}

/**
 * 병사 스냅샷 패킷을 파싱한다.
 * 길이가 `12 + soldierCount * 28`과 정확히 맞지 않으면 다른 패킷으로 보고 null을 돌려준다.
 */
export function parseSoldierSnapshot(buf: ArrayBuffer): SoldierSnapshot | null {
  if (buf.byteLength < BODY_OFFSET) return null;

  const view = new DataView(buf);
  const pktType = view.getInt32(0, LITTLE_ENDIAN);
  const pktLen = view.getInt32(4, LITTLE_ENDIAN);
  const soldierCount = view.getInt32(COUNT_OFFSET, LITTLE_ENDIAN);

  if (soldierCount < 0) return null;
  if (BODY_OFFSET + soldierCount * SOLDIER_SIZE !== buf.byteLength) return null;

  const soldiers: Soldier[] = [];
  for (let i = 0; i < soldierCount; i++) {
    const o = BODY_OFFSET + i * SOLDIER_SIZE;
    soldiers.push({
      squadID: view.getUint32(o, LITTLE_ENDIAN),
      soldierID: view.getUint32(o + 4, LITTLE_ENDIAN),
      teamFlag: view.getInt32(o + 8, LITTLE_ENDIAN),
      posX: view.getInt32(o + 12, LITTLE_ENDIAN),
      posY: view.getInt32(o + 16, LITTLE_ENDIAN),
      hp: view.getInt32(o + 20, LITTLE_ENDIAN),
      state: view.getInt32(o + 24, LITTLE_ENDIAN),
    });
  }

  return { pktType, pktLen, soldierCount, soldiers };
}

/** 디버그용 — 바이트를 hex 문자열로 */
export function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

/** 디버그용 — 헤더 + 4바이트 단위 필드로 뜯어본다 */
export function dump(buf: ArrayBuffer) {
  const view = new DataView(buf);
  const pktType = view.getInt32(0, LITTLE_ENDIAN);
  const pktLen = view.getInt32(4, LITTLE_ENDIAN);
  const fields: number[] = [];
  for (let o = HEADER_SIZE; o + 4 <= buf.byteLength; o += 4) {
    fields.push(view.getInt32(o, LITTLE_ENDIAN));
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
