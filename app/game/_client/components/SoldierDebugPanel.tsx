import type { Soldier } from "../../../(lib)/_packet";

const TEAM_COLORS = ["#3b82f6", "#ef4444"];

type Props = {
  soldiers: Soldier[];
};

export default function SoldierDebugPanel({ soldiers }: Props) {
  return (
    <div className="fixed top-20 left-3 max-h-[calc(100dvh-26rem)] w-72 overflow-y-auto rounded-md bg-black/70 p-3 text-xs text-white">
      <div className="mb-2 font-bold">병사 {soldiers.length}명</div>
      {soldiers.length === 0 ? (
        <div className="text-white/50">수신 대기 중</div>
      ) : (
        <table className="w-full">
          <thead className="text-white/50">
            <tr>
              <th className="text-left">sq/id</th>
              <th>team</th>
              <th>pos</th>
              <th>HP</th>
              <th>st</th>
              <th>dir</th>
            </tr>
          </thead>
          <tbody>
            {soldiers.map((soldier) => (
              <tr
                key={`${soldier.teamFlag}-${soldier.squadID}-${soldier.soldierID}`}
                className={soldier.hp <= 0 ? "text-white/40" : ""}
              >
                <td>
                  {soldier.squadID}/{soldier.soldierID}
                </td>
                <td className="text-center" style={{ color: TEAM_COLORS[soldier.teamFlag % TEAM_COLORS.length] }}>
                  ■ {soldier.teamFlag}
                </td>
                <td className="text-center">
                  {soldier.posX},{soldier.posY}
                </td>
                <td className="text-center">{soldier.hp}</td>
                <td className="text-center">{soldier.state}</td>
                <td className="text-center">{soldier.direction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
