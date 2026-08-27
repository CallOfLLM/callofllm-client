"use client";

import { useEffect, useRef } from "react";
import BattleManual from "../../../../_components/BattleManual";
import styles from "./GameOverlay.module.css";

type Props = {
  battleInProgress: boolean;
  onClose: () => void;
};

export default function ManualOverlay({ battleInProgress, onClose }: Props) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => {
        if (opener?.isConnected) opener.focus();
      });
    };
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="battle-manual-title" className={styles.overlay}>
      <div className={styles.shade} aria-hidden="true" />
      <div className={styles.screenFrame} aria-hidden="true" />

      <section ref={dialogRef} className={`${styles.dialog} ${styles.manualDialog}`}>
        <div className={styles.topBar}>
          <span>FIELD MANUAL</span>
          <button type="button" onClick={onClose} autoFocus className={styles.topBarClose}>
            ESC · 닫기
          </button>
        </div>

        <p className={styles.eyebrow}>COMMANDER REFERENCE</p>
        <h2 id="battle-manual-title" className={styles.title}>
          전투 사용설명서
        </h2>
        <p className={styles.lead}>부대 이름과 행동을 자연어로 입력하면 AI 지휘관이 실행 가능한 명령으로 바꿉니다.</p>

        {battleInProgress && (
          <p className={styles.manualNotice}>설명서를 보는 동안에도 전투는 계속 진행됩니다.</p>
        )}

        <div className={styles.manualContent}>
          <BattleManual compact />
        </div>

        <div className={styles.actions}>
          <button type="button" onClick={onClose} className={styles.primaryButton}>
            전장으로 돌아가기
          </button>
        </div>
      </section>
    </div>
  );
}
