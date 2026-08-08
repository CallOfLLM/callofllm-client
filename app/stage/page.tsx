import Link from "next/link";
import Image from "next/image";
import CommandHeader from "../_components/CommandHeader";
import stages from "./stages.json";

export default function Page() {
  return (
    <main className="relative isolate min-h-dvh bg-slate-950 text-white">
      <Image src={"/bg/main.webp"} fill priority className="-z-10 object-cover object-top" alt="" />

      <CommandHeader />

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div>
          <p className="text-sm font-semibold tracking-[0.24em] text-sky-400">STAGE SELECT</p>
          <h1 className="mt-2 text-3xl font-bold">스테이지 선택</h1>
          <p className="mt-3 text-slate-400">도전할 스테이지를 선택해 주세요.</p>
        </div>

        <Link
          href="/main"
          className="mt-8 flex h-12 w-full items-center justify-center rounded-lg border border-white/15 bg-black/40 text-sm font-semibold text-slate-200 transition hover:border-sky-400/60 hover:bg-sky-400/10 hover:text-sky-300"
        >
          돌아가기
        </Link>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {stages.map((stage) => {
            const content = (
              <>
                <div className="flex items-center justify-between">
                  <span className={stage.available ? "text-sm font-semibold text-sky-400" : "text-sm font-semibold text-slate-600"}>STAGE {stage.id}</span>
                  {!stage.available && <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-500">준비 중</span>}
                </div>
                <h2 className={`mt-5 text-xl font-bold ${stage.available ? "text-white" : "text-slate-500"}`}>{stage.title}</h2>
                <p className={`mt-2 text-sm leading-6 ${stage.available ? "text-slate-400" : "text-slate-600"}`}>{stage.description}</p>
              </>
            );

            return stage.available ? (
              <Link
                key={stage.id}
                href={`/stage/ready?stage=${stage.id}`}
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
      </section>
    </main>
  );
}
