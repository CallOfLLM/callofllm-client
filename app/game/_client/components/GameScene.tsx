import { Box, Environment, OrbitControls, useAnimations, useGLTF, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import {
  EquirectangularReflectionMapping,
  LoopOnce,
  LoopRepeat,
  Matrix4,
  SRGBColorSpace,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Mesh,
  type Object3D,
  type Texture,
} from "three";
import {
  KTX2Loader,
  SkeletonUtils,
  type GLTFLoader,
  type OrbitControls as OrbitControlsImpl,
} from "three-stdlib";
import { directionToVector, MAP_BOUNDS, SOLDIER_STATE, TEAM_FLAG, type Soldier } from "../../../(lib)/_packet";
import { soldierKey, type BattlefieldSoldier, type SoldierUnitType } from "../lib/soldierUnitType";

const MAP_WIDTH = MAP_BOUNDS.maxX + 1;
const MAP_HEIGHT = MAP_BOUNDS.maxY + 1;

const GROUND_MODEL_URL = "/Ground_optimize.glb";
const GROUND_MODEL_SCALE = MAP_WIDTH / 640;
const ENVIRONMENT_URL = "/map/qwantani_dawn_puresky_1k.hdr";
const SKYBOX_URL = "/map/skybox-day.png";
const MAP_MODEL_URLS: Record<number, string> = {
  0: GROUND_MODEL_URL,
  1: "/map/Map_001_optimized.glb",
  2: "/map/Map_002_optimized.glb",
  3: "/map/Map_003_optimized.glb",
};

const SOLDIER_MODEL_URL = "/object/soldier_optimized.glb";
const KNIGHT_MODEL_URL = "/object/knight_optimized.glb";
const HORSE_MODEL_URL = "/object/horse_optimized.glb";
const SWORD_MODEL_URL = "/object/sword_optimized.glb";
const KTX2_TRANSCODER_PATH = "/basis/";
const SOLDIER_MODEL_SCALE = 5;
const SOLDIER_ANIMATION = {
  WALK: "final_soldier_walk",
  SPRINT: "final_soldier_sprint",
  DEATH_ONE: "final_soldier_death01",
  DEATH_TWO: "final_soldier_death02",
  ATTACK: "final_soldier_attack",
  IDLE: "final_soldier_idle",
  RIDE_ATTACK: "final_soldier_ride_attack",
  RIDE_IDLE: "final_soldier_ride_idle",
} as const;
const HORSE_ANIMATION = {
  GALLOP: "final__horse_galloping",
  DEATH: "final__horse_Death",
  WALK: "final__horse_walk",
  IDLE: "final__horse_idle",
} as const;
const IN_PLACE_ANIMATION_NAMES = new Set<string>([
  SOLDIER_ANIMATION.WALK,
  SOLDIER_ANIMATION.SPRINT,
  HORSE_ANIMATION.WALK,
  HORSE_ANIMATION.GALLOP,
]);
const SOLDIER_DEATH_ANIMATION_NAMES = new Set<string>([
  SOLDIER_ANIMATION.DEATH_ONE,
  SOLDIER_ANIMATION.DEATH_TWO,
]);
const HORSE_DEATH_ANIMATION_NAMES = new Set<string>([HORSE_ANIMATION.DEATH]);
const WEAPON_ATTACH_BONE = "attach_handl";
const HORSE_RIDER_ATTACH_BONE = "horse_attach_people";
const RIDER_ROOT_BONE = "root_refx";
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

const DEFAULT_CAMERA_REAR_DISTANCE = 80;
const DEFAULT_CAMERA_FORMATION_PADDING = 30;
const SQUAD_CAMERA_REAR_DISTANCE = 150;
const INITIAL_CAMERA_ANGLE_DEGREES = 42;
const INITIAL_CAMERA_TARGET_HEIGHT = 5;
const CAMERA_FOV_DEGREES = 75;
const CAMERA_PRESET_REVISION = "squad-centers-fixed-forward-x-v4";

/** 목표까지 한 프레임에 좁히는 비율. 값이 작을수록 카메라가 부드럽게 따라간다. */
const FOLLOW_SMOOTHING = 0.12;
const FOLLOW_EPSILON = 0.5;

type Focus = { x: number; z: number };
type Formation = Focus & { radius: number };

type CameraPose = {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
};

type Props = {
  mapID: number;
  soldiers: BattlefieldSoldier[];
  followSquadID: number | null;
  initialCameraReady: boolean;
  onReady: () => void;
};

type ModelAsset = {
  scene: Object3D;
  animations: AnimationClip[];
};

type BattlefieldAssets = {
  map: Object3D;
  skybox: Texture;
  soldier: ModelAsset;
  knight: ModelAsset;
  horse: ModelAsset;
  sword: Object3D;
};

let ktx2Loader: KTX2Loader | null = null;

function useKtx2LoaderConfiguration() {
  const renderer = useThree((state) => state.gl);
  return useCallback(
    (loader: GLTFLoader) => {
      if (!ktx2Loader) {
        ktx2Loader = new KTX2Loader()
          .setTranscoderPath(KTX2_TRANSCODER_PATH)
          .detectSupport(renderer);
      }
      loader.setKTX2Loader(ktx2Loader);
    },
    [renderer],
  );
}

function useBattlefieldAssets(mapID: number): BattlefieldAssets {
  const configureKtx2 = useKtx2LoaderConfiguration();
  const [map, soldier, knight, horse, sword] = useGLTF(
    [
      MAP_MODEL_URLS[mapID] ?? GROUND_MODEL_URL,
      SOLDIER_MODEL_URL,
      KNIGHT_MODEL_URL,
      HORSE_MODEL_URL,
      SWORD_MODEL_URL,
    ],
    false,
    true,
    configureKtx2,
  );
  const skybox = useTexture(SKYBOX_URL);

  return {
    map: map.scene,
    skybox,
    soldier: { scene: soldier.scene, animations: soldier.animations },
    knight: { scene: knight.scene, animations: knight.animations },
    horse: { scene: horse.scene, animations: horse.animations },
    sword: sword.scene,
  };
}

function Battlefield({ scene }: { scene: Object3D }) {
  // 원본 바닥의 X 0..640, Z -320..0을 서버의 X 0..6400,
  // Y 0..3200(Three.js Z축) 좌표계에 맞춘다.
  return <primitive object={scene} scale={[GROUND_MODEL_SCALE, GROUND_MODEL_SCALE, -GROUND_MODEL_SCALE]} />;
}

function Skybox({ texture }: { texture: Texture }) {
  const backgroundTexture = useMemo(() => {
    const preparedTexture = texture.clone();
    preparedTexture.mapping = EquirectangularReflectionMapping;
    preparedTexture.colorSpace = SRGBColorSpace;
    preparedTexture.needsUpdate = true;
    return preparedTexture;
  }, [texture]);

  useEffect(() => () => backgroundTexture.dispose(), [backgroundTexture]);

  return <Environment map={backgroundTexture} background="only" />;
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

function mountedRiderAnimationName(soldier: Soldier): string {
  if (soldier.hp <= 0 || soldier.state === SOLDIER_STATE.DEAD) {
    return soldier.soldierID % 2 === 0 ? SOLDIER_ANIMATION.DEATH_ONE : SOLDIER_ANIMATION.DEATH_TWO;
  }

  return soldier.state === SOLDIER_STATE.ATTACKING
    ? SOLDIER_ANIMATION.RIDE_ATTACK
    : SOLDIER_ANIMATION.RIDE_IDLE;
}

function horseAnimationName(soldier: Soldier): string {
  if (soldier.hp <= 0 || soldier.state === SOLDIER_STATE.DEAD) return HORSE_ANIMATION.DEATH;

  switch (soldier.state) {
    case SOLDIER_STATE.MOVING:
    case SOLDIER_STATE.FORMING:
      return HORSE_ANIMATION.WALK;
    case SOLDIER_STATE.CHASING:
      return HORSE_ANIMATION.GALLOP;
    case SOLDIER_STATE.ATTACKING:
    case SOLDIER_STATE.IDLE:
    case SOLDIER_STATE.HIT:
    default:
      return HORSE_ANIMATION.IDLE;
  }
}

/** Three.js AnimationAction은 명령형 객체라 React 렌더 밖에서 종료 자세 유지 여부를 설정한다. */
function setClampWhenFinished(action: AnimationAction, clamp: boolean) {
  action.clampWhenFinished = clamp;
}

function useActiveAnimation(
  actions: Record<string, AnimationAction | null>,
  animationName: string,
  fallbackName: string,
  oneShotNames: ReadonlySet<string>,
) {
  const activeActionRef = useRef<AnimationAction | null>(null);

  useEffect(() => {
    let resolvedName = animationName;
    let nextAction = actions[resolvedName];
    if (!nextAction) {
      resolvedName = fallbackName;
      nextAction = actions[resolvedName];
    }
    if (!nextAction || (activeActionRef.current === nextAction && nextAction.isRunning())) return;

    activeActionRef.current?.fadeOut(ANIMATION_FADE_SECONDS);
    const oneShot = oneShotNames.has(resolvedName);

    nextAction.reset();
    setClampWhenFinished(nextAction, oneShot);
    nextAction.setLoop(oneShot ? LoopOnce : LoopRepeat, oneShot ? 1 : Infinity);
    nextAction.setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(ANIMATION_FADE_SECONDS).play();
    activeActionRef.current = nextAction;
  }, [actions, animationName, fallbackName, oneShotNames]);

  useEffect(
    () => () => {
      activeActionRef.current?.stop();
      activeActionRef.current = null;
    },
    [],
  );
}

function cloneArmedCharacter(character: Object3D, sword: Object3D) {
  const clonedCharacter = SkeletonUtils.clone(character);
  const hand = clonedCharacter.getObjectByName(WEAPON_ATTACH_BONE);

  if (hand) hand.add(sword.clone(true));
  return clonedCharacter;
}

function AnimatedSoldier({
  soldier,
  model,
  sword,
}: {
  soldier: Soldier;
  model: ModelAsset;
  sword: Object3D;
}) {
  const clonedScene = useMemo(() => cloneArmedCharacter(model.scene, sword), [model.scene, sword]);
  const clips = useMemo(() => inPlaceAnimations(model.animations), [model.animations]);
  const animationName = soldierAnimationName(soldier);
  const { actions } = useAnimations(clips, clonedScene);

  useActiveAnimation(
    actions,
    animationName,
    SOLDIER_ANIMATION.IDLE,
    SOLDIER_DEATH_ANIMATION_NAMES,
  );

  return <primitive object={clonedScene} position={[0, 0, 0]} scale={SOLDIER_MODEL_SCALE} />;
}

function MountedKnight({
  soldier,
  knight,
  horse,
  sword,
}: {
  soldier: Soldier;
  knight: ModelAsset;
  horse: ModelAsset;
  sword: Object3D;
}) {
  const mounted = useMemo(() => {
    const clonedHorse = SkeletonUtils.clone(horse.scene);
    const clonedRider = cloneArmedCharacter(knight.scene, sword);
    const riderAttach = clonedHorse.getObjectByName(HORSE_RIDER_ATTACH_BONE);
    const riderRoot = clonedRider.getObjectByName(RIDER_ROOT_BONE);

    if (riderAttach) {
      if (riderRoot) {
        clonedRider.updateMatrixWorld(true);
        clonedRider.matrix.copy(new Matrix4().copy(riderRoot.matrixWorld).invert());
        clonedRider.matrix.decompose(
          clonedRider.position,
          clonedRider.quaternion,
          clonedRider.scale,
        );
      }
      riderAttach.add(clonedRider);
    } else {
      clonedHorse.add(clonedRider);
    }

    return { horse: clonedHorse, rider: clonedRider };
  }, [horse.scene, knight.scene, sword]);
  const horseClips = useMemo(() => inPlaceAnimations(horse.animations), [horse.animations]);
  const riderClips = useMemo(() => inPlaceAnimations(knight.animations), [knight.animations]);
  const horseActions = useAnimations(horseClips, mounted.horse).actions;
  const riderActions = useAnimations(riderClips, mounted.rider).actions;

  useActiveAnimation(
    horseActions,
    horseAnimationName(soldier),
    HORSE_ANIMATION.IDLE,
    HORSE_DEATH_ANIMATION_NAMES,
  );
  useActiveAnimation(
    riderActions,
    mountedRiderAnimationName(soldier),
    SOLDIER_ANIMATION.RIDE_IDLE,
    SOLDIER_DEATH_ANIMATION_NAMES,
  );

  return <primitive object={mounted.horse} position={[0, 0, 0]} scale={SOLDIER_MODEL_SCALE} />;
}

function SoldierVisual({
  soldier,
  unitType,
  assets,
}: {
  soldier: Soldier;
  unitType: SoldierUnitType;
  assets: Pick<BattlefieldAssets, "soldier" | "knight" | "horse" | "sword">;
}) {
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
    return <MountedKnight soldier={soldier} knight={assets.knight} horse={assets.horse} sword={assets.sword} />;
  }

  return <AnimatedSoldier soldier={soldier} model={assets.soldier} sword={assets.sword} />;
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

function Soldiers({
  soldiers,
  assets,
}: Pick<Props, "soldiers"> & {
  assets: Pick<BattlefieldAssets, "soldier" | "knight" | "horse" | "sword">;
}) {
  return (
    <>
      {soldiers.map((soldier) => {
        const key = soldierKey(soldier);

        return (
          <group key={key} position={[soldier.posX, 0, soldier.posY]}>
            <group rotation={[0, directionToRotationY(soldier.direction), 0]}>
              <SoldierVisual soldier={soldier} unitType={soldier.unitType} assets={assets} />
            </group>
          </group>
        );
      })}
      <ArcherProjectiles soldiers={soldiers} />
    </>
  );
}

/** 선택한 소대가 이동해도 게임 기준 후방(-X) 구도를 유지하며 따라간다. */
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

/** 생존 아군 소대별 중심을 같은 비중으로 평균하고, 그 중심에서 가장 먼 병사까지의 반경을 구한다. */
function alliedFormation(soldiers: Soldier[]): Formation | null {
  const aliveAllies = soldiers.filter(
    (soldier) => soldier.teamFlag === TEAM_FLAG.ALLY && soldier.hp > 0 && soldier.state !== SOLDIER_STATE.DEAD,
  );
  if (aliveAllies.length === 0) return null;

  const squadTotals = new Map<number, { x: number; z: number; count: number }>();
  for (const soldier of aliveAllies) {
    const total = squadTotals.get(soldier.squadID) ?? { x: 0, z: 0, count: 0 };
    total.x += soldier.posX;
    total.z += soldier.posY;
    total.count += 1;
    squadTotals.set(soldier.squadID, total);
  }

  const squadCenters = Array.from(squadTotals.values(), (total) => ({
    x: total.x / total.count,
    z: total.z / total.count,
  }));
  const centerTotal = squadCenters.reduce(
    (total, center) => ({ x: total.x + center.x, z: total.z + center.z }),
    { x: 0, z: 0 },
  );
  const center = {
    x: centerTotal.x / squadCenters.length,
    z: centerTotal.z / squadCenters.length,
  };
  const radius = aliveAllies.reduce(
    (largest, soldier) => Math.max(largest, Math.hypot(soldier.posX - center.x, soldier.posY - center.z)),
    0,
  );

  return { ...center, radius };
}

/** 기본 시점은 아군 전체를 가운데 두고 패킷 전방인 +X를 바라본다. */
function alliedFormationCameraPose(soldiers: Soldier[], aspect: number): CameraPose | null {
  const formation = alliedFormation(soldiers);
  if (!formation) return null;

  const verticalHalfFov = (CAMERA_FOV_DEGREES * Math.PI) / 360;
  const safeAspect = Math.max(aspect, 0.1);
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * safeAspect);
  const fittingHalfFov = Math.min(verticalHalfFov, horizontalHalfFov);
  const baseHeight = Math.tan((INITIAL_CAMERA_ANGLE_DEGREES * Math.PI) / 180) * DEFAULT_CAMERA_REAR_DISTANCE;
  const baseDistance = Math.hypot(DEFAULT_CAMERA_REAR_DISTANCE, baseHeight);
  const fittingDistance = (formation.radius + DEFAULT_CAMERA_FORMATION_PADDING) / Math.sin(fittingHalfFov);
  const cameraDistance = Math.max(baseDistance, fittingDistance);
  const cameraHeight = Math.sqrt(cameraDistance ** 2 - DEFAULT_CAMERA_REAR_DISTANCE ** 2);

  return {
    position: {
      x: formation.x - DEFAULT_CAMERA_REAR_DISTANCE,
      y: INITIAL_CAMERA_TARGET_HEIGHT + cameraHeight,
      z: formation.z,
    },
    target: {
      x: formation.x,
      y: INITIAL_CAMERA_TARGET_HEIGHT,
      z: formation.z,
    },
  };
}

function selectedSquadCenter(soldiers: Soldier[], squadID: number | null): Focus | null {
  if (squadID === null) return null;

  const aliveSoldiers = soldiers.filter(
    (soldier) =>
      soldier.teamFlag === TEAM_FLAG.ALLY &&
      soldier.squadID === squadID &&
      soldier.hp > 0 &&
      soldier.state !== SOLDIER_STATE.DEAD,
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

/** 선택한 소대 중심의 게임 기준 후방(-X)에서 중심 자체를 바라보는 카메라 자세. */
function selectedSquadCameraPose(soldiers: Soldier[], squadID: number | null): CameraPose | null {
  if (squadID === null) return null;

  const center = selectedSquadCenter(soldiers, squadID);
  if (!center) return null;

  const cameraHeight = Math.tan((INITIAL_CAMERA_ANGLE_DEGREES * Math.PI) / 180) * SQUAD_CAMERA_REAR_DISTANCE;

  return {
    position: {
      x: center.x - SQUAD_CAMERA_REAR_DISTANCE,
      y: INITIAL_CAMERA_TARGET_HEIGHT + cameraHeight,
      z: center.z,
    },
    target: {
      x: center.x,
      y: INITIAL_CAMERA_TARGET_HEIGHT,
      z: center.z,
    },
  };
}

/** 배치 완료 후 기본 전군 시점을 한 번 적용하고, 이후에는 선택한 소대 시점만 전환한다. */
function SquadCameraPreset({
  controlsRef,
  soldiers,
  followSquadID,
  initialCameraReady,
}: {
  controlsRef: RefObject<OrbitControlsImpl | null>;
  soldiers: Soldier[];
  followSquadID: number | null;
  initialCameraReady: boolean;
}) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const initialAppliedRef = useRef(false);
  const lastFollowSquadIDRef = useRef<number | null>(null);
  const appliedRevisionRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!initialCameraReady || soldiers.length === 0) {
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

    const controls = controlsRef.current;
    const aspect = size.height > 0 ? size.width / size.height : 1;
    const pose =
      followSquadID === null
        ? alliedFormationCameraPose(soldiers, aspect)
        : selectedSquadCameraPose(soldiers, followSquadID);
    if (!controls || !pose) return;

    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    controls.target.set(pose.target.x, pose.target.y, pose.target.z);
    camera.lookAt(controls.target);
    controls.update();
    initialAppliedRef.current = true;
    lastFollowSquadIDRef.current = followSquadID;
    appliedRevisionRef.current = CAMERA_PRESET_REVISION;
  }, [camera, controlsRef, followSquadID, initialCameraReady, size.height, size.width, soldiers]);

  return null;
}

