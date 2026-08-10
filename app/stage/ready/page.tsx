import { redirect } from "next/navigation";
import { findStage, isTutorialStage, STAGES } from "../../(lib)/stages";
import ReadyClient from "./_client/ReadyClient";

/** ?stage=번호로 받은 스테이지의 출정 준비 화면. 잘못된 번호면 1번으로 되돌린다. */
export default async function Page({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const { stage } = await searchParams;
  const selected = findStage(Number(stage)) ?? STAGES[0];

  // 튜토리얼은 편성이 스테이지에 고정되어 있어 준비 화면을 거칠 이유가 없다.
  if (isTutorialStage(selected)) redirect(`/game?stage=${selected.id}`);

  return <ReadyClient stageID={selected.id} stageTitle={selected.title} />;
}
