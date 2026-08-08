"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import CommandHeader from "../../../_components/CommandHeader";
import {
  createEmptySquad,
  deployedCounts,
  loadDeployment,
  MAX_SQUAD_COUNT,
  MAX_SQUAD_SOLDIERS,
  saveDeployment,
  squadSoldierCount,
  SQUAD_NAME_MAX_LENGTH,
  type DeploymentSquad,
} from "../../../(lib)/squadfuncs";
import { DEFAULT_GAME_DATA, loadGameData, type GameData, type TroopKey } from "../../../(lib)/_gametype";

const TROOPS: { key: TroopKey; label: string }[] = [
  { key: "warrior", label: "전사" },
  { key: "archer", label: "궁수" },
  { key: "knight", label: "기병" },
];

type ReadyClientProps = {
  stageID: number;
  stageTitle: string;
};

export default function ReadyClient({ stageID, stageTitle }: ReadyClientProps) {
  const router = useRouter();
  const [gameData, setGameData] = useState<GameData>(DEFAULT_GAME_DATA);
  const [squads, setSquads] = useState<DeploymentSquad[]>([createEmptySquad(0)]);
  const loadedRef = useRef(false);

  // 로컬스토리지는 서버 렌더 시점에 없으므로 마운트 후에 읽는다.
  useEffect(() => {
    setGameData(loadGameData());

    const saved = loadDeployment(stageID);
    if (saved && saved.squads.length > 0) setSquads(saved.squads);
    loadedRef.current = true;
  }, [stageID]);

  // 편성을 바꿀 때마다 저장해 두면 게임 화면이 그대로 읽어 간다.
  // 병력 0인 스쿼드는 생성되지 않으므로 저장에서도 빼야 게임 화면의 순서·이름과 어긋나지 않는다.
  useEffect(() => {
    if (!loadedRef.current) return;
    saveDeployment({ stageID, squads: squads.filter((squad) => squadSoldierCount(squad) > 0) });
  }, [stageID, squads]);

  const applyEdit = (nextSquads: DeploymentSquad[]) => setSquads(nextSquads);

  const deployed = deployedCounts(squads);
  const remaining: Record<TroopKey, number> = {
    warrior: gameData.warrior - deployed.warrior,
    archer: gameData.archer - deployed.archer,
    knight: gameData.knight - deployed.knight,
  };
  const totalDeployed = deployed.warrior + deployed.archer + deployed.knight;

  const updateSquad = (index: number, patch: Partial<DeploymentSquad>) => {
    applyEdit(squads.map((squad, i) => (i === index ? { ...squad, ...patch } : squad)));
  };

  const changeCount = (index: number, troop: TroopKey, delta: number) => {
    const squad = squads[index];
    if (!squad) return;

    const next = squad[troop] + delta;
    if (next < 0) return;
    if (delta > 0 && (remaining[troop] <= 0 || squadSoldierCount(squad) >= MAX_SQUAD_SOLDIERS)) return;

    updateSquad(index, { [troop]: next });
  };

  /** 남은 병력을 스쿼드 정원이 허용하는 만큼 한 번에 채운다. */
  const fillMax = (index: number, troop: TroopKey) => {
    const squad = squads[index];
    if (!squad) return;

    const room = MAX_SQUAD_SOLDIERS - squadSoldierCount(squad);
    const added = Math.min(remaining[troop], room);
    if (added <= 0) return;

    updateSquad(index, { [troop]: squad[troop] + added });
  };

  const addSquad = () => {
    if (squads.length >= MAX_SQUAD_COUNT) return;
    applyEdit([...squads, createEmptySquad(squads.length)]);
  };

  const removeSquad = (index: number) => {
    if (squads.length <= 1) return;
    applyEdit(squads.filter((_, i) => i !== index));
  };

  const deploy = () => {
    if (totalDeployed === 0) return;

    saveDeployment({ stageID, squads: squads.filter((squad) => squadSoldierCount(squad) > 0) });
    router.push(`/game?stage=${stageID}`);
  };

  return (
    <main className="relative isolate min-h-dvh bg-slate-950 text-white">
      <Image src={"/bg/main.webp"} fill priority className="-z-10 object-cover object-top" alt="" />

      <CommandHeader />

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div>
          <p className="text-sm font-semibold tracking-[0.24em] text-sky-400">STAGE {stageID} · BATTLE READY</p>
          <h1 className="mt-2 text-3xl font-bold">출정 준비 — {stageTitle}</h1>
          <p className="mt-3 text-slate-400">스쿼드에 병력을 배치한 뒤 출정하세요. 스쿼드당 최대 {MAX_SQUAD_SOLDIERS}명입니다.</p>
        </div>

        <Link
          href="/stage"
          className="mt-8 flex h-12 w-full items-center justify-center rounded-lg border border-white/15 bg-black/40 text-sm font-semibold text-slate-200 transition hover:border-sky-400/60 hover:bg-sky-400/10 hover:text-sky-300"
        >
          돌아가기
        </Link>

        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-white/10 bg-black/40 px-5 py-4">
          {TROOPS.map(({ key, label }) => (
            <div key={key} className="flex items-baseline gap-2">
              <dt className="text-sm text-slate-400">잔여 {label}</dt>
              <dd className="text-base font-bold tabular-nums text-slate-100">
                {remaining[key].toLocaleString()}
                <span className="ml-1 text-xs font-normal text-slate-500">/ {gameData[key].toLocaleString()}</span>
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 flex flex-col gap-3">
          {squads.map((squad, index) => (
            <div key={index} className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-white/10 bg-black/40 p-5">
              <div className="flex min-w-56 flex-1 items-center gap-3">
                <span className="text-sm font-semibold text-sky-400">SQUAD {index + 1}</span>
                <input
                  value={squad.name}
                  onChange={(event) => updateSquad(index, { name: event.target.value })}
                  maxLength={SQUAD_NAME_MAX_LENGTH}
                  aria-label={`${index + 1}번 스쿼드 이름`}
                  className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white outline-none transition placeholder:text-white/35 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
                />
              </div>

              {TROOPS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="w-8 text-sm text-slate-400">{label}</span>
                  <button
                    type="button"
                    onClick={() => changeCount(index, key, -1)}
                    disabled={squad[key] <= 0}
                    aria-label={`${squad.name} ${label} 감소`}
                    className="size-8 rounded-lg border border-white/15 bg-black/40 text-lg font-bold text-slate-200 transition hover:border-sky-400/60 hover:bg-sky-400/10 disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className="w-10 text-center text-base font-bold tabular-nums text-white">{squad[key]}</span>
                  <button
                    type="button"
                    onClick={() => changeCount(index, key, 1)}
                    disabled={remaining[key] <= 0 || squadSoldierCount(squad) >= MAX_SQUAD_SOLDIERS}
                    aria-label={`${squad.name} ${label} 증가`}
                    className="size-8 rounded-lg border border-white/15 bg-black/40 text-lg font-bold text-slate-200 transition hover:border-sky-400/60 hover:bg-sky-400/10 disabled:opacity-30"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => fillMax(index, key)}
                    disabled={remaining[key] <= 0 || squadSoldierCount(squad) >= MAX_SQUAD_SOLDIERS}
                    aria-label={`${squad.name} ${label} 최대로 채우기`}
                    className="h-8 rounded-lg border border-white/15 bg-black/40 px-2 text-xs font-bold text-slate-200 transition hover:border-sky-400/60 hover:bg-sky-400/10 disabled:opacity-30"
                  >
                    MAX
                  </button>
                </div>
              ))}

              <span className="text-sm text-slate-400">
                합계 <strong className="font-bold tabular-nums text-slate-100">{squadSoldierCount(squad)}</strong>
              </span>

              <button
                type="button"
                onClick={() => removeSquad(index)}
                disabled={squads.length <= 1}
                className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-red-400/60 hover:bg-red-400/10 hover:text-red-300 disabled:opacity-30"
              >
                삭제
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addSquad}
          disabled={squads.length >= MAX_SQUAD_COUNT}
          className="mt-3 h-12 w-full rounded-lg border border-dashed border-white/20 bg-black/30 text-sm font-semibold text-slate-300 transition hover:border-sky-400/60 hover:bg-sky-400/10 hover:text-sky-300 disabled:opacity-30"
        >
          스쿼드 추가 ({squads.length}/{MAX_SQUAD_COUNT})
        </button>

        <button
          type="button"
          onClick={deploy}
          disabled={totalDeployed === 0}
          className="mt-4 h-14 w-full rounded-lg bg-sky-500 text-base font-bold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {totalDeployed === 0 ? "병력을 배치해 주세요" : `출정 (${totalDeployed.toLocaleString()}명)`}
        </button>
      </section>
    </main>
  );
}