function SceneContents({ mapID, soldiers, onReady }: Pick<Props, "mapID" | "soldiers" | "onReady">) {
  const assets = useBattlefieldAssets(mapID);

  useEffect(() => {
    onReady();
  }, [onReady]);

  return (
    <>
      <Environment files={ENVIRONMENT_URL} />
      <Skybox texture={assets.skybox} />
      <Battlefield scene={assets.map} />
      <Soldiers soldiers={soldiers} assets={assets} />
    </>
  );
}

export default function GameScene({ mapID, soldiers, followSquadID, initialCameraReady, onReady }: Props) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const followPose = useMemo(() => selectedSquadCameraPose(soldiers, followSquadID), [soldiers, followSquadID]);

  return (
    <Canvas camera={{ position: [MAP_WIDTH / 2, 4200, 7000], fov: CAMERA_FOV_DEGREES, far: 50000 }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[MAP_WIDTH / 2, 4000, MAP_HEIGHT / 2]} />

      <Suspense fallback={null}>
        <SceneContents mapID={mapID} soldiers={soldiers} onReady={onReady} />
      </Suspense>

      {/* 맵의 (0, 0) 모서리 */}
      <Box position={[0, 2, 0]} args={[20, 4, 20]}>
        <meshStandardMaterial color="black" />
      </Box>

      {/* 시선점은 프리셋과 추적 로직에서 한곳에서 관리한다. */}
      <OrbitControls ref={controlsRef} />
      <SquadCameraPreset
        controlsRef={controlsRef}
        soldiers={soldiers}
        followSquadID={followSquadID}
        initialCameraReady={initialCameraReady}
      />
      <FollowCamera controlsRef={controlsRef} pose={followPose} />
    </Canvas>
  );
}
