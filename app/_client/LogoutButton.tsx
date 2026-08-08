"use client";

import { useRouter } from "next/navigation";

const NICKNAME_STORAGE_KEY = "nickname";

export default function LogoutButton() {
  const router = useRouter();

  const logout = () => {
    localStorage.removeItem(NICKNAME_STORAGE_KEY);
    router.replace("/");
  };

  return (
    <button
      type="button"
      onClick={logout}
      className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-red-400/60 hover:bg-red-400/10 hover:text-red-300"
    >
      로그아웃
    </button>
  );
}
