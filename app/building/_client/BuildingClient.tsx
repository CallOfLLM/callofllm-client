"use client";

import { useEffect, useState } from "react";
import SelectionButtonPage from "../../_components/SelectionButtonPage";
import {
  DEFAULT_GAME_DATA,
  FACILITY_ATTACK_GAIN,
  FACILITY_COST,
  loadGameData,
  saveGameData,
  upgradeFacility,
  type GameData,
  type TroopKey,
} from "../../(lib)/_gametype";

const FACILITY_TYPES: { key: TroopKey; label: string; eyebrow: string }[] = [
  { key: "warrior", label: "보병훈련소", eyebrow: "INFANTRY CAMP" },
  { key: "archer", label: "궁병훈련소", eyebrow: "ARCHER CAMP" },
  { key: "knight", label: "기병 훈련소", eyebrow: "CAVALRY CAMP" },
];

export default function BuildingClient() {
  const [gameData, setGameData] = useState<GameData>(DEFAULT_GAME_DATA);

  // 로컬스토리지는 서버 렌더 시점에 없으므로 마운트 후에 읽는다.
  useEffect(() => {
    setGameData(loadGameData());
  }, []);

  const items = FACILITY_TYPES.map(({ key, label, eyebrow }) => ({
    label,
    eyebrow,
    description: `강화하면 공격력이 +${FACILITY_ATTACK_GAIN} 올라갑니다.`,
    cost: FACILITY_COST[key],
    meta: `공격력 ${gameData[`${key}_attack`].toLocaleString()}`,
    disabled: gameData.gold < FACILITY_COST[key],
  }));

  const upgrade = (label: string) => {
    const facility = FACILITY_TYPES.find((type) => type.label === label);
    if (!facility) return;

    const next = upgradeFacility(gameData, facility.key);
    if (!next) return; // 골드 부족

    setGameData(next);
    saveGameData(next);
  };

  return (
    <SelectionButtonPage
      eyebrow="SQUAD FACILITIES"
      title="부대 설비"
      description={`관리할 설비를 선택해 주세요. 보유 골드 ${gameData.gold.toLocaleString()} G`}
      items={items}
      onSelect={(item) => upgrade(item.label)}
    />
  );
}
