import type { DeploymentSquad } from "../../../(lib)/squadfuncs";

type DisplaySquad = DeploymentSquad & { squadID: number | null };

type Props = {
  squads: DisplaySquad[];
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

export default function SquadPanel({ squads, followSquadID, onFollowSquadToggle }: Props) {
  if (squads.length === 0) return null;

  return (
    <div className="fixed top-3 right-3 flex flex-col gap-1 rounded-lg bg-black/70 px-4 py-3 text-white">
      {squads.map((squad, index) => {
        const following = squad.squadID !== null && followSquadID === squad.squadID;

        return (
          <div key={index} className="flex items-center gap-4 text-sm">
            <span className="flex w-32 items-center gap-1.5">
              <span className="truncate font-bold text-sky-300">{squad.name}</span>
              <button
                type="button"
                onClick={() => {
                  if (squad.squadID !== null) onFollowSquadToggle(squad.squadID);
                }}
                disabled={squad.squadID === null}
                aria-pressed={following}
                title={squad.squadID === null ? "출전 후 사용할 수 있습니다" : "카메라로 따라가기"}
                className={`shrink-0 rounded p-1 transition disabled:cursor-not-allowed ${
                  following
                    ? "bg-sky-500 text-slate-950"
                    : "bg-white/15 text-white hover:bg-white/30 disabled:bg-white/5 disabled:text-white/35"
                }`}
              >
                <CameraIcon />
                <span className="sr-only">{squad.name} 카메라로 따라가기</span>
              </button>
            </span>
            <span className="flex gap-3 tabular-nums text-white/85">
              <span>
                보병 <b className="text-white">{squad.warrior}</b>
              </span>
              <span>
                궁병 <b className="text-white">{squad.archer}</b>
              </span>
              <span>
                기병 <b className="text-white">{squad.knight}</b>
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
