import Link from "next/link";
import type { DeploymentSquad } from "../../../../(lib)/squadfuncs";
import type { StageData } from "../../../../(lib)/stages";
import styles from "./GameOverlay.module.css";

type Props = {
  stage: StageData;
  squads: DeploymentSquad[];
  onManualOpen: () => void;
  onStart: () => void;
};

export default function BriefingOverlay({ stage, squads, onManualOpen, onStart }: Props) {
  return (
    <div role="dialog" aria-modal="true" aria-label="작전 브리핑" className={styles.overlay}>
      <div className={styles.shade} aria-hidden="true" />
      <div className={styles.screenFrame} aria-hidden="true" />

      <section className={`${styles.dialog} ${styles.briefingDialog}`}>
        <div className={styles.topBar}>
          <span>OPERATION BRIEFING</span>
          <span>STAGE {stage.id}</span>
        </div>

        <p className={styles.eyebrow}>STAGE {stage.id}</p>
        <h2 className={styles.title}>{stage.title}</h2>
        <p className={styles.lead}>{stage.description}</p>

        <h3 className={styles.sectionTitle}>작전 목표</h3>
        <p className={styles.objective}>{stage.objective.label}</p>

        {squads.length > 0 && (
          <>
            <h3 className={styles.sectionTitle}>출전 부대</h3>
            <ul className={styles.squadList}>
              {squads.map((squad, index) => (
                <li key={index} className={styles.squadRow}>
                  <span>{squad.name}</span>
                  <span className={styles.squadCounts}>
                    <span>
                      보병 <b>{squad.warrior}</b>
                    </span>
                    <span>
                      궁병 <b>{squad.archer}</b>
                    </span>
                    <span>
                      기병 <b>{squad.knight}</b>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className={styles.helperText}>화면 아래 입력창에 자연어로 명령하면 AI가 부대를 움직입니다.</p>

        <div className={styles.actions}>
          <button type="button" onClick={onStart} autoFocus className={styles.primaryButton}>
            작전 시작
          </button>
          <button type="button" onClick={onManualOpen} className={styles.secondaryButton}>
            사용설명서
          </button>
          <Link href="/stage" className={styles.secondaryButton}>
            스테이지 선택
          </Link>
        </div>
      </section>
    </div>
  );
}
