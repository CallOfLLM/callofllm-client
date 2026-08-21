import type { Soldier } from "../../../(lib)/_packet";

export type SoldierUnitType = "ARCHER" | "WARRIOR" | "KNIGHT";

export type BattlefieldSoldier = Soldier & {
  unitType: SoldierUnitType;
};

export function soldierKey(soldier: Pick<Soldier, "teamFlag" | "squadID" | "soldierID">) {
  return `${soldier.teamFlag}:${soldier.squadID}:${soldier.soldierID}`;
}

/** V15 기본 최대 HP는 병종마다 다르므로 전투 전 최초 스냅샷에서 병종을 복원할 수 있다. */
export function unitTypeFromInitialHP(hp: number): SoldierUnitType | undefined {
  if (hp === 100) return "ARCHER";
  if (hp === 150) return "WARRIOR";
  if (hp === 200) return "KNIGHT";
  return undefined;
}
