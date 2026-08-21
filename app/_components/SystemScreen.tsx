import Image from "next/image";
import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";
import UiPanelFrame from "./UiPanelFrame";
import styles from "./SystemScreen.module.css";

type SystemScreenTone = "blue" | "red";

export type SystemScreenAction =
  | {
      label: string;
      href: string;
      onClick?: never;
      emphasis?: "primary" | "secondary";
    }
  | {
      label: string;
      href?: never;
      onClick: MouseEventHandler<HTMLButtonElement>;
      emphasis?: "primary" | "secondary";
    };

type SystemScreenProps = {
  eyebrow: string;
  title: string;
  description: string;
  iconSrc: string;
  tone?: SystemScreenTone;
  role?: "alert" | "status";
  busy?: boolean;
  detail?: ReactNode;
  actions?: readonly SystemScreenAction[];
};

function actionClassName(emphasis: SystemScreenAction["emphasis"]) {
  return `${styles.action} ${emphasis === "secondary" ? styles.secondaryAction : styles.primaryAction}`;
}

export default function SystemScreen({
  eyebrow,
  title,
  description,
  iconSrc,
  tone = "blue",
  role,
  busy = false,
  detail,
  actions = [],
}: SystemScreenProps) {
  const screenClassName = tone === "red" ? `${styles.screen} ${styles.red}` : styles.screen;

  return (
    <main className={screenClassName}>
      <Image
        src="/bg/battlefield.webp"
        alt=""
        fill
        sizes="100vw"
        preload
        className={styles.background}
      />
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.edge} aria-hidden="true" />

      <section
        className={styles.system}
        role={role}
        aria-live={role === "alert" ? "assertive" : role === "status" ? "polite" : undefined}
        aria-busy={busy || undefined}
        aria-labelledby="system-screen-title"
      >
        <div className={styles.cluster}>
          <span className={styles.icon} aria-hidden="true">
            <Image
              src={iconSrc}
              alt=""
              fill
              sizes="(max-width: 640px) 84px, 132px"
              draggable={false}
              unoptimized
              className={styles.iconArt}
            />
          </span>

          <div className={styles.panel}>
            <UiPanelFrame className={styles.panelFrame} sizes="(max-width: 640px) 72vw, 520px" />

            <div className={styles.copy}>
              <p className={styles.eyebrow}>{eyebrow}</p>
              <h1 id="system-screen-title" className={styles.title}>
                {title}
              </h1>
              <p className={styles.description}>{description}</p>
              {detail && <div className={styles.detail}>{detail}</div>}
              {busy && <span className={styles.progress} aria-hidden="true" />}
            </div>

            <span className={styles.accent} aria-hidden="true">
              <Image
                src={tone === "red" ? "/ui/pack/accent-red.webp" : "/ui/pack/accent-blue.webp"}
                alt=""
                fill
                sizes="14rem"
                draggable={false}
                unoptimized
                className={styles.accentArt}
              />
            </span>
          </div>
        </div>

        {actions.length > 0 && (
          <div className={styles.actions}>
            {actions.map((action) =>
              typeof action.href === "string" ? (
                <Link key={`${action.href}-${action.label}`} href={action.href} className={actionClassName(action.emphasis)}>
                  {action.label}
                </Link>
              ) : (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className={actionClassName(action.emphasis)}
                >
                  {action.label}
                </button>
              ),
            )}
          </div>
        )}
      </section>
    </main>
  );
}
