import { Box, Environment, OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { LoopOnce, LoopRepeat, Vector3, type AnimationAction, type AnimationClip, type Mesh } from "three";
import { SkeletonUtils, type OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { directionToVector, MAP_BOUNDS, SOLDIER_STATE, TEAM_FLAG, type Soldier } from "../../../(lib)/_packet";
import { soldierKey, type BattlefieldSoldier, type SoldierUnitType } from "../lib/soldierUnitType";

const MAP_WIDTH = MAP_BOUNDS.maxX + 1;
const MAP_HEIGHT = MAP_BOUNDS.maxY + 1;

const GROUND_MODEL_URL = "/Ground_optimize.glb";
const GROUND_MODEL_SCALE = MAP_WIDTH / 640;
const ENVIRONMENT_URL = "/map/qwantani_dawn_puresky_1k.hdr";
const MAP_MODEL_URLS: Record<number, string> = {
  0: GROUND_MODEL_URL,
  1: "/map/Map_001_optimized.glb",
  2: "/map/Map_002_optimized.glb",
  3: "/map/Map_003_optimized.glb",
};

const SOLDIER_MODEL_URL = "/object/soldier_optimized.glb";
const SOLDIER_MODEL_SCALE = 5;
const SOLDIER_ANIMATION = {
  WALK: "Walk_Formal_Loop.001_soldier",
  SPRINT: "Sprint_Loop.001_soldier",
  DEATH_ONE: "Death01.001_soldier",
  DEATH_TWO: "Death02_soldier",
  ATTACK: "Sword_Attack_Standing.001_soldier",
  IDLE: "Idle_Loop.001_soldier",
} as const;
const IN_PLACE_ANIMATION_NAMES = new Set<string>([SOLDIER_ANIMATION.WALK, SOLDIER_ANIMATION.SPRINT]);
const ANIMATION_FADE_SECONDS = 0.12;

const IN_PLACE_ANIMATION_CACHE = new WeakMap<AnimationClip[], AnimationClip[]>();

const TEAM_COLORS = {
  [TEAM_FLAG.ALLY]: "#3b82f6",
  [TEAM_FLAG.ENEMY]: "#ef4444",
} as const;
const DEAD_COLOR = "#4b5563";
const UNIT_MARKER_SIZE = 10;
const UNIT_MARKER_HEIGHT = 1;
const UNIT_MARKER_Y = UNIT_MARKER_HEIGHT / 2;
const ARCHER_ATTACK_RANGE = 150;
const ARCHER_PROJECTILE_HEIGHT = 5;
const ARCHER_PROJECTILE_SPEED = 250;
const ARCHER_PROJECTILE_INTERVAL_SECONDS = 0.85;
const ARCHER_PROJECTILE_SIZE = [2, 2, 14] as const;

const FIRST_ALLY_SQUAD_ID = 0;
const SQUAD_CAMERA_REAR_DISTANCE = 72;
const SQUAD_CAMERA_LOOK_AHEAD_DISTANCE = 72;
const INITIAL_CAMERA_ANGLE_DEGREES = 42;
const INITIAL_CAMERA_TARGET_HEIGHT = 5;
const CAMERA_FOV_DEGREES = 75;
const CAMERA_PRESET_REVISION = "screenshot-2026-08-21-044950-v1";

/** 목표까지 한 프레임에 좁히는 비율. 값이 작을수록 카메라가 부드럽게 따라간다. */
const FOLLOW_SMOOTHING = 0.12;
const FOLLOW_EPSILON = 0.5;

type Focus = { x: number; z: number };

type CameraPose = {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
};

type Props = {
  mapID: number;
  soldiers: BattlefieldSoldier[];
  followSquadID: number | null;
  onReady: () => void;
};

function Battlefield({ mapID }: Pick<Props, "mapID">) {
  const { scene } = useGLTF(MAP_MODEL_URLS[mapID] ?? GROUND_MODEL_URL);

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

function inPlaceAnimations(animations: AnimationClip[]): AnimationClip[] {
  const cached = IN_PLACE_ANIMATION_CACHE.get(animations);
  if (cached) return cached;

  const prepared = animations.map((source) => {
    if (!IN_PLACE_ANIMATION_NAMES.has(source.name)) return source;

    const clip = source.clone();
    const rootTrack = clip.tracks.find((track) => track.name === "c_root_masterx.position");
    if (!rootTrack) return clip;

    // 서버 좌표가 실제 이동을 담당한다. 리그 루트의 X/Y 이동만 고정하고 Z축 상하 동작은 유지한다.
    const values = rootTrack.values;
    const initialX = values[0];
    const initialY = values[1];
    for (let index = 0; index < values.length; index += 3) {
      values[index] = initialX;
      values[index + 1] = initialY;
    }

    return clip;
  });

  IN_PLACE_ANIMATION_CACHE.set(animations, prepared);
  return prepared;
}

function soldierAnimationName(soldier: Soldier): string {
  if (soldier.hp <= 0 || soldier.state === SOLDIER_STATE.DEAD) {
    return soldier.soldierID % 2 === 0 ? SOLDIER_ANIMATION.DEATH_ONE : SOLDIER_ANIMATION.DEATH_TWO;
  }

  switch (soldier.state) {
    case SOLDIER_STATE.MOVING:
    case SOLDIER_STATE.FORMING:
      return SOLDIER_ANIMATION.WALK;
    case SOLDIER_STATE.CHASING:
      return SOLDIER_ANIMATION.SPRINT;
    case SOLDIER_STATE.ATTACKING:
      return SOLDIER_ANIMATION.ATTACK;
    case SOLDIER_STATE.IDLE:
    case SOLDIER_STATE.HIT:
    default:
      return SOLDIER_ANIMATION.IDLE;
  }
}

/** Three.js AnimationAction은 명령형 객체라 React 렌더 밖에서 종료 자세 유지 여부를 설정한다. */
function setClampWhenFinished(action: AnimationAction, clamp: boolean) {
  action.clampWhenFinished = clamp;
}

function AnimatedSoldier({ soldier }: { soldier: Soldier }) {
  const { scene, animations } = useGLTF(SOLDIER_MODEL_URL);
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const clips = useMemo(() => inPlaceAnimations(animations), [animations]);
  const animationName = soldierAnimationName(soldier);
  const activeActionRef = useRef<AnimationAction | null>(null);
  const { actions } = useAnimations(clips, clonedScene);

  useEffect(() => {
    let resolvedName = animationName;
    let nextAction = actions[resolvedName];
    if (!nextAction) {
      resolvedName = SOLDIER_ANIMATION.IDLE;
      nextAction = actions[resolvedName];
    }
    if (!nextAction || (activeActionRef.current === nextAction && nextAction.isRunning())) return;

    activeActionRef.current?.fadeOut(ANIMATION_FADE_SECONDS);
    const deathAnimation = resolvedName === SOLDIER_ANIMATION.DEATH_ONE || resolvedName === SOLDIER_ANIMATION.DEATH_TWO;

    nextAction.reset();
    setClampWhenFinished(nextAction, deathAnimation);
    nextAction.setLoop(deathAnimation ? LoopOnce : LoopRepeat, deathAnimation ? 1 : Infinity);
    nextAction.setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(ANIMATION_FADE_SECONDS).play();
    activeActionRef.current = nextAction;
  }, [actions, animationName]);

  useEffect(
    () => () => {
      activeActionRef.current?.stop();
      activeActionRef.current = null;
    },
    [],
  );

  return <primitive object={clonedScene} position={[0, 0, 0]} scale={SOLDIER_MODEL_SCALE} />;
}

function SoldierVisual({ soldier, unitType }: { soldier: Soldier; unitType: SoldierUnitType }) {
  const color = soldier.hp <= 0 ? DEAD_COLOR : TEAM_COLORS[soldier.teamFlag];

  if (unitType === "ARCHER") {
    return (
      <mesh position={[0, UNIT_MARKER_Y, 0]}>
        <boxGeometry args={[UNIT_MARKER_SIZE, UNIT_MARKER_HEIGHT, UNIT_MARKER_SIZE]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
    );
  }

  if (unitType === "KNIGHT") {
    return (
      <mesh position={[0, UNIT_MARKER_Y, 0]}>
        <cylinderGeometry
          args={[UNIT_MARKER_SIZE / 2, UNIT_MARKER_SIZE / 2, UNIT_MARKER_HEIGHT, 24]}
        />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
    );
  }

  return <AnimatedSoldier soldier={soldier} />;
}

function directionToRotationY(direction: number) {
  const { x, y } = directionToVector(direction);
  return Math.atan2(x, y);
}

function nearestLivingOpponent(
  soldier: BattlefieldSoldier,
  soldiers: BattlefieldSoldier[],
): BattlefieldSoldier | null {
  let nearest: BattlefieldSoldier | null = null;
  let nearestDistanceSquared = ARCHER_ATTACK_RANGE ** 2;

  for (const candidate of soldiers) {
    if (candidate.teamFlag === soldier.teamFlag || candidate.hp <= 0 || candidate.state === SOLDIER_STATE.DEAD) {
      continue;
    }

    const distanceSquared = (candidate.posX - soldier.posX) ** 2 + (candidate.posY - soldier.posY) ** 2;
    if (distanceSquared > nearestDistanceSquared) continue;

    nearest = candidate;
    nearestDistanceSquared = distanceSquared;
  }

  return nearest;
}

/** 서버에 투사체 이벤트가 없으므로 ATTACKING 동안 가장 가까운 적을 향해 반복하는 임시 사격 연출이다. */
function ArcherProjectile({
  archer,
  target,
}: {
  archer: BattlefieldSoldier;
  target: BattlefieldSoldier;
}) {
  const projectileRef = useRef<Mesh | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const cycleIndexRef = useRef(-1);
  const startRef = useRef(new Vector3());
  const destinationRef = useRef(new Vector3());
  const travelSecondsRef = useRef(0);

  useFrame(({ clock }) => {
    const projectile = projectileRef.current;
    if (!projectile) return;

    if (startedAtRef.current === null) startedAtRef.current = clock.elapsedTime;

    const elapsedSeconds = clock.elapsedTime - startedAtRef.current;
    const cycleIndex = Math.floor(elapsedSeconds / ARCHER_PROJECTILE_INTERVAL_SECONDS);
    const cycleSeconds = elapsedSeconds % ARCHER_PROJECTILE_INTERVAL_SECONDS;

    if (cycleIndexRef.current !== cycleIndex) {
      cycleIndexRef.current = cycleIndex;

      const start = startRef.current.set(archer.posX, ARCHER_PROJECTILE_HEIGHT, archer.posY);
      const destination = destinationRef.current.set(target.posX, ARCHER_PROJECTILE_HEIGHT, target.posY);
      const deltaX = destination.x - start.x;
      const deltaY = destination.z - start.z;
      const distance = Math.hypot(deltaX, deltaY);

      travelSecondsRef.current = distance > 0 && distance <= ARCHER_ATTACK_RANGE
        ? distance / ARCHER_PROJECTILE_SPEED
        : 0;
      projectile.rotation.set(0, Math.atan2(deltaX, deltaY), 0);
    }

    const travelSeconds = travelSecondsRef.current;
    if (travelSeconds === 0 || cycleSeconds > travelSeconds) {
      projectile.visible = false;
      return;
    }

    const progress = cycleSeconds / travelSeconds;
    projectile.visible = true;
    projectile.position.lerpVectors(startRef.current, destinationRef.current, progress);
  });

  const color = TEAM_COLORS[archer.teamFlag];

  return (
    <mesh ref={projectileRef} position={[archer.posX, ARCHER_PROJECTILE_HEIGHT, archer.posY]}>
      <boxGeometry args={ARCHER_PROJECTILE_SIZE} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

function ArcherProjectiles({ soldiers }: Pick<Props, "soldiers">) {
  const shots = useMemo(
    () =>
      soldiers.flatMap((archer) => {
        if (
          archer.unitType !== "ARCHER" ||
          archer.hp <= 0 ||
          archer.state !== SOLDIER_STATE.ATTACKING
        ) {
          return [];
        }

        const target = nearestLivingOpponent(archer, soldiers);
        return target ? [{ archer, target }] : [];
      }),
    [soldiers],
  );

  return shots.map(({ archer, target }) => (
    <ArcherProjectile
      key={soldierKey(archer)}
      archer={archer}
      target={target}
    />
  ));
}

function Soldiers({ soldiers }: Pick<Props, "soldiers">) {
  return (
    <>
      {soldiers.map((soldier) => {
        const key = soldierKey(soldier);

        return (
          <group key={key} position={[soldier.posX, 0, soldier.posY]}>
            <group rotation={[0, directionToRotationY(soldier.direction), 0]}>
              <SoldierVisual soldier={soldier} unitType={soldier.unitType} />
            </group>
          </group>
        );
      })}
      <ArcherProjectiles soldiers={soldiers} />
    </>
  );
}

/** 선택한 소대가 선회해도 참고 이미지의 뒤쪽 구도를 유지하며 따라간다. */
function FollowCamera({ controlsRef, pose }: { controlsRef: RefObject<OrbitControlsImpl | null>; pose: CameraPose | null }) {
  const targetRef = useRef(new Vector3());
  const positionRef = useRef(new Vector3());

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls || !pose) return;

    const target = targetRef.current.set(pose.target.x, pose.target.y, pose.target.z);
    const position = positionRef.current.set(pose.position.x, pose.position.y, pose.position.z);
    const settled =
      controls.target.distanceToSquared(target) < FOLLOW_EPSILON ** 2 &&
      controls.object.position.distanceToSquared(position) < FOLLOW_EPSILON ** 2;
    if (settled) return;

    controls.target.lerp(target, FOLLOW_SMOOTHING);
    controls.object.position.lerp(position, FOLLOW_SMOOTHING);
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

function selectedSquadDirection(soldiers: Soldier[], squadID: number): { x: number; y: number } {
  const direction = soldiers.reduce(
    (total, soldier) => {
      if (soldier.teamFlag !== TEAM_FLAG.ALLY || soldier.squadID !== squadID || soldier.hp <= 0) return total;

      const vector = directionToVector(soldier.direction);
      return { x: total.x + vector.x, y: total.y + vector.y, count: total.count + 1 };
    },
    { x: 0, y: 0, count: 0 },
  );
  const magnitude = Math.hypot(direction.x, direction.y);

  return direction.count > 0 && magnitude > 0.001
    ? { x: direction.x / magnitude, y: direction.y / magnitude }
    : { x: 1, y: 0 };
}

/** 참고 이미지처럼 소대를 화면 아래에 두고 전방 공간을 확보한 카메라 자세. */
function selectedSquadCameraPose(soldiers: Soldier[], squadID: number | null): CameraPose | null {
  if (squadID === null) return null;

  const center = selectedSquadCenter(soldiers, squadID);
  if (!center) return null;

  const forward = selectedSquadDirection(soldiers, squadID);
  const cameraTargetDistance = SQUAD_CAMERA_REAR_DISTANCE + SQUAD_CAMERA_LOOK_AHEAD_DISTANCE;
  const cameraHeight = Math.tan((INITIAL_CAMERA_ANGLE_DEGREES * Math.PI) / 180) * cameraTargetDistance;

  return {
    position: {
      x: center.x - forward.x * SQUAD_CAMERA_REAR_DISTANCE,
      y: INITIAL_CAMERA_TARGET_HEIGHT + cameraHeight,
      z: center.z - forward.y * SQUAD_CAMERA_REAR_DISTANCE,
    },
    target: {
      x: center.x + forward.x * SQUAD_CAMERA_LOOK_AHEAD_DISTANCE,
      y: INITIAL_CAMERA_TARGET_HEIGHT,
      z: center.z + forward.y * SQUAD_CAMERA_LOOK_AHEAD_DISTANCE,
    },
  };
}

/** 시작 시점과 소대 카메라 선택 시점에 같은 참고 이미지 구도를 적용한다. */
function SquadCameraPreset({
  controlsRef,
  soldiers,
  followSquadID,
}: {
  controlsRef: RefObject<OrbitControlsImpl | null>;
  soldiers: Soldier[];
  followSquadID: number | null;
}) {
  const camera = useThree((state) => state.camera);
  const initialAppliedRef = useRef(false);
  const lastFollowSquadIDRef = useRef<number | null>(null);
  const appliedRevisionRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (soldiers.length === 0) {
      initialAppliedRef.current = false;
      lastFollowSquadIDRef.current = null;
      appliedRevisionRef.current = null;
      return;
    }

    const revisionChanged = appliedRevisionRef.current !== CAMERA_PRESET_REVISION;
    if (!revisionChanged && initialAppliedRef.current && followSquadID === null) {
      lastFollowSquadIDRef.current = null;
      return;
    }

    if (!revisionChanged && initialAppliedRef.current && lastFollowSquadIDRef.current === followSquadID) return;

    const squadID = followSquadID ?? FIRST_ALLY_SQUAD_ID;
    const controls = controlsRef.current;
    const pose = selectedSquadCameraPose(soldiers, squadID);
    if (!controls || !pose) return;

    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    controls.target.set(pose.target.x, pose.target.y, pose.target.z);
    camera.lookAt(controls.target);
    controls.update();
    initialAppliedRef.current = true;
    lastFollowSquadIDRef.current = followSquadID;
    appliedRevisionRef.current = CAMERA_PRESET_REVISION;
  }, [camera, controlsRef, followSquadID, soldiers]);

  return null;
}

export default function GameScene({ mapID, soldiers, followSquadID, onReady }: Props) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const followPose = useMemo(() => selectedSquadCameraPose(soldiers, followSquadID), [soldiers, followSquadID]);

  return (
    <Canvas camera={{ position: [MAP_WIDTH / 2, 4200, 7000], fov: CAMERA_FOV_DEGREES, far: 50000 }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[MAP_WIDTH / 2, 4000, MAP_HEIGHT / 2]} />

      <Suspense fallback={null}>
        <Environment files={ENVIRONMENT_URL} background />
        <Battlefield mapID={mapID} />
        <ScenePreloader onReady={onReady} />
      </Suspense>

      {/* 맵의 (0, 0) 모서리 */}
      <Box position={[0, 2, 0]} args={[20, 4, 20]}>
        <meshStandardMaterial color="black" />
      </Box>

      <Suspense fallback={null}>
        <Soldiers soldiers={soldiers} />
      </Suspense>

      {/* 시선점은 프리셋과 추적 로직에서 한곳에서 관리한다. */}
      <OrbitControls ref={controlsRef} />
      <SquadCameraPreset controlsRef={controlsRef} soldiers={soldiers} followSquadID={followSquadID} />
      <FollowCamera controlsRef={controlsRef} pose={followPose} />
    </Canvas>
  );
}
