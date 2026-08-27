"use client";

import { useCallback, useEffect, useState } from "react";
import { completeStage, DEFAULT_GAME_DATA, loadGameData, saveGameData } from "../../../(lib)/_gametype";
import { loadDeployment, type StageDeployment } from "../../../(lib)/squadfuncs";
import { findStage, nextStageID, STAGES, type StageData } from "../../../(lib)/stages";

interface SelectedStageState {
  stage: StageData | null;
  deployment: StageDeployment | null;
  clearedBefore: number;
  usedFallback: boolean;
}

export interface SelectedStage extends SelectedStageState {
  nextStageHref: string | null;
  /** 재접속 직전 저장소에서 가장 최근 편성을 다시 읽는다. */
  getLatestDeployment: () => StageDeployment | null;
  /** 현재 선택한 스테이지의 첫 클리어 보상과 진행도를 저장한다. */
  persistStageClear: () => boolean;
}

const INITIAL_STATE: SelectedStageState = {
  stage: null,
  deployment: null,
  clearedBefore: DEFAULT_GAME_DATA.clearedStage,
  usedFallback: false,
};

function selectStage(search: string): { stage: StageData; usedFallback: boolean } {
  const requestedValue = new URLSearchParams(search).get("stage");
  const requestedID = requestedValue === null ? 1 : Number(requestedValue);
  const requestedStage = Number.isInteger(requestedID) ? findStage(requestedID) : undefined;

  return {
    stage: requestedStage ?? STAGES[0],
    usedFallback: requestedStage === undefined,
  };
}

/** 클리어 후 다음 스테이지의 플레이어 편성을 준비할 주소. */
export function getNextStageHref(stageID: number): string | null {
  const nextID = nextStageID(stageID);
  if (nextID === null) return null;

  const nextStage = findStage(nextID);
  if (!nextStage) return null;

  return `/stage/ready?stage=${nextID}`;
}

/** 브라우저 URL과 저장 데이터를 마운트 후 한 번 읽어 현재 스테이지에 묶어 준다. */
export function useSelectedStage(): SelectedStage {
  const [selected, setSelected] = useState<SelectedStageState>(INITIAL_STATE);

  useEffect(() => {
    const timeoutID = window.setTimeout(() => {
      const { stage, usedFallback } = selectStage(window.location.search);

      setSelected({
        stage,
        deployment: loadDeployment(stage.id),
        clearedBefore: loadGameData().clearedStage,
        usedFallback,
      });
    }, 0);

    return () => window.clearTimeout(timeoutID);
  }, []);

  const getLatestDeployment = useCallback(
    () => (selected.stage ? loadDeployment(selected.stage.id) : null),
    [selected.stage],
  );

  const persistStageClear = useCallback((): boolean => {
    if (!selected.stage) return false;

    const current = loadGameData();
    const updated = completeStage(current, selected.stage.id, selected.stage.rewardGold);
    if (updated === current) return false;

    saveGameData(updated);
    return true;
  }, [selected.stage]);

  return {
    ...selected,
    nextStageHref: selected.stage ? getNextStageHref(selected.stage.id) : null,
    getLatestDeployment,
    persistStageClear,
  };
}
