"use client";

// 스테이지 목표 판정기.
// 서버의 STAGE_STATE는 전멸 승패만 알려주므로, 이동·정지 같은 튜토리얼 목표는
// SC_SOLDIER_POSITIONS 스냅샷과 클라이언트가 보낸 명령을 보고 여기서 직접 판정한다.

import { useCallback, useEffect, useRef, useState } from "react";
import { SOLDIER_STATE, STAGE_STATE, TEAM_FLAG, type Soldier } from "../../(lib)/_packet";
import type { CommandName, Objective, ObjectiveStep, StepCondition } from "../../(lib)/stages";

export type Outcome = "playing" | "clear" | "fail";

export interface Point {
  x: number;
  y: number;
}

export interface ObjectiveStatus {
  outcome: Outcome;
  /** 진행 중인 단계 번호. 클리어하면 stepCount와 같아진다. */
  stepIndex: number;
  stepCount: number;
  step: ObjectiveStep | null;
  /** 진행도 막대용 0..1. 잴 수 없는 단계면 null. */
  progressRatio: number | null;
  /** "이동 420 / 600" 처럼 사람이 읽는 진행도. 잴 수 없으면 null. */
  progressLabel: string | null;
  /** 클리어·패배 사유 */
  reason: string;
  /** 현재 단계의 기준점. moveAxis 목표선을 그릴 때 쓴다. */
  stepOrigin: Point | null;
}

function isAlive(soldier: Soldier) {
  return soldier.teamFlag === TEAM_FLAG.ALLY && soldier.hp > 0;
}

function isMoving(soldier: Soldier) {
  return soldier.state === SOLDIER_STATE.MOVING || soldier.state === SOLDIER_STATE.CHASING;
}

/** 살아 있는 아군의 무게중심. 병사 한 명은 포메이션 때문에 흔들려 기준으로 쓸 수 없다. */
function allyCentroid(soldiers: Soldier[]): Point | null {
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (const soldier of soldiers) {
    if (!isAlive(soldier)) continue;
    sumX += soldier.posX;
    sumY += soldier.posY;
    count += 1;
  }

  return count === 0 ? null : { x: sumX / count, y: sumY / count };
}

/**
 * 생성 직후 병사들은 FORMING 상태로 앵커 주변에 퍼지면서 중심이 수백 단위로 움직인다.
 * 그 사이의 중심을 기준점으로 잡으면 오판정이 나므로 대열이 잡힐 때까지 판정을 미룬다.
 */
function formationSettled(soldiers: Soldier[]) {
  let alive = 0;

  for (const soldier of soldiers) {
    if (!isAlive(soldier)) continue;
    if (soldier.state === SOLDIER_STATE.FORMING) return false;
    alive += 1;
  }

  return alive > 0;
}

