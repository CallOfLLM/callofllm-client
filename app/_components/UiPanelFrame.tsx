import Image from "next/image";
import styles from "./UiPanelFrame.module.css";

type UiPanelFrameProps = {
  className?: string;
  sizes?: string;
  variant?: "medium" | "slim";
};

const FRAME_ASSETS = {
  medium: {
    left: "/ui/pack/panel-medium-left.webp",
    center: "/ui/pack/panel-medium-center.webp",
    right: "/ui/pack/panel-medium-right.webp",
    capWidth: 92,
    width: 17,
    height: 151,
  },
  slim: {
    left: "/ui/pack/panel-slim-left.webp",
    center: "/ui/pack/panel-slim-center.webp",
    right: "/ui/pack/panel-slim-right.webp",
    capWidth: 56,
    width: 17,
    height: 72,
  },
} as const;

export default function UiPanelFrame({ className, sizes = "100vw", variant = "medium" }: UiPanelFrameProps) {
  const frameClassName = className ? `${styles.frame} ${className}` : styles.frame;
  const asset = FRAME_ASSETS[variant];

  return (
    <span className={frameClassName} aria-hidden="true">
      <Image
        src={asset.left}
        alt=""
        width={asset.capWidth}
        height={asset.height}
        draggable={false}
        unoptimized
        className={styles.cap}
      />
      <span className={styles.center}>
        <Image
          src={asset.center}
          alt=""
          fill
          sizes={sizes}
          draggable={false}
          unoptimized
          className={styles.centerArt}
        />
      </span>
      <Image
        src={asset.right}
        alt=""
        width={asset.capWidth}
        height={asset.height}
        draggable={false}
        unoptimized
        className={styles.cap}
      />
    </span>
  );
}
