// 출정 준비 화면에서 짠 스쿼드 편성. 로컬스토리지를 통해 게임 화면으로 전달한다.

import { MAX_SQUAD_SIZE, SPAWN_BOUNDS } from "./_packet";

export const DEPLOYMENT_STORAGE_KEY = "deployment";

/** 한 스테이지에 내보낼 수 있는 스쿼드 수 */
export const MAX_SQUAD_COUNT = 5;

/** 스쿼드 하나에 넣을 수 있는 병사 수. CREATE_SQUAD 제한과 같다. */
export const MAX_SQUAD_SOLDIERS = MAX_SQUAD_SIZE;

export const SQUAD_NAME_MAX_LENGTH = 20;

/** 준비 화면에서 편성한 스쿼드 한 개 */
export interface DeploymentSquad {
  name: string;
  warrior: number;
  archer: number;
  knight: number;
}

/** 스테이지 하나에 대한 아군 편성 */
export interface StageDeployment {
  stageID: number;
  squads: DeploymentSquad[];
}

export function createEmptySquad(index: number): DeploymentSquad {
  return { name: `스쿼드 ${index + 1}`, warrior: 0, archer: 0, knight: 0 };
}

export function squadSoldierCount(squad: DeploymentSquad): number {
  return squad.warrior + squad.archer + squad.knight;
}

/** 편성에 배치된 병종별 합계 */
export function deployedCounts(squads: DeploymentSquad[]) {
  return squads.reduce(
    (total, squad) => ({
      warrior: total.warrior + squad.warrior,
      archer: total.archer + squad.archer,
      knight: total.knight + squad.knight,
    }),
    { warrior: 0, archer: 0, knight: 0 },
  );
}

/** 아군 스쿼드는 맵 왼쪽에 세로로 나눠 세운다. 결과는 SPAWN_BOUNDS 안이다. */
export function allySpawnPoint(index: number): { spawnX: number; spawnY: number } {
  const spacing = Math.floor((SPAWN_BOUNDS.maxY - SPAWN_BOUNDS.minY) / (MAX_SQUAD_COUNT + 1));
  return {
    spawnX: 1200,
    spawnY: SPAWN_BOUNDS.minY + spacing * (index + 1),
  };
}

function isValidSquad(value: unknown): value is DeploymentSquad {
  if (typeof value !== "object" || value === null) return false;
  const squad = value as Record<string, unknown>;
  return (
    typeof squad.name === "string" &&
    [squad.warrior, squad.archer, squad.knight].every((count) => typeof count === "number" && Number.isInteger(count) && count >= 0)
  );
}

/** 브라우저에서만 호출한다. */
export function saveDeployment(deployment: StageDeployment): void {
  localStorage.setItem(DEPLOYMENT_STORAGE_KEY, JSON.stringify(deployment));
}

/** 저장값이 없거나 다른 스테이지의 편성이거나 형식이 깨졌으면 null. 브라우저에서만 호출한다. */
export function loadDeployment(stageID: number): StageDeployment | null {
  try {
    const raw = localStorage.getItem(DEPLOYMENT_STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const deployment = parsed as Record<string, unknown>;
    if (deployment.stageID !== stageID) return null;
    if (!Array.isArray(deployment.squads) || !deployment.squads.every(isValidSquad)) return null;

    return { stageID, squads: deployment.squads.slice(0, MAX_SQUAD_COUNT) };
  } catch {
    return null;
  }
}

/** 전투가 끝나 편성을 버릴 때 호출한다. 브라우저에서만 호출한다. */
export function clearDeployment(): void {
  localStorage.removeItem(DEPLOYMENT_STORAGE_KEY);
}
