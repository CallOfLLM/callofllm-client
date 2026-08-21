import { isTutorialStage, type StageData } from "../../../(lib)/stages";
import styles from "./GameHud.module.css";

type Props = {
  stage: StageData;
  onHintSelect: (hint: string) => void;
};

export default function ObjectivePanel({ stage, onHintSelect }: Props) {
  return (
    <section className={styles.objectivePanel} aria-label="작전 목표">
      <p className={styles.objectiveEyebrow}>
        STAGE {stage.id} · {stage.title}
      </p>

      <p className={styles.objectiveText}>{stage.objective.label}</p>

      {isTutorialStage(stage) && (
        <button
          type="button"
          onClick={() => onHintSelect(stage.objective.hintCommand)}
          className={styles.hintButton}
        >
          예시 명령 — {stage.objective.hintCommand}
        </button>
      )}
    </section>
  );
}
