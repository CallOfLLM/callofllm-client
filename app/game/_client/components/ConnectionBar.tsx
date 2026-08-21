import Image from "next/image";
import { PROTOCOL_VERSION } from "../../../(lib)/_packet";
import UiPanelFrame from "../../../_components/UiPanelFrame";
import type { ConnectionState } from "../hooks/useGameSession";
import styles from "./GameHud.module.css";

type Props = {
  wsUrl: string;
  connectionState: ConnectionState;
  protocolReady: boolean;
  serverProtocolVersion: number | undefined;
  sessionID: number | undefined;
  mapInfo: { mapID: number; mapVersion: number } | undefined;
  setupLabel: string;
  onUrlChange: (url: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
};

function connectionDetails({
  serverProtocolVersion,
  sessionID,
  mapInfo,
  setupLabel,
}: Pick<Props, "serverProtocolVersion" | "sessionID" | "mapInfo" | "setupLabel">) {
  const map = mapInfo ? ` · map ${mapInfo.mapID}(v${mapInfo.mapVersion})` : "";
  return `V${serverProtocolVersion ?? PROTOCOL_VERSION} · #${sessionID}${map} · ${setupLabel}`;
}

export default function ConnectionBar({
  wsUrl,
  connectionState,
  protocolReady,
  serverProtocolVersion,
  sessionID,
  mapInfo,
  setupLabel,
  onUrlChange,
  onConnect,
  onDisconnect,
}: Props) {
  const connected = connectionState === "open";
  const connecting = connectionState === "connecting";
  const closing = connectionState === "closing";

  const buttonLabel = connected ? "접속 해제" : connecting ? "접속 중…" : closing ? "종료 중…" : "접속";
  const indicatorClassName = `${styles.connectionIndicator} ${
    connected ? styles.connected : connecting || closing ? styles.connecting : ""
  }`;

  return (
    // 로딩 오버레이보다 위에 두어 접속 실패 후에도 주소를 고치고 다시 연결할 수 있게 한다.
    <div className={styles.connectionBar}>
      <div className={styles.connectionPanel}>
        <UiPanelFrame className={styles.connectionFrame} sizes="(max-width: 700px) calc(100vw - 16px), 624px" />
        <div className={styles.connectionContent}>
          <span className={indicatorClassName} aria-hidden="true" />
          <input
            value={wsUrl}
            onChange={(event) => onUrlChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing && connectionState === "closed") onConnect();
            }}
            disabled={connectionState !== "closed"}
            spellCheck={false}
            aria-label="게임 서버 주소"
            placeholder="ws://호스트:포트"
            className={styles.wsInput}
          />
          <button
            type="button"
            onClick={connected ? onDisconnect : onConnect}
            disabled={connecting || closing}
            className={styles.connectButton}
          >
            <Image
              src="/ui/pack/status-center.webp"
              alt=""
              fill
              sizes="100px"
              draggable={false}
              unoptimized
              className={styles.buttonFrame}
            />
            <span>{buttonLabel}</span>
          </button>
          {connected && (
            <span className={styles.connectionDetails}>
              {protocolReady
                ? connectionDetails({ serverProtocolVersion, sessionID, mapInfo, setupLabel })
                : "WELCOME 대기"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
