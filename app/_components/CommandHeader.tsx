"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DEFAULT_GAME_DATA, GAME_DATA_UPDATED_EVENT, loadGameData, type GameData } from "../(lib)/_gametype";

const NICKNAME_STORAGE_KEY = "nickname";

const TROOP_LABEL: { key: keyof GameData; label: string }[] = [
  { key: "warrior", label: "전사" },
  { key: "archer", label: "궁수" },
  { key: "knight", label: "기사" },
];

export default function CommandHeader() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [gameData, setGameData] = useState<GameData>(DEFAULT_GAME_DATA);

  // 로컬스토리지는 서버 렌더 시점에 없으므로 마운트 후에 읽는다.
  useEffect(() => {
    setNickname(localStorage.getItem(NICKNAME_STORAGE_KEY) ?? "");

    // 충원·강화로 저장값이 바뀌면 헤더의 골드/병력도 따라 갱신한다.
    const sync = () => setGameData(loadGameData());
    sync();

    window.addEventListener(GAME_DATA_UPDATED_EVENT, sync);
    return () => window.removeEventListener(GAME_DATA_UPDATED_EVENT, sync);
  }, []);

  const logout = () => {
    localStorage.removeItem(NICKNAME_STORAGE_KEY);
    router.replace("/");
  };

  return (
    <header className="fixed top-5 left-5 z-10">
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur">
        <div className="flex items-start gap-4">
          <Image src="/profile/warrior.webp" width={130} height={130} alt="" className="rounded-xl" />

          <div className="flex h-full w-full flex-col  items-start justify-between gap-1">
            <span className="text-lg font-bold text-white">{nickname || "지휘관"}</span>
            <span className="text-sm font-semibold text-amber-300">{gameData.gold.toLocaleString()} G</span>

            <dl className="mt-1 flex gap-4">
              {TROOP_LABEL.map(({ key, label }) => (
                <div key={key} className="flex items-baseline gap-1.5">
                  <dt className="text-xs text-slate-400">{label}</dt>
                  <dd className="text-sm font-semibold tabular-nums text-slate-100">{gameData[key].toLocaleString()}</dd>
                </div>
              ))}
            </dl>

            <button
              type="button"
              onClick={logout}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-red-400/60 hover:bg-red-400/10 hover:text-red-300"
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
