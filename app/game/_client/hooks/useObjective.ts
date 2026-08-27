"use client";

import { useEffect, useRef, useState } from "react";
import { STAGE_STATE } from "../../../(lib)/_packet";

export type Outcome = "playing" | "clear" | "fail";

type MissionStatus = {
  outcome: Outcome;
  reason: string;
};

const PLAYING: MissionStatus = { outcome: "playing", reason: "" };

/** 서버가 확정한 전투 결과를 한 번만 화면 상태로 고정한다. */
export function useObjective(active: boolean, stageState: number | undefined): MissionStatus {
  const [status, setStatus] = useState<MissionStatus>(PLAYING);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (!active || finishedRef.current) return;

    let result: MissionStatus | null = null;
    if (stageState === STAGE_STATE.ALLY_WIN) {
      result = { outcome: "clear", reason: "적군을 전멸시켰습니다." };
    } else if (stageState === STAGE_STATE.ENEMY_WIN) {
      result = { outcome: "fail", reason: "아군이 전멸했습니다." };
    } else if (stageState === STAGE_STATE.DRAW) {
      result = { outcome: "fail", reason: "양측 부대가 모두 전멸했습니다." };
    }

    if (!result) return;
    const timeoutID = window.setTimeout(() => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setStatus(result);
    }, 0);
    return () => window.clearTimeout(timeoutID);
  }, [active, stageState]);

  return status;
}
