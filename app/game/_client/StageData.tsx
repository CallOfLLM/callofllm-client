// 스테이지 시작 시 CREATE_SQUAD(Type 0)로 만들 스쿼드 목록.
// squadID는 서버가 팀별로 0부터 발급하므로 여기에 넣지 않는다.

import type { TeamFlag } from "../../(lib)/_packet";

/** CREATE_SQUAD 한 번에 대응하는 스쿼드 정의 */
export interface SquadData {
  teamFlag: TeamFlag;
  archerCount: number;
  warriorCount: number;
  knightCount: number;
  /** 배치 앵커. SPAWN_BOUNDS(4..6395, 4..3195) 안이어야 한다. */
  spawnX: number;
  spawnY: number;
}

/** 스테이지 하나의 초기 배치 */
export interface StageData {
  id: number;
  title: string;
  squads: SquadData[];
}
