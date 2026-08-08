import Link from "next/link";
import Image from "next/image";
import CommandHeader from "../_components/CommandHeader";

const menus = [
  {
    href: "/stage",
    eyebrow: "DEPLOY",
    title: "출정",
    description: "전장과 스테이지를 선택합니다.",
  },
  {
    href: "/troop",
    eyebrow: "RECRUIT",
    title: "부대 충원",
    description: "부대에 충원할 병과를 선택합니다.",
  },
  {
    href: "/building",
    eyebrow: "FACILITY",
    title: "부대 설비",
    description: "관리할 부대 시설을 선택합니다.",
  },

  {
    href: "/main",
    eyebrow: "ONLINE",
    title: "온라인 대전",
    description: "온라인으로 상대와 전략을 다툽니다 (준비중입니다.)",
  },
];

export default function Page() {
  return (
    <main className="relative isolate min-h-dvh bg-slate-950 text-white">
      <Image src={"/bg/main.webp"} fill priority className="-z-10 object-cover object-top" alt="" />

      <CommandHeader />

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div>
          <p className="text-sm font-semibold tracking-[0.24em] text-sky-400">SQUAD MANAGEMENT</p>
          <h1 className="mt-2 text-3xl font-bold">부대 관리</h1>
          <p className="mt-3 text-slate-400">진행할 부대 업무를 선택해 주세요.</p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {menus.map((menu) => (
            <Link
              key={menu.href}
              href={menu.href}
              className="min-h-48 rounded-xl border border-white/10 bg-black/40 p-5 transition hover:-translate-y-1 hover:border-sky-400/50 hover:bg-sky-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
            >
              <span className="text-sm font-semibold text-sky-400">{menu.eyebrow}</span>
              <h2 className="mt-5 text-xl font-bold text-white">{menu.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{menu.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
