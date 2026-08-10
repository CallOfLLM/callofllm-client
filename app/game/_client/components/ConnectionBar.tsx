import { PROTOCOL_VERSION } from "../../../(lib)/_packet";
import type { ConnectionState } from "../hooks/useGameSession";

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

  return (
    // 로딩 오버레이보다 위에 두어 접속 실패 후에도 주소를 고치고 다시 연결할 수 있게 한다.
    <div className="fixed top-0 left-0 right-80 z-40 flex flex-wrap items-start justify-start gap-3 p-3">
      <div className="flex h-15 items-center gap-2 rounded-md bg-black/60 px-3 text-white">
        <input
          value={wsUrl}
          onChange={(event) => onUrlChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing && connectionState === "closed") onConnect();
          }}
          disabled={connectionState !== "closed"}
          spellCheck={false}
          placeholder="ws://호스트:포트"
          className="w-72 rounded bg-white/20 px-2 py-2 font-mono text-sm disabled:opacity-50"
        />
        <button
          type="button"
          onClick={connected ? onDisconnect : onConnect}
          disabled={connecting || closing}
          className="h-10 w-30 min-w-30 rounded-md bg-white text-base font-bold text-black disabled:opacity-40"
        >
          {buttonLabel}
        </button>
        {connected && (
          <span className="text-xs text-white/60">
            {protocolReady
              ? connectionDetails({ serverProtocolVersion, sessionID, mapInfo, setupLabel })
              : "WELCOME 대기"}
          </span>
        )}
      </div>
    </div>
  );
}
