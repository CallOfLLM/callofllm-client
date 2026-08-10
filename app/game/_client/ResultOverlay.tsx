"use client";

import Link from "next/link";

type Props = {
  clear: boolean;
  reason: string;
  stageID: number;
  stageTitle: string;
  /** 이번에 실제로 지급된 골드. 이미 깬 스테이지를 다시 깼으면 0이다. */
  awardedGold: number;
  /** 다음 스테이지로 갈 주소. 마지막 스테이지거나 패배면 null. */
  nextHref: string | null;
};

const BUTTON_BASE = "flex h-12 items-center justify-center rounded-lg text-sm font-bold transition";
const PRIMARY = `${BUTTON_BASE} bg-sky-500 text-slate-950 hover:bg-sky-400`;
const SECONDARY = `${BUTTON_BASE} border border-white/15 bg-black/40 text-slate-200 hover:border-sky-400/60 hover:bg-sky-400/10 hover:text-sky-300`;

export default function ResultOverlay({ clear, reason, stageID, stageTitle, awardedGold, nextHref }: Props) {
  return (
    <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/80 p-6 backdrop-blur">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/90 p-8 text-white">
        <p className={`text-sm font-semibold tracking-[0.24em] ${clear ? "text-sky-400" : "text-red-400"}`}>
          STAGE {stageID} · {clear ? "CLEAR" : "FAILED"}
        </p>
        <h2 className="mt-2 text-3xl font-bold">{clear ? "작전 성공" : "작전 실패"}</h2>
        <p className="mt-3 text-slate-400">{stageTitle}</p>
        <p className="mt-1 text-slate-300">{reason}</p>

        {clear && awardedGold > 0 && <p className="mt-4 text-lg font-bold text-amber-300">+{awardedGold.toLocaleString()} G</p>}

        <div className="mt-8 flex flex-col gap-3">
          {nextHref && (
            <Link href={nextHref} className={PRIMARY}>
              다음 스테이지
            </Link>
          )}
          {/* 소켓과 서버 배치를 처음부터 다시 만들어야 하므로 상태를 되돌리는 대신 통째로 다시 로드한다. */}
          <button type="button" onClick={() => window.location.reload()} className={clear ? SECONDARY : PRIMARY}>
            다시 시도
          </button>
          <Link href="/stage" className={SECONDARY}>
            스테이지 선택
          </Link>
        </div>
      </div>
    </div>
  );
}
