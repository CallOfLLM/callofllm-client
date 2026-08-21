import Link from "next/link";
import type { DeploymentSquad } from "../../../../(lib)/squadfuncs";
import { isTutorialStage, type StageData } from "../../../../(lib)/stages";
import styles from "./GameOverlay.module.css";

type Props = {
  stage: StageData;
  squads: DeploymentSquad[];
  onStart: () => void;
};

export default function BriefingOverlay({ stage, squads, onStart }: Props) {
  const tutorial = isTutorialStage(stage);

  return (
    <div role="dialog" aria-modal="true" aria-label="작전 브리핑" className={styles.overlay}>
      <div className={styles.shade} aria-hidden="true" />
      <div className={styles.screenFrame} aria-hidden="true" />

      <section className={`${styles.dialog} ${styles.briefingDialog}`}>
        <div className={styles.topBar}>
          <span>OPERATION BRIEFING</span>
          <span>STAGE {stage.id}</span>
        </div>

        <p className={styles.eyebrow}>
          STAGE {stage.id}
          {tutorial && " · TUTORIAL"}
        </p>
        <h2 className={styles.title}>{stage.title}</h2>
        <p className={styles.lead}>{stage.description}</p>

        <h3 className={styles.sectionTitle}>작전 목표</h3>
        <p className={styles.objective}>{stage.objective.label}</p>

        {tutorial && (
          <section className={styles.tutorial}>
            <h3>전투 도움말</h3>
            <p>전장은 640m × 320m입니다. 정확한 좌표 대신 방향과 미터 거리로 명령하세요.</p>
            <ol>
              <li>
                <span className={styles.step}>1</span>
                <div>
                  <p>먼저 이동</p>
                  <p>적과 거리를 좁히거나 유리한 위치로 부대를 움직입니다.</p>
                  <code>모두 앞으로 전진!</code>
                  <code>또는 앞으로 10미터 전진</code>
                </div>
              </li>
              <li>
                <span className={styles.step}>2</span>
                <div>
                  <p>이어서 공격</p>
                  <p>공격 명령을 내리면 가장 가까운 적을 추적합니다. 적군이 전멸하면 클리어됩니다.</p>
                  <code>모두 공격!</code>
                </div>
              </li>
            </ol>
          </section>
        )}

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
          <Link href="/stage" className={styles.secondaryButton}>
            스테이지 선택
          </Link>
        </div>
      </section>
    </div>
  );
}
