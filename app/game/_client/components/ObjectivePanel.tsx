import type { StageData } from "../../../(lib)/stages";
import styles from "./GameHud.module.css";

type Props = {
  stage: StageData;
  onManualOpen: () => void;
};

export default function ObjectivePanel({ stage, onManualOpen }: Props) {
  return (
    <section className={styles.objectivePanel} aria-label="작전 목표">
      <p className={styles.objectiveEyebrow}>
        STAGE {stage.id} · {stage.title}
      </p>

      <p className={styles.objectiveText}>{stage.objective.label}</p>

      <button type="button" onClick={onManualOpen} className={styles.manualButton}>
        사용설명서 다시 보기
      </button>
    </section>
  );
}
