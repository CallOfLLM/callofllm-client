import SelectionButtonPage from "../_components/SelectionButtonPage";

const buildingTypes = [
  { label: "보병훈련소", eyebrow: "INFANTRY CAMP", description: "보병 훈련 설비를 관리합니다." },
  { label: "궁병훈련소", eyebrow: "ARCHER CAMP", description: "궁병 훈련 설비를 관리합니다." },
  { label: "기병 훈련소", eyebrow: "CAVALRY CAMP", description: "기병 훈련 설비를 관리합니다." },
];

export default function Page() {
  return <SelectionButtonPage eyebrow="SQUAD FACILITIES" title="부대 설비" description="관리할 설비를 선택해 주세요." items={buildingTypes} />;
}
