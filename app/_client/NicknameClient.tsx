"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const NICKNAME_STORAGE_KEY = "nickname";

export default function NicknameClient() {
  const router = useRouter();
  const nicknameRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const savedNickname = localStorage.getItem(NICKNAME_STORAGE_KEY);

    if (savedNickname) {
      router.replace("/main");
    }
  }, [router]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nickname = nicknameRef.current?.value.trim() ?? "";

    if (!nickname) {
      setError("닉네임을 입력해 주세요.");
      nicknameRef.current?.focus();
      return;
    }

    localStorage.setItem(NICKNAME_STORAGE_KEY, nickname);
    router.push("/main");
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-6 text-white">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
        <p className="mb-2 text-sm font-semibold tracking-[0.24em] text-sky-400">CALL OF LLM</p>
        <h1 className="text-3xl font-bold">닉네임 설정</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">게임에서 사용할 닉네임을 입력해 주세요.</p>

        <form className="mt-8" onSubmit={handleSubmit}>
          <label htmlFor="nickname" className="mb-2 block text-sm font-medium text-slate-200">
            닉네임
          </label>
          <input
            ref={nicknameRef}
            id="nickname"
            name="nickname"
            type="text"
            maxLength={16}
            autoComplete="nickname"
            placeholder="닉네임을 입력하세요"
            aria-describedby={error ? "nickname-error" : undefined}
            aria-invalid={Boolean(error)}
            onChange={() => error && setError("")}
            className="h-12 w-full rounded-lg border border-white/15 bg-black/30 px-4 outline-none transition placeholder:text-slate-600 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
          />

          {error && (
            <p id="nickname-error" role="alert" className="mt-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <button type="submit" className="mt-6 h-12 w-full rounded-lg bg-sky-500 font-bold text-slate-950 transition hover:bg-sky-400 active:bg-sky-600">
            부대 관리로 이동
          </button>
        </form>
      </section>
    </main>
  );
}
