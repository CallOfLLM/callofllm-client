"use client";

import { useEffect, useState } from "react";
import SelectionButtonPage from "../../_components/SelectionButtonPage";
import { DEFAULT_GAME_DATA, loadGameData, recruitTroop, saveGameData, TROOP_COST, type GameData, type TroopKey } from "../../(lib)/_gametype";

const TROOP_TYPES: { key: TroopKey; label: string; eyebrow: string; description: string; icon: string }[] = [
  { key: "warrior", label: "보병", eyebrow: "INFANTRY", description: "보병을 충원합니다.", icon: "/ui/pack/shield.webp" },
  { key: "archer", label: "궁수", eyebrow: "ARCHER", description: "궁수를 충원합니다.", icon: "/ui/pack/archer.webp" },
  { key: "knight", label: "기마병", eyebrow: "CAVALRY", description: "기마병을 충원합니다.", icon: "/ui/pack/cavalry.webp" },
];

export default function TroopClient() {
  const [gameData, setGameData] = useState<GameData>(DEFAULT_GAME_DATA);

  // 로컬스토리지는 서버 렌더 시점에 없으므로 마운트 후에 읽는다.
  useEffect(() => {
    const sync = () => setGameData(loadGameData());
    sync();
  }, []);

  const items = TROOP_TYPES.map(({ key, label, eyebrow, description, icon }) => ({
    label,
    eyebrow,
    description,
    icon,
    cost: TROOP_COST[key],
    meta: `보유 ${gameData[key].toLocaleString()}`,
    disabled: gameData.gold < TROOP_COST[key],
  }));

  const recruit = (label: string) => {
    const troop = TROOP_TYPES.find((type) => type.label === label);
    if (!troop) return;

    const next = recruitTroop(gameData, troop.key);
    if (!next) return; // 골드 부족

    setGameData(next);
    saveGameData(next);
  };

  return (
    <SelectionButtonPage
      eyebrow="TROOP RECRUITMENT"
      title="부대 충원"
      description={`충원할 병과를 선택해 주세요. 보유 골드 ${gameData.gold.toLocaleString()} G`}
      items={items}
      onSelect={(item) => recruit(item.label)}
    />
  );
}
