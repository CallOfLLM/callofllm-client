import Image from "next/image";
import GameSelectionShell from "./GameSelectionShell";
import UiPanelFrame from "./UiPanelFrame";
import styles from "./SelectionButtonPage.module.css";

export type SelectionItem = {
  label: string;
  eyebrow: string;
  description: string;
  icon?: string;
  /** 있으면 카드에 소모 골드를 표시한다. */
  cost?: number;
  /** 있으면 카드 우측에 현재 상태를 표시한다. 예: "보유 3", "공격력 13" */
  meta?: string;
  disabled?: boolean;
};

type SelectionButtonPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  items: SelectionItem[];
  /** 클라이언트 컴포넌트에서만 넘긴다. 없으면 카드는 그냥 표시용이다. */
  onSelect?: (item: SelectionItem) => void;
};

export default function SelectionButtonPage({ eyebrow, title, description, items, onSelect }: SelectionButtonPageProps) {
  return (
    <GameSelectionShell eyebrow={eyebrow} title={title} description={description}>
      <div className={styles.grid}>
        {items.map((item) => {
          const accent = item.disabled ? "/ui/pack/accent-red.webp" : "/ui/pack/accent-blue.webp";

          return (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onClick={onSelect && (() => onSelect(item))}
              className={styles.item}
            >
              <span className={styles.icon} aria-hidden="true">
                <Image
                  src={item.icon ?? "/ui/pack/shield.webp"}
                  alt=""
                  fill
                  sizes="(max-width: 700px) 84px, 104px"
                  draggable={false}
                  unoptimized
                  className={styles.iconArt}
                />
              </span>

              <span className={styles.copy}>
                <UiPanelFrame className={styles.frame} sizes="(max-width: 700px) 72vw, 19rem" />
                <span className={styles.copyContent}>
                  <span className={styles.eyebrow}>{item.eyebrow}</span>
                  <strong>{item.label}</strong>
                  <span className={styles.description}>{item.description}</span>

                  {item.cost !== undefined && (
                    <span className={styles.footer}>
                      <span>{item.cost.toLocaleString()} G</span>
                      {item.meta && <span>{item.meta}</span>}
                    </span>
                  )}
                </span>

                <span className={styles.accent} aria-hidden="true">
                  <Image
                    src={accent}
                    alt=""
                    fill
                    sizes="12rem"
                    draggable={false}
                    unoptimized
                    className={styles.accentArt}
                  />
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </GameSelectionShell>
  );
}
