import { isTutorialStage, type ObjectiveStep, type StageData } from "../../../(lib)/stages";

type Props = {
  stage: StageData;
  step: ObjectiveStep;
  stepIndex: number;
  stepCount: number;
  progressRatio: number | null;
  progressLabel: string | null;
  onHintSelect: (hint: string) => void;
};

export default function ObjectivePanel({
  stage,
  step,
  stepIndex,
  stepCount,
  progressRatio,
  progressLabel,
  onHintSelect,
}: Props) {
  return (
    <div className="fixed left-1/2 top-20 w-120 max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-lg border border-white/10 bg-black/75 px-5 py-4 text-white">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-bold tracking-[0.18em] text-sky-400">
          STAGE {stage.id} · {stage.title}
        </span>
        {stepCount > 1 && (
          <span className="tabular-nums text-white/50">
            목표 {stepIndex + 1} / {stepCount}
          </span>
        )}
      </div>

      <p className="mt-2 text-sm font-semibold leading-relaxed">{step.label}</p>

      {progressRatio !== null && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-sky-400 transition-[width]"
            style={{ width: `${Math.round(progressRatio * 100)}%` }}
          />
        </div>
      )}
      {progressLabel && <p className="mt-2 text-xs tabular-nums text-white/55">{progressLabel}</p>}

      {isTutorialStage(stage) && (
        <button
          type="button"
          onClick={() => onHintSelect(step.hintCommand)}
          className="mt-3 w-full truncate rounded-md border border-white/15 bg-white/10 px-3 py-2 text-left text-xs text-white/70 transition hover:border-sky-400/60 hover:bg-sky-400/10 hover:text-sky-200"
        >
          예시 명령 — {step.hintCommand}
        </button>
      )}
    </div>
  );
}
