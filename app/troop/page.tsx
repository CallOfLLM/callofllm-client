import SelectionButtonPage from "../_components/SelectionButtonPage";

const troopTypes = [
  { label: "보병", eyebrow: "INFANTRY", description: "보병을 충원합니다." },
  { label: "궁수", eyebrow: "ARCHER", description: "궁수를 충원합니다." },
  { label: "기마병", eyebrow: "CAVALRY", description: "기마병을 충원합니다." },
];

export default function Page() {
  return <SelectionButtonPage eyebrow="TROOP RECRUITMENT" title="부대 충원" description="충원할 병과를 선택해 주세요." items={troopTypes} />;
}
