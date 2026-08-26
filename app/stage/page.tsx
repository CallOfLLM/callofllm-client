import GameSelectionShell from "../_components/GameSelectionShell";
import StageSelectClient from "./_client/StageSelectClient";

export default function Page() {
  return (
    <GameSelectionShell eyebrow="STAGE SELECT" title="스테이지 선택" description="도전할 스테이지를 선택해 주세요. 앞 스테이지를 클리어하면 다음 전장이 열립니다.">
      <StageSelectClient />
    </GameSelectionShell>
  );
}
