import BattleManual from "../_components/BattleManual";
import GameSelectionShell from "../_components/GameSelectionShell";
import ManualSeenMarker from "./_client/ManualSeenMarker";

export default function Page() {
  return (
    <>
      <ManualSeenMarker />
      <GameSelectionShell
        eyebrow="FIELD MANUAL"
        title="전투 사용설명서"
        description="편성부터 카메라 조작과 자연어 명령까지, 출정 전에 필요한 내용을 확인하세요."
      >
        <BattleManual />
      </GameSelectionShell>
    </>
  );
}
