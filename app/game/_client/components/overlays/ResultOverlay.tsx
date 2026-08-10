import Link from "next/link";

const BUTTON_BASE = "flex h-12 items-center justify-center rounded-lg text-sm font-bold transition";
const PRIMARY_BUTTON = `${BUTTON_BASE} bg-sky-500 text-slate-950 hover:bg-sky-400`;
const SECONDARY_BUTTON = `${BUTTON_BASE} border border-white/15 bg-black/40 text-slate-200 hover:border-sky-400/60 hover:bg-sky-400/10 hover:text-sky-300`;

type Props = {
  clear: boolean;
  reason: string;
  stageID: number;
  stageTitle: string;
  awardedGold: number;
  nextHref: string | null;
};

export default function ResultOverlay({ clear, reason, stageID, stageTitle, awardedGold, nextHref }: Props) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/80 p-6 backdrop-blur"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/90 p-8 text-white">
        <p className={`text-sm font-semibold tracking-[0.24em] ${clear ? "text-sky-400" : "text-red-400"}`}>
          STAGE {stageID} · {clear ? "CLEAR" : "FAILED"}
        </p>
        <h2 className="mt-2 text-3xl font-bold">{clear ? "작전 성공" : "작전 실패"}</h2>
        <p className="mt-3 text-slate-400">{stageTitle}</p>
        <p className="mt-1 text-slate-300">{reason}</p>

        {clear && awardedGold > 0 && (
          <p className="mt-4 text-lg font-bold text-amber-300">+{awardedGold.toLocaleString()} G</p>
        )}

        <div className="mt-8 flex flex-col gap-3">
          {nextHref && (
            // 같은 /game 경로의 다음 튜토리얼도 모든 게임 상태를 새로 만들도록 전체 이동한다.
            <a href={nextHref} className={PRIMARY_BUTTON}>
              다음 스테이지
            </a>
          )}
          {/* 소켓과 서버 배치를 처음부터 다시 만들어야 하므로 페이지 전체를 다시 로드한다. */}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={clear ? SECONDARY_BUTTON : PRIMARY_BUTTON}
          >
            다시 시도
          </button>
          <Link href="/stage" className={SECONDARY_BUTTON}>
            스테이지 선택
          </Link>
        </div>
      </div>
    </div>
  );
}
