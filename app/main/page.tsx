import Image from "next/image";
import Link from "next/link";
import CommandHeader from "../_components/CommandHeader";
import UiPanelFrame from "../_components/UiPanelFrame";
import styles from "./MainPage.module.css";

const menus = [
  {
    href: "/stage",
    eyebrow: "DEPLOY",
    title: "출정",
    description: "전장과 스테이지를 선택합니다.",
    icon: "/ui/pack/swords.webp",
    accent: "/ui/pack/accent-blue.webp",
    pending: false,
  },
  {
    href: "/troop",
    eyebrow: "RECRUIT",
    title: "부대 충원",
    description: "부대에 충원할 병과를 선택합니다.",
    icon: "/ui/pack/cavalry.webp",
    accent: "/ui/pack/accent-blue.webp",
    pending: false,
  },
  {
    href: "/building",
    eyebrow: "FACILITY",
    title: "부대 설비",
    description: "관리할 부대 시설을 선택합니다.",
    icon: "/ui/pack/shield.webp",
    accent: "/ui/pack/accent-blue.webp",
    pending: false,
  },
  {
    href: "/manual",
    eyebrow: "FIELD MANUAL",
    title: "사용설명서",
    description: "편성, 카메라, 자연어 명령을 확인합니다.",
    icon: "/ui/pack/infantry-formation.webp",
    accent: "/ui/pack/accent-blue.webp",
    pending: false,
  },
] as const;

export default function Page() {
  return (
    <main className={styles.screen}>
      <div className={styles.backgroundLayer} aria-hidden="true">
        <Image
          src="/bg/battlefield.webp"
          fill
          sizes="100vw"
          preload
          draggable={false}
          className={styles.background}
          alt=""
        />
      </div>
      <div className={styles.atmosphere} aria-hidden="true" />

      <CommandHeader variant="uikit" />

      <section className={styles.commandDeck} aria-labelledby="command-title">
        <header className={styles.heading}>
          <p>COMMAND CENTER</p>
          <h1 id="command-title">부대 관리</h1>
          <span>진행할 부대 업무를 선택해 주세요.</span>
        </header>

        <nav className={styles.menuGrid} aria-label="부대 관리 메뉴">
          {menus.map((menu) => (
            <Link
              key={menu.title}
              href={menu.href}
              className={`${styles.menuItem} ${menu.pending ? styles.pending : ""}`}
            >
              <span className={styles.menuIcon} aria-hidden="true">
                <Image
                  src={menu.icon}
                  alt=""
                  fill
                  sizes="(max-width: 700px) 82px, 116px"
                  draggable={false}
                  unoptimized
                  className={styles.menuIconArt}
                />
              </span>

              <span className={styles.menuCopy}>
                <UiPanelFrame className={styles.menuFrame} sizes="(max-width: 700px) 70vw, 340px" />
                <span className={styles.menuCopyContent}>
                  <span className={styles.menuMeta}>
                    <span className={styles.eyebrow}>{menu.eyebrow}</span>
                    {menu.pending && <span className={styles.pendingLabel}>준비중</span>}
                  </span>
                  <strong className={styles.menuTitle}>{menu.title}</strong>
                  <span className={styles.description}>{menu.description}</span>
                </span>
                <span className={styles.menuAccent} aria-hidden="true">
                  <Image
                    src={menu.accent}
                    alt=""
                    fill
                    sizes="12rem"
                    draggable={false}
                    unoptimized
                    className={styles.menuAccentArt}
                  />
                </span>
              </span>
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}
