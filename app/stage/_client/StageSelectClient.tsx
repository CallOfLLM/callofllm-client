"use client";

// 스테이지 잠금은 로컬스토리지의 진행도로 정해지므로 목록은 브라우저에서 그린다.

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DEFAULT_GAME_DATA, GAME_DATA_UPDATED_EVENT, loadGameData } from "../../(lib)/_gametype";
import { isStageAvailable, isTutorialStage, STAGES, type StageData } from "../../(lib)/stages";
import UiPanelFrame from "../../_components/UiPanelFrame";
import styles from "./StageSelectClient.module.css";

/** 튜토리얼은 편성이 고정이라 준비 화면을 건너뛰고 바로 전장으로 간다. */
function stageHref(stage: StageData) {
  return isTutorialStage(stage) ? `/game?stage=${stage.id}` : `/stage/ready?stage=${stage.id}`;
}

export default function StageSelectClient() {
  const [clearedStage, setClearedStage] = useState(DEFAULT_GAME_DATA.clearedStage);

  // 로컬스토리지는 서버 렌더 시점에 없으므로 마운트 후에 읽는다.
  useEffect(() => {
    const sync = () => setClearedStage(loadGameData().clearedStage);
    sync();

    window.addEventListener(GAME_DATA_UPDATED_EVENT, sync);
    return () => window.removeEventListener(GAME_DATA_UPDATED_EVENT, sync);
  }, []);

  return (
    <div className={styles.grid}>
      {STAGES.map((stage) => {
        const available = isStageAvailable(stage.id, clearedStage);
        const cleared = stage.id <= clearedStage;
        const tutorial = isTutorialStage(stage);
        const status = cleared ? "클리어" : available ? (tutorial ? "튜토리얼" : "출정 가능") : "잠김";
        const icon = available ? "/ui/pack/swords.webp" : "/ui/pack/pause.webp";
        const accent = available ? "/ui/pack/accent-blue.webp" : "/ui/pack/accent-red.webp";

        const content = (
          <>
            <span className={styles.icon} aria-hidden="true">
              <Image
                src={icon}
                alt=""
                fill
                sizes="(max-width: 700px) 84px, 112px"
                draggable={false}
                unoptimized
                className={styles.iconArt}
              />
            </span>

            <span className={styles.copy}>
              <UiPanelFrame className={styles.frame} sizes="(max-width: 700px) 72vw, 28rem" />
              <span className={styles.copyContent}>
                <span className={styles.metaRow}>
                  <span>STAGE {stage.id}</span>
                  <span className={styles.status}>{status}</span>
                </span>
                <strong>{stage.title}</strong>
                <span className={styles.description}>
                  {available ? stage.description : "앞 스테이지를 먼저 클리어해 주세요."}
                </span>
                <span className={styles.reward}>첫 클리어 보상 {stage.rewardGold.toLocaleString()} G</span>
              </span>
              <span className={styles.accent} aria-hidden="true">
                <Image
                  src={accent}
                  alt=""
                  fill
                  sizes="14rem"
                  draggable={false}
                  unoptimized
                  className={styles.accentArt}
                />
              </span>
            </span>
          </>
        );

        return available ? (
          <Link
            key={stage.id}
            href={stageHref(stage)}
            className={`${styles.item} ${cleared ? styles.cleared : ""}`}
          >
            {content}
          </Link>
        ) : (
          <article key={stage.id} className={`${styles.item} ${styles.locked}`}>
            {content}
          </article>
        );
      })}
    </div>
  );
}
