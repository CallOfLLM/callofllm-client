import { Box, OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, type RefObject } from "react";
import { LoopRepeat, Vector3 } from "three";
import { SkeletonUtils, type OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { directionToVector, MAP_BOUNDS, TEAM_FLAG, type Soldier } from "../../../(lib)/_packet";
import type { FailCondition, StepCondition } from "../../../(lib)/stages";
import type { Point } from "../hooks/useObjective";
import ObjectiveMarkers from "./ObjectiveMarkers";

const MAP_WIDTH = MAP_BOUNDS.maxX + 1;
const MAP_HEIGHT = MAP_BOUNDS.maxY + 1;

const GROUND_MODEL_URL = "/Ground_optimize.glb";
const GROUND_MODEL_SCALE = MAP_WIDTH / 640;

const SOLDIER_MODEL_URL = "/soldier_low_ktx2.glb";
const SOLDIER_MODEL_SCALE = 5;
const SOLDIER_RUN_ANIMATION = "Soldier_Slow Run";

const TEAM_COLORS = ["#3b82f6", "#ef4444"];
const DEAD_COLOR = "#4b5563";

/** 목표까지 한 프레임에 좁히는 비율. 값이 작을수록 카메라가 부드럽게 따라간다. */
const FOLLOW_SMOOTHING = 0.12;
const FOLLOW_EPSILON = 0.5;

type Focus = { x: number; z: number };

type Props = {
  soldiers: Soldier[];
  followSquadID: number | null;
  condition: StepCondition | null;
  stepOrigin: Point | null;
  fail: FailCondition | undefined;
  onReady: () => void;
};

function Battlefield() {
  const { scene } = useGLTF(GROUND_MODEL_URL);

  // 원본 바닥의 X 0..640, Z -320..0을 서버의 X 0..6400,
  // Y 0..3200(Three.js Z축) 좌표계에 맞춘다.
  return <primitive object={scene} scale={[GROUND_MODEL_SCALE, GROUND_MODEL_SCALE, -GROUND_MODEL_SCALE]} />;
}

/** 바닥과 병사 모델이 모두 준비된 뒤 로딩 화면을 닫는다. */
function ScenePreloader({ onReady }: Pick<Props, "onReady">) {
  useGLTF(SOLDIER_MODEL_URL);

  useEffect(() => {
    onReady();
  }, [onReady]);

  return null;
}

function AnimatedSoldier() {
  const { scene, animations } = useGLTF(SOLDIER_MODEL_URL);
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const runAnimations = useMemo(() => {
    const source = animations.find((clip) => clip.name === SOLDIER_RUN_ANIMATION) ?? animations[0];
    if (!source) return [];

    // 상하 동작은 유지하되 리그 루트의 수평 이동은 첫 프레임에 고정한다.
    const inPlaceRun = source.clone();
    const rootTrack = inPlaceRun.tracks.find((track) => track.name === "c_root_masterx.position");
    if (rootTrack) {
      const values = rootTrack.values;
      const initialX = values[0];
      const initialY = values[1];

      for (let index = 0; index < values.length; index += 3) {
        values[index] = initialX;
        values[index + 1] = initialY;
      }
    }

    return [inPlaceRun];
  }, [animations]);
  const animationName = runAnimations[0]?.name;
  const { actions } = useAnimations(runAnimations, clonedScene);

  useEffect(() => {
    const action = animationName ? actions[animationName] : undefined;
    if (!action) return;

    action.reset().setLoop(LoopRepeat, Infinity).setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    return () => {
      action.stop();
    };
  }, [actions, animationName]);

  return <primitive object={clonedScene} position={[0, 0, 0]} scale={SOLDIER_MODEL_SCALE} />;
}

function directionToRotationY(direction: number) {
  const { x, y } = directionToVector(direction);
  return Math.atan2(x, y);
}

function Soldiers({ soldiers }: Pick<Props, "soldiers">) {
  return (
    <>
      {soldiers.map((soldier) => {
        const color = soldier.hp <= 0 ? DEAD_COLOR : TEAM_COLORS[soldier.teamFlag % TEAM_COLORS.length];

        return (
          <group
            key={`${soldier.teamFlag}-${soldier.squadID}-${soldier.soldierID}`}
            position={[soldier.posX, 0, soldier.posY]}
          >
            <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[5, 24]} />
              <meshBasicMaterial color={color} transparent opacity={0.75} />
            </mesh>
            <group rotation={[0, directionToRotationY(soldier.direction), 0]}>
              <AnimatedSoldier />
            </group>
          </group>
        );
      })}
    </>
  );
}

/** 사용자가 정한 시점과 거리를 유지하며 선택한 스쿼드의 중심으로 이동한다. */
function FollowCamera({ controlsRef, focus }: { controlsRef: RefObject<OrbitControlsImpl | null>; focus: Focus | null }) {
  const stepRef = useRef(new Vector3());

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls || !focus) return;

    const step = stepRef.current.set(focus.x - controls.target.x, 0, focus.z - controls.target.z);
    if (step.length() < FOLLOW_EPSILON) return;

    step.multiplyScalar(FOLLOW_SMOOTHING);
    controls.target.add(step);
    controls.object.position.add(step);
    controls.update();
  });

  return null;
}

function selectedSquadCenter(soldiers: Soldier[], squadID: number | null): Focus | null {
  if (squadID === null) return null;

  const aliveSoldiers = soldiers.filter(
    (soldier) => soldier.teamFlag === TEAM_FLAG.ALLY && soldier.squadID === squadID && soldier.hp > 0,
  );
  if (aliveSoldiers.length === 0) return null;

  const total = aliveSoldiers.reduce(
    (position, soldier) => ({ x: position.x + soldier.posX, z: position.z + soldier.posY }),
    { x: 0, z: 0 },
  );

  return {
    x: total.x / aliveSoldiers.length,
    z: total.z / aliveSoldiers.length,
  };
}

export default function GameScene({ soldiers, followSquadID, condition, stepOrigin, fail, onReady }: Props) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const followFocus = useMemo(() => selectedSquadCenter(soldiers, followSquadID), [soldiers, followSquadID]);

  return (
    <Canvas camera={{ position: [MAP_WIDTH / 2, 4200, 7000], far: 50000 }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[MAP_WIDTH / 2, 4000, MAP_HEIGHT / 2]} />

      <Suspense fallback={null}>
        <Battlefield />
        <ScenePreloader onReady={onReady} />
      </Suspense>

      {/* 맵의 (0, 0) 모서리 */}
      <Box position={[0, 2, 0]} args={[20, 4, 20]}>
        <meshStandardMaterial color="black" />
      </Box>

      <Suspense fallback={null}>
        <Soldiers soldiers={soldiers} />
      </Suspense>

      <ObjectiveMarkers condition={condition} stepOrigin={stepOrigin} fail={fail} />

      <OrbitControls ref={controlsRef} target={[MAP_WIDTH / 2, 0, MAP_HEIGHT / 2]} />
      <FollowCamera controlsRef={controlsRef} focus={followFocus} />
    </Canvas>
  );
}
