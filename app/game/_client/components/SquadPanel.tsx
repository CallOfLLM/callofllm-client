import type { DeploymentSquad } from "../../../(lib)/squadfuncs";
import styles from "./GameHud.module.css";

type DisplaySquad = DeploymentSquad & { squadID: number | null };

type Props = {
  squads: DisplaySquad[];
  enemyAliveCount: number | null;
  followSquadID: number | null;
  onFollowSquadToggle: (squadID: number) => void;
};

function CameraIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

export default function SquadPanel({ squads, enemyAliveCount, followSquadID, onFollowSquadToggle }: Props) {
  if (squads.length === 0 && enemyAliveCount === null) return null;

  return (
    <section className={styles.squadPanel} aria-label="부대 현황">
      {squads.map((squad, index) => {
        const following = squad.squadID !== null && followSquadID === squad.squadID;

        return (
          <div key={index} className={styles.squadRow}>
            <span className={styles.squadName}>
              <span>{squad.name}</span>
              <button
                type="button"
                onClick={() => {
                  if (squad.squadID !== null) onFollowSquadToggle(squad.squadID);
                }}
                disabled={squad.squadID === null}
                aria-pressed={following}
                title={squad.squadID === null ? "출전 후 사용할 수 있습니다" : "카메라로 따라가기"}
                className={`${styles.cameraButton} ${following ? styles.following : ""}`}
              >
                <CameraIcon />
                <span className="sr-only">{squad.name} 카메라로 따라가기</span>
              </button>
            </span>
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
          </div>
        );
      })}
      {enemyAliveCount !== null && (
        <div className={styles.enemyCount} aria-live="polite">
          <span>적군 생존 병력</span>
          <span>
            <b>{enemyAliveCount}</b>명
          </span>
        </div>
      )}
    </section>
  );
}
