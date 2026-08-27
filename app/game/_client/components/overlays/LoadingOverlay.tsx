import Image from "next/image";
import Link from "next/link";
import styles from "./GameOverlay.module.css";

type Props = {
  networkReady: boolean;
  assetsReady: boolean;
  disconnected: boolean;
  setupLabel: string;
  setupFailed: boolean;
};

function Checklist({ done, label }: { done: boolean; label: string }) {
  return (
    <li className={styles.checkItem}>
      <span className={`${styles.checkMark} ${done ? styles.checkDone : ""}`} aria-hidden="true">
        {done ? "✓" : "…"}
      </span>
      <span>{label}</span>
      <span className="sr-only">{done ? "완료" : "진행 중"}</span>
    </li>
  );
}

export default function LoadingOverlay({ networkReady, assetsReady, disconnected, setupLabel, setupFailed }: Props) {
  return (
    <div role="status" aria-live="polite" className={styles.loadingOverlay}>
      <Image
        src="/bg/battlefield.webp"
        alt=""
        fill
        sizes="100vw"
        preload
        draggable={false}
        className={styles.background}
      />
      <div className={styles.shade} aria-hidden="true" />
      <div className={styles.screenFrame} aria-hidden="true" />

      <section className={`${styles.dialog} ${styles.loadingDialog}`}>
        <div className={styles.topBar}>
          <span>FIELD DEPLOYMENT</span>
          <span>SYNC</span>
        </div>

        <p className={styles.eyebrow}>LOADING</p>
        <h2 className={styles.title}>전장을 준비하고 있습니다</h2>

        <ul className={styles.checklist}>
          <Checklist
            done={networkReady}
            label={networkReady ? "게임 서버에 연결하고 부대를 배치하는 중" : `게임 서버 준비 — ${setupLabel}`}
          />
          <Checklist done={assetsReady} label="전장과 병사 모델을 내려받는 중" />
        </ul>

        {setupFailed && !disconnected && (
          <div className={styles.notice}>
            <p>서버가 스테이지 준비 요청을 거절했습니다.</p>
            <p>브라우저 콘솔의 COMMAND_RESULT 로그에서 사유를 확인한 뒤 접속을 다시 눌러 주세요.</p>
          </div>
        )}

        {disconnected && (
          <div className={styles.notice}>
            <p>게임 서버에 연결하지 못했습니다.</p>
            <p>화면 왼쪽 위에서 서버 주소를 확인하고 접속 버튼을 눌러 주세요.</p>
            <Link href="/stage">스테이지 선택으로 돌아가기</Link>
          </div>
        )}
      </section>
    </div>
  );
}
