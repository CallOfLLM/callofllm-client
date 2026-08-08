import Image from "next/image";
import Link from "next/link";
import CommandHeader from "./CommandHeader";

export type SelectionItem = {
  label: string;
  eyebrow: string;
  description: string;
  /** 있으면 카드에 소모 골드를 표시한다. */
  cost?: number;
  /** 있으면 카드 우측에 현재 상태를 표시한다. 예: "보유 3", "공격력 13" */
  meta?: string;
  disabled?: boolean;
};

type SelectionButtonPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  items: SelectionItem[];
  /** 클라이언트 컴포넌트에서만 넘긴다. 없으면 카드는 그냥 표시용이다. */
  onSelect?: (item: SelectionItem) => void;
};

export default function SelectionButtonPage({ eyebrow, title, description, items, onSelect }: SelectionButtonPageProps) {
  return (
    <main className="relative isolate min-h-dvh bg-slate-950 text-white">
      <Image src={"/bg/main.webp"} fill priority className="-z-10 object-cover object-top" alt="" />

      <CommandHeader />

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div>
          <p className="text-sm font-semibold tracking-[0.24em] text-sky-400">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold">{title}</h1>
          <p className="mt-3 text-slate-400">{description}</p>
        </div>

        <Link
          href="/main"
          className="mt-8 flex h-12 w-full items-center justify-center rounded-lg border border-white/15 bg-black/40 text-sm font-semibold text-slate-200 transition hover:border-sky-400/60 hover:bg-sky-400/10 hover:text-sky-300"
        >
          돌아가기
        </Link>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onClick={onSelect && (() => onSelect(item))}
              className="min-h-48 rounded-xl border border-white/10 bg-black/40 p-5 text-left transition hover:-translate-y-1 hover:border-sky-400/50 hover:bg-sky-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:pointer-events-none disabled:opacity-40"
            >
              <span className="text-sm font-semibold text-sky-400">{item.eyebrow}</span>
              <strong className="mt-5 block text-xl font-bold text-white">{item.label}</strong>
              <span className="mt-2 block text-sm leading-6 text-slate-400">{item.description}</span>

              {item.cost !== undefined && (
                <span className="mt-4 flex items-baseline justify-between">
                  <span className="text-base font-bold text-amber-300">{item.cost.toLocaleString()} G</span>
                  {item.meta && <span className="text-sm text-slate-400">{item.meta}</span>}
                </span>
              )}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
