import Link from "next/link";
import LogoutButton from "../_client/LogoutButton";

type CommandHeaderProps = {
  backHref?: string;
  backLabel?: string;
};

export default function CommandHeader({ backHref, backLabel = "돌아가기" }: CommandHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/90 px-6 py-4 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2">
          <span className="text-sm text-amber-200/70">골드</span>
          <strong className="ml-3 text-lg text-amber-300">0</strong>
        </div>

        <nav aria-label="계정 및 페이지 이동" className="flex items-center gap-2">
          {backHref && (
            <Link
              href={backHref}
              className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-sky-400/60 hover:bg-sky-400/10 hover:text-sky-300"
            >
              {backLabel}
            </Link>
          )}
          <LogoutButton />
        </nav>
      </div>
    </header>
  );
}
