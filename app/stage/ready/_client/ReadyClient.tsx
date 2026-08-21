"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
import GameSelectionShell from "../../../_components/GameSelectionShell";
import UiPanelFrame from "../../../_components/UiPanelFrame";
import styles from "./ReadyClient.module.css";

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
    const hydrate = () => {
      setGameData(loadGameData());

      const saved = loadDeployment(stageID);
      if (saved && saved.squads.length > 0) setSquads(saved.squads);
      loadedRef.current = true;
    };
    hydrate();
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
    <GameSelectionShell
      eyebrow={`STAGE ${stageID} · BATTLE READY`}
      title={`출정 준비 — ${stageTitle}`}
      description={`스쿼드에 병력을 배치한 뒤 출정하세요. 스쿼드당 최대 ${MAX_SQUAD_SOLDIERS}명입니다.`}
      backHref="/stage"
      backLabel="스테이지 선택"
    >
      <section className={styles.inventory} aria-label="잔여 병력">
        <dl>
          {TROOPS.map(({ key, label }) => (
            <div key={key}>
              <dt>잔여 {label}</dt>
              <dd>
                {remaining[key].toLocaleString()}
                <span>/ {gameData[key].toLocaleString()}</span>
              </dd>
            </div>
          ))}
        </dl>
        <div className={styles.deployedTotal}>
          <span>배치 병력</span>
          <strong>{totalDeployed.toLocaleString()}</strong>
        </div>
      </section>

      <div className={styles.squadList}>
        {squads.map((squad, index) => (
          <article key={index} className={styles.squad}>
            <div className={styles.squadIdentity}>
              <span>SQUAD {index + 1}</span>
              <input
                value={squad.name}
                onChange={(event) => updateSquad(index, { name: event.target.value })}
                maxLength={SQUAD_NAME_MAX_LENGTH}
                aria-label={`${index + 1}번 스쿼드 이름`}
              />
            </div>

            <div className={styles.troopControls}>
              {TROOPS.map(({ key, label }) => (
                <div key={key} className={styles.troopControl}>
                  <span className={styles.troopLabel}>{label}</span>
                  <button
                    type="button"
                    onClick={() => changeCount(index, key, -1)}
                    disabled={squad[key] <= 0}
                    aria-label={`${squad.name} ${label} 감소`}
                    className={styles.countButton}
                  >
                    −
                  </button>
                  <span className={styles.count}>{squad[key]}</span>
                  <button
                    type="button"
                    onClick={() => changeCount(index, key, 1)}
                    disabled={remaining[key] <= 0 || squadSoldierCount(squad) >= MAX_SQUAD_SOLDIERS}
                    aria-label={`${squad.name} ${label} 증가`}
                    className={styles.countButton}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => fillMax(index, key)}
                    disabled={remaining[key] <= 0 || squadSoldierCount(squad) >= MAX_SQUAD_SOLDIERS}
                    aria-label={`${squad.name} ${label} 최대로 채우기`}
                    className={styles.maxButton}
                  >
                    MAX
                  </button>
                </div>
              ))}
            </div>

            <div className={styles.squadSummary}>
              <span>
                합계 <strong>{squadSoldierCount(squad)}</strong>
              </span>
              <button
                type="button"
                onClick={() => removeSquad(index)}
                disabled={squads.length <= 1}
                className={styles.removeButton}
              >
                삭제
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          onClick={addSquad}
          disabled={squads.length >= MAX_SQUAD_COUNT}
          className={styles.addButton}
        >
          <UiPanelFrame
            variant="slim"
            className={styles.addFrame}
            sizes="(max-width: 700px) 100vw, 34rem"
          />
          <span className={styles.actionLabel}>스쿼드 추가 ({squads.length}/{MAX_SQUAD_COUNT})</span>
        </button>

        <button type="button" onClick={deploy} disabled={totalDeployed === 0} className={styles.deployButton}>
          <UiPanelFrame variant="slim" className={styles.deployFrame} sizes="(max-width: 700px) 100vw, 34rem" />
          <span className={styles.actionLabel}>
            {totalDeployed === 0 ? "병력을 배치해 주세요" : `출정 (${totalDeployed.toLocaleString()}명)`}
          </span>
          <span className={styles.deployAccent} aria-hidden="true">
            <Image
              src="/ui/pack/accent-blue.webp"
              alt=""
              fill
              sizes="18rem"
              draggable={false}
              unoptimized
              className={styles.deployAccentArt}
            />
          </span>
        </button>
      </div>
    </GameSelectionShell>
  );
}
