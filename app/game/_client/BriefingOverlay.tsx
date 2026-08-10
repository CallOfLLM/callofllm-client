"use client";

// 전투를 시작하기 전에 이번 스테이지의 목표와 편성을 한 번 보여준다.

import Link from "next/link";
import type { DeploymentSquad } from "../../(lib)/squadfuncs";
import { isTutorialStage, type StageData } from "../../(lib)/stages";

type Props = {
  stage: StageData;
  squads: DeploymentSquad[];
  onStart: () => void;
};

export default function BriefingOverlay({ stage, squads, onStart }: Props) {
  const tutorial = isTutorialStage(stage);

  return (
    <div role="dialog" aria-modal="true" aria-label="작전 브리핑" className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/85 p-6 backdrop-blur">
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/90 p-8 text-white">
        <p className="text-sm font-semibold tracking-[0.24em] text-sky-400">
          STAGE {stage.id}
          {tutorial && " · TUTORIAL"}
        </p>
        <h2 className="mt-2 text-3xl font-bold">{stage.title}</h2>
        <p className="mt-3 leading-relaxed text-slate-400">{stage.description}</p>

        <h3 className="mt-8 text-sm font-bold tracking-[0.18em] text-slate-300">작전 목표</h3>
        <ol className="mt-3 flex flex-col gap-2">
          {stage.objective.steps.map((step, index) => (
            <li key={index} className="flex gap-3 text-sm leading-relaxed">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-xs font-bold tabular-nums text-sky-300">{index + 1}</span>
              <span className="text-slate-200">{step.label}</span>
            </li>
          ))}
        </ol>

        {stage.objective.fail?.kind === "leaveArea" && (
          <p className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            부대가 빨간 원 밖으로 나가면 전장 이탈로 즉시 패배합니다.
          </p>
        )}

        {squads.length > 0 && (
          <>
            <h3 className="mt-8 text-sm font-bold tracking-[0.18em] text-slate-300">출전 부대</h3>
            <ul className="mt-3 flex flex-col gap-1.5">
              {squads.map((squad, index) => (
                <li key={index} className="flex items-center justify-between gap-4 text-sm">
                  <span className="truncate font-bold text-sky-300">{squad.name}</span>
                  <span className="flex shrink-0 gap-3 tabular-nums text-slate-400">
                    <span>
                      보병 <b className="text-slate-100">{squad.warrior}</b>
                    </span>
                    <span>
                      궁병 <b className="text-slate-100">{squad.archer}</b>
                    </span>
                    <span>
                      기병 <b className="text-slate-100">{squad.knight}</b>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="mt-8 text-sm text-slate-400">화면 아래 입력창에 자연어로 명령하면 AI가 부대를 움직입니다.</p>

        <div className="mt-6 flex flex-col gap-3">
          <button type="button" onClick={onStart} autoFocus className="h-14 rounded-lg bg-sky-500 text-base font-bold text-slate-950 transition hover:bg-sky-400">
            작전 시작
          </button>
          <Link
            href="/stage"
            className="flex h-12 items-center justify-center rounded-lg border border-white/15 bg-black/40 text-sm font-bold text-slate-200 transition hover:border-sky-400/60 hover:bg-sky-400/10 hover:text-sky-300"
          >
            스테이지 선택
          </Link>
        </div>
      </div>
    </div>
  );
}
