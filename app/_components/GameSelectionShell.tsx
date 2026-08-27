import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import CommandHeader from "./CommandHeader";
import styles from "./GameSelectionShell.module.css";

type GameSelectionShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
};

export default function GameSelectionShell({
  eyebrow,
  title,
  description,
  children,
  backHref = "/main",
  backLabel = "본부로 돌아가기",
}: GameSelectionShellProps) {
  return (
    <main className={styles.screen}>
      <div className={styles.backgroundLayer} aria-hidden="true">
        <Image
          src="/bg/battlefield.webp"
          alt=""
          fill
          sizes="100vw"
          preload
          draggable={false}
          className={`${styles.background} ${styles.battlefield}`}
        />
      </div>
      <div className={styles.atmosphere} aria-hidden="true" />

      <CommandHeader variant="uikit" />

      <section className={styles.content} aria-labelledby="selection-title">
        <header className={styles.heading}>
          <div className={styles.headingCopy}>
            <p>{eyebrow}</p>
            <h1 id="selection-title">{title}</h1>
            <span>{description}</span>
          </div>

          <Link href={backHref} className={styles.backButton}>
            <Image
              src="/ui/pack/status-center.webp"
              alt=""
              fill
              sizes="(max-width: 700px) 112px, 136px"
              draggable={false}
              unoptimized
              className={styles.backFrame}
            />
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m10 7-5 5 5 5M5 12h14" />
            </svg>
            <span>{backLabel}</span>
          </Link>
        </header>

        <div className={styles.separator} aria-hidden="true">
          <Image
            src="/ui/pack/separator-top.webp"
            alt=""
            fill
            sizes="(max-width: 700px) 80vw, 36rem"
            draggable={false}
            unoptimized
            className={styles.separatorArt}
          />
        </div>

        <div className={styles.body}>{children}</div>
      </section>
    </main>
  );
}
