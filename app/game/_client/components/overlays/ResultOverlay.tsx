import Link from "next/link";
import styles from "./GameOverlay.module.css";

type Props = {
  clear: boolean;
  reason: string;
  stageID: number;
  stageTitle: string;
  awardedGold: number;
  nextHref: string | null;
};

export default function ResultOverlay({ clear, reason, stageID, stageTitle, awardedGold, nextHref }: Props) {
  return (
    <div role="alertdialog" aria-modal="true" className={styles.overlay}>
      <div className={styles.shade} aria-hidden="true" />
      <div className={styles.screenFrame} aria-hidden="true" />

      <section className={`${styles.dialog} ${styles.resultDialog} ${clear ? "" : styles.failure}`}>
        <div className={styles.topBar}>
          <span>BATTLE REPORT</span>
          <span>{clear ? "MISSION CLEAR" : "MISSION FAILED"}</span>
        </div>

        <p className={styles.eyebrow}>
          STAGE {stageID} · {clear ? "CLEAR" : "FAILED"}
        </p>
        <h2 className={styles.title}>{clear ? "작전 성공" : "작전 실패"}</h2>
        <p className={styles.lead}>{stageTitle}</p>
        <p className={styles.objective}>{reason}</p>

        {clear && awardedGold > 0 && <p className={styles.reward}>+{awardedGold.toLocaleString()} G</p>}

        <div className={styles.actions}>
          {nextHref && (
            // 같은 /game 경로의 다음 튜토리얼도 모든 게임 상태를 새로 만들도록 전체 이동한다.
            <a href={nextHref} className={styles.primaryButton}>
              다음 스테이지
            </a>
          )}
          {/* 소켓과 서버 배치를 처음부터 다시 만들어야 하므로 페이지 전체를 다시 로드한다. */}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={clear ? styles.secondaryButton : styles.primaryButton}
          >
            다시 시도
          </button>
          <Link href="/stage" className={styles.secondaryButton}>
            스테이지 선택
          </Link>
        </div>
      </section>
    </div>
  );
}
