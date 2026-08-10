"use client";

// 스테이지 잠금은 로컬스토리지의 진행도로 정해지므로 목록은 브라우저에서 그린다.

import Link from "next/link";
import { useEffect, useState } from "react";
import { DEFAULT_GAME_DATA, GAME_DATA_UPDATED_EVENT, loadGameData } from "../../(lib)/_gametype";
import { isStageAvailable, isTutorialStage, STAGES, type StageData } from "../../(lib)/stages";

/** 튜토리얼은 편성이 고정이라 준비 화면을 건너뛰고 바로 전장으로 간다. */
function stageHref(stage: StageData) {
  return isTutorialStage(stage) ? `/game?stage=${stage.id}` : `/stage/ready?stage=${stage.id}`;
}

export default function StageSelectClient() {
  const [clearedStage, setClearedStage] = useState(DEFAULT_GAME_DATA.clearedStage);

  // 로컬스토리지는 서버 렌더 시점에 없으므로 마운트 후에 읽는다.
  useEffect(() => {
    const sync = () => setClearedStage(loadGameData().clearedStage);
    sync();

    window.addEventListener(GAME_DATA_UPDATED_EVENT, sync);
    return () => window.removeEventListener(GAME_DATA_UPDATED_EVENT, sync);
  }, []);

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {STAGES.map((stage) => {
        const available = isStageAvailable(stage.id, clearedStage);
        const cleared = stage.id <= clearedStage;

        const content = (
          <>
            <div className="flex items-center justify-between">
              <span className={available ? "text-sm font-semibold text-sky-400" : "text-sm font-semibold text-slate-600"}>STAGE {stage.id}</span>
              {cleared && <span className="rounded-full bg-sky-400/15 px-2.5 py-1 text-xs font-semibold text-sky-300">클리어</span>}
              {!available && <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-500">잠김</span>}
            </div>
            <h2 className={`mt-5 text-xl font-bold ${available ? "text-white" : "text-slate-500"}`}>{stage.title}</h2>
            <p className={`mt-2 text-sm leading-6 ${available ? "text-slate-400" : "text-slate-600"}`}>
              {available ? stage.description : "앞 스테이지를 먼저 클리어해 주세요."}
            </p>
            {isTutorialStage(stage) && available && <p className="mt-3 text-xs font-semibold tracking-[0.18em] text-emerald-400">TUTORIAL</p>}
          </>
        );

        return available ? (
          <Link
            key={stage.id}
            href={stageHref(stage)}
            className="min-h-48 rounded-xl border border-white/10 bg-black/40 p-5 transition hover:-translate-y-1 hover:border-sky-400/50 hover:bg-sky-400/10"
          >
            {content}
          </Link>
        ) : (
          <article key={stage.id} className="min-h-48 cursor-not-allowed rounded-xl border border-white/5 bg-black/40 p-5">
            {content}
          </article>
        );
      })}
    </div>
  );
}
