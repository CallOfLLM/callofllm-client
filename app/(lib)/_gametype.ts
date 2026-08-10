// 병종 이름은 패킷 명세의 UnitType(ARCHER / WARRIOR / KNIGHT)을 따른다.

export const GAME_DATA_STORAGE_KEY = "gamedata";

/** 저장 직후 헤더 등 다른 컴포넌트가 다시 읽도록 알리는 브라우저 이벤트 이름 */
export const GAME_DATA_UPDATED_EVENT = "gamedata-updated";

/** 충원 가능한 병종 */
export type TroopKey = "warrior" | "archer" | "knight";

/** 1기 충원에 필요한 골드 */
export const TROOP_COST: Record<TroopKey, number> = {
  warrior: 10,
  archer: 50,
  knight: 100,
};

/** 훈련소 1회 강화(공격력 +1)에 필요한 골드 */
export const FACILITY_COST: Record<TroopKey, number> = {
  warrior: 200,
  archer: 500,
  knight: 1000,
};

/** 훈련소 강화로 오르는 공격력 */
export const FACILITY_ATTACK_GAIN = 1;

/** 로컬스토리지에 저장하는 플레이어의 보유 병력과 골드 */
export interface GameData {
  warrior: number;
  archer: number;
  knight: number;
  gold: number;

  warrior_attack: number;
  archer_attack: number;
  knight_attack: number;

  /** 마지막으로 클리어한 스테이지 번호. 0이면 1번만 열려 있다. */
  clearedStage: number;
}

export const DEFAULT_GAME_DATA: GameData = {
  warrior: 0,
  archer: 0,
  knight: 0,
  gold: 500,

  warrior_attack: 13,
  archer_attack: 10,
  knight_attack: 15,

  clearedStage: 0,
};

/** 저장값이 없거나 깨졌으면 기본값으로 되돌린다. 브라우저에서만 호출한다. */
export function loadGameData(): GameData {
  try {
    const raw = localStorage.getItem(GAME_DATA_STORAGE_KEY);
    if (!raw) return DEFAULT_GAME_DATA;
    return { ...DEFAULT_GAME_DATA, ...(JSON.parse(raw) as Partial<GameData>) };
  } catch {
    return DEFAULT_GAME_DATA;
  }
}

/** 저장 후 같은 탭의 다른 컴포넌트에도 변경을 알린다. 브라우저에서만 호출한다. */
export function saveGameData(data: GameData): void {
  localStorage.setItem(GAME_DATA_STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new Event(GAME_DATA_UPDATED_EVENT));
}

/** 골드가 모자라면 null, 충분하면 골드를 차감하고 병력을 1 늘린 새 데이터를 돌려준다. */
export function recruitTroop(data: GameData, troop: TroopKey): GameData | null {
  const cost = TROOP_COST[troop];
  if (data.gold < cost) return null;

  return { ...data, gold: data.gold - cost, [troop]: data[troop] + 1 };
}

/**
 * 스테이지를 처음 클리어했을 때만 보상 골드를 주고 진행도를 올린다.
 * 이미 깬 스테이지를 다시 깨면 같은 객체를 그대로 돌려주므로 호출한 쪽에서 참조 비교로 구분할 수 있다.
 */
export function completeStage(data: GameData, stageID: number, rewardGold: number): GameData {
  if (stageID <= data.clearedStage) return data;
  return { ...data, gold: data.gold + rewardGold, clearedStage: stageID };
}

/** 골드가 모자라면 null, 충분하면 골드를 차감하고 해당 병종 공격력을 올린 새 데이터를 돌려준다. */
export function upgradeFacility(data: GameData, troop: TroopKey): GameData | null {
  const cost = FACILITY_COST[troop];
  if (data.gold < cost) return null;

  const attackKey = `${troop}_attack` as const;
  return { ...data, gold: data.gold - cost, [attackKey]: data[attackKey] + FACILITY_ATTACK_GAIN };
}
