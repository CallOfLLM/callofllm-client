"use client";

// 소켓 연결과 3D 모델 내려받기가 모두 끝날 때까지 전장을 가려 둔다.

import Link from "next/link";

type Props = {
  networkReady: boolean;
  assetsReady: boolean;
  /** 접속이 끊긴 상태면 자동 재연결을 기다리는 대신 안내를 띄운다. */
  disconnected: boolean;
  /** SELECT_MAP → START_STAGE → CREATE_SQUAD 중 지금 어디까지 왔는지 */
  setupLabel: string;
  /** 스테이지 준비 절차가 서버 거절로 멈췄는지 */
  setupFailed: boolean;
};

function Checklist({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <span
        aria-hidden
        className={`flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-sky-500 text-slate-950" : "bg-white/10 text-white/40"}`}
      >
        {done ? "✓" : "…"}
      </span>
      <span className={done ? "text-slate-200" : "text-slate-400"}>{label}</span>
      <span className="sr-only">{done ? "완료" : "진행 중"}</span>
    </li>
  );
}

export default function LoadingOverlay({ networkReady, assetsReady, disconnected, setupLabel, setupFailed }: Props) {
  return (
    <div role="status" aria-live="polite" className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/85 p-6 backdrop-blur">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/90 p-8 text-white">
        <p className="text-sm font-semibold tracking-[0.24em] text-sky-400">LOADING</p>
        <h2 className="mt-2 text-2xl font-bold">전장을 준비하고 있습니다</h2>

        <ul className="mt-6 flex flex-col gap-3">
          <Checklist done={networkReady} label={networkReady ? "게임 서버에 연결하고 부대를 배치하는 중" : `게임 서버 준비 — ${setupLabel}`} />
          <Checklist done={assetsReady} label="전장과 병사 모델을 내려받는 중" />
        </ul>

        {setupFailed && !disconnected && (
          <div className="mt-6 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
            <p>서버가 스테이지 준비 요청을 거절했습니다.</p>
            <p className="mt-1 text-amber-100/70">브라우저 콘솔의 COMMAND_RESULT 로그에서 사유를 확인한 뒤 접속을 다시 눌러 주세요.</p>
          </div>
        )}

        {disconnected && (
          <div className="mt-6 rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            <p>게임 서버에 연결하지 못했습니다.</p>
            <p className="mt-1 text-red-200/70">화면 왼쪽 위에서 서버 주소를 확인하고 접속 버튼을 눌러 주세요.</p>
            <Link href="/stage" className="mt-3 inline-block font-semibold text-red-100 underline underline-offset-4 hover:text-white">
              스테이지 선택으로 돌아가기
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
