import Link from "next/link";
import Image from "next/image";
import CommandHeader from "../_components/CommandHeader";
import StageSelectClient from "./_client/StageSelectClient";

export default function Page() {
  return (
    <main className="relative isolate min-h-dvh bg-slate-950 text-white">
      <Image src={"/bg/main.webp"} fill priority className="-z-10 object-cover object-top" alt="" />

      <CommandHeader />

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div>
          <p className="text-sm font-semibold tracking-[0.24em] text-sky-400">STAGE SELECT</p>
          <h1 className="mt-2 text-3xl font-bold">스테이지 선택</h1>
          <p className="mt-3 text-slate-400">도전할 스테이지를 선택해 주세요. 앞 스테이지를 클리어하면 다음이 열립니다.</p>
        </div>

        <Link
          href="/main"
          className="mt-8 flex h-12 w-full items-center justify-center rounded-lg border border-white/15 bg-black/40 text-sm font-semibold text-slate-200 transition hover:border-sky-400/60 hover:bg-sky-400/10 hover:text-sky-300"
        >
          돌아가기
        </Link>

        <StageSelectClient />
      </section>
    </main>
  );
}
