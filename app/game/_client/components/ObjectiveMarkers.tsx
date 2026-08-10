import { DoubleSide } from "three";
import type { FailCondition, StepCondition } from "../../../(lib)/stages";
import type { Point } from "../hooks/useObjective";

const MARKER_HEIGHT = 3;
const GOAL_COLOR = "#22c55e";
const FAIL_COLOR = "#ef4444";
const RING_THICKNESS = 40;
const GOAL_LINE_LENGTH = 4000;
const GOAL_LINE_WIDTH = 80;

function Ring({ x, y, radius, color }: { x: number; y: number; radius: number; color: string }) {
  return (
    <mesh position={[x, MARKER_HEIGHT, y]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[Math.max(0, radius - RING_THICKNESS), radius, 96]} />
      <meshBasicMaterial color={color} transparent opacity={0.6} side={DoubleSide} />
    </mesh>
  );
}

/** moveAxis 목표는 이 선을 넘는 것이므로 축에 수직인 긴 띠로 표시한다. */
function GoalLine({ origin, condition }: { origin: Point; condition: Extract<StepCondition, { kind: "moveAxis" }> }) {
  const alongX = condition.axis === "x";
  const offset = condition.sign * condition.distance;

  return (
    <mesh
      position={[origin.x + (alongX ? offset : 0), MARKER_HEIGHT, origin.y + (alongX ? 0 : offset)]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={alongX ? [GOAL_LINE_WIDTH, GOAL_LINE_LENGTH] : [GOAL_LINE_LENGTH, GOAL_LINE_WIDTH]} />
      <meshBasicMaterial color={GOAL_COLOR} transparent opacity={0.6} side={DoubleSide} />
    </mesh>
  );
}

type Props = {
  condition: StepCondition | null;
  stepOrigin: Point | null;
  fail: FailCondition | undefined;
};

export default function ObjectiveMarkers({ condition, stepOrigin, fail }: Props) {
  return (
    <>
      {fail && <Ring x={fail.x} y={fail.y} radius={fail.radius} color={FAIL_COLOR} />}
      {condition?.kind === "reachPoint" && (
        <Ring x={condition.x} y={condition.y} radius={condition.radius} color={GOAL_COLOR} />
      )}
      {condition?.kind === "moveAxis" && stepOrigin && <GoalLine origin={stepOrigin} condition={condition} />}
    </>
  );
}