function distanceBetween(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

type Evaluation = { done: boolean; ratio: number | null; label: string | null };

const UNMEASURED: Evaluation = { done: false, ratio: null, label: null };

/** 스냅샷만으로 판정할 수 있는 조건들. stopWhileMoving은 명령을 봐야 하므로 여기서 다루지 않는다. */
function evaluateStep(condition: StepCondition, center: Point, origin: Point, soldiers: Soldier[], stageState: number | undefined): Evaluation {
  switch (condition.kind) {
    case "moveAxis": {
      const moved = (center[condition.axis] - origin[condition.axis]) * condition.sign;
      const shown = Math.max(0, Math.round(moved));
      return {
        done: moved >= condition.distance,
        ratio: Math.min(1, Math.max(0, moved / condition.distance)),
        label: `이동 ${shown} / ${condition.distance}`,
      };
    }

    case "reachPoint": {
      const remaining = distanceBetween(center, condition) - condition.radius;
      return {
        done: remaining <= 0,
        ratio: null,
        label: remaining <= 0 ? "목표 지점 도달" : `목표까지 ${Math.round(remaining)}`,
      };
    }

    case "startMoving":
      return { ...UNMEASURED, done: soldiers.some((soldier) => isAlive(soldier) && isMoving(soldier)) };

    case "eliminate":
      return { ...UNMEASURED, done: stageState === STAGE_STATE.ALLY_WIN };

    case "stopWhileMoving":
      return UNMEASURED;
  }
}

/**
 * @param objective 판정할 목표. null이면 아무것도 하지 않는다.
 * @param soldiers 서버가 내려준 최신 병사 스냅샷
 * @param stageState 서버가 알려준 STAGE_STATE
 * @returns 현재 상태와, 명령을 보낸 뒤 호출할 notifyCommand
 */
export function useObjective(objective: Objective | null, soldiers: Soldier[], stageState: number | undefined) {
  const [outcome, setOutcome] = useState<Outcome>("playing");
  const [stepIndex, setStepIndex] = useState(0);
  const [progressRatio, setProgressRatio] = useState<number | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [stepOrigin, setStepOrigin] = useState<Point | null>(null);

  // 스냅샷이 계속 들어와도 종료는 한 번만 일어나야 한다.
  const finishedRef = useRef(false);
  const stepIndexRef = useRef(0);
  const stepOriginRef = useRef<Point | null>(null);
  // notifyCommand는 렌더 밖에서 불리므로 최신 스냅샷을 아래 판정 이펙트에서 따로 받아 둔다.
  const soldiersRef = useRef<Soldier[]>(soldiers);

  const stepCount = objective?.steps.length ?? 0;

  const finish = useCallback((result: Outcome, why: string) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setOutcome(result);
    setReason(why);
  }, []);

  /** fromIndex가 아직 진행 중인 단계일 때만 다음 단계로 넘긴다. 스냅샷과 명령이 겹쳐 두 번 부르는 것을 막는다. */
  const advance = useCallback(
    (fromIndex: number) => {
      if (finishedRef.current || fromIndex !== stepIndexRef.current) return;

      const next = fromIndex + 1;
      stepIndexRef.current = next;
      stepOriginRef.current = null;
      setStepIndex(next);
      setStepOrigin(null);
      setProgressRatio(null);
      setProgressLabel(null);

      if (next >= stepCount) {
        finishedRef.current = true;
        setOutcome("clear");
        setReason("모든 목표를 달성했습니다.");
      }
    },
    [stepCount],
  );

  useEffect(() => {
    soldiersRef.current = soldiers;
    if (!objective || finishedRef.current) return;

    // 아군 전멸은 어떤 목표에서도 패배다.
    if (stageState === STAGE_STATE.ENEMY_WIN) {
      finish("fail", "아군이 전멸했습니다.");
      return;
    }

    const step = objective.steps[stepIndex];
    if (!step) return;

    if (!formationSettled(soldiers)) return;

    const center = allyCentroid(soldiers);
    if (!center) return;

    // 클리어보다 패배를 먼저 본다. 경계를 넘은 순간 즉시 끝나야 하기 때문이다.
    const fail = objective.fail;
    if (fail && distanceBetween(center, fail) > fail.radius) {
      finish("fail", "부대가 전장을 벗어났습니다.");
      return;
    }

    if (!stepOriginRef.current) {
      stepOriginRef.current = center;
      setStepOrigin(center);
    }

    const result = evaluateStep(step.condition, center, stepOriginRef.current, soldiers, stageState);
    setProgressRatio(result.ratio);
    setProgressLabel(result.label);
    if (result.done) advance(stepIndex);
  }, [advance, finish, objective, soldiers, stageState, stepIndex]);

  /** 게임 서버로 명령을 보낸 직후에 호출한다. 이동 중 정지처럼 명령 자체가 조건인 단계를 판정한다. */
  const notifyCommand = useCallback(
    (packetType: CommandName) => {
      if (!objective || finishedRef.current) return;

      const step = objective.steps[stepIndexRef.current];
      if (step?.condition.kind !== "stopWhileMoving" || packetType !== "STOP_SQUAD") return;

      // 이미 멈춰 있는 부대를 다시 세우는 것은 "이동 중 정지"가 아니다.
      if (!soldiersRef.current.some((soldier) => isAlive(soldier) && isMoving(soldier))) return;

      advance(stepIndexRef.current);
    },
    [advance, objective],
  );

  const status: ObjectiveStatus = {
    outcome,
    stepIndex,
    stepCount,
    step: objective?.steps[stepIndex] ?? null,
    progressRatio,
    progressLabel,
    reason,
    stepOrigin,
  };

  return { ...status, notifyCommand };
}
