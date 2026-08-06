"use client";

import { Canvas } from "@react-three/fiber";
import { Box, OrbitControls, Plane } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import { createSquad, moveSquad, dump, parseSoldierSnapshot, type Soldier } from "./(lib)/_packet";

const WS_URL = "ws://122.32.12.199:80";

// 맵 좌표계: 좌상단 모서리가 원점(0,0), X는 가로 0~640, Y(3D의 z)는 세로 0~320.
// 서버가 unsigned int를 쓰므로 음수 좌표가 나오지 않게 원점을 모서리에 맞춘다.
const MAP_W = 640;
const MAP_H = 320;

const READY_STATE = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"] as const;

const CLOSE_REASON: Record<number, string> = {
  1000: "정상 종료",
  1001: "엔드포인트 사라짐 (탭 닫힘/서버 종료)",
  1002: "프로토콜 에러",
  1003: "허용되지 않는 데이터 타입",
  1005: "close 코드 없이 종료",
  1006: "비정상 종료 — 핸드셰이크 실패/연결 끊김 (서버 미기동·방화벽·주소 오타 의심)",
  1007: "잘못된 payload",
  1008: "정책 위반",
  1009: "메시지가 너무 큼",
  1011: "서버 내부 오류",
  1015: "TLS 핸드셰이크 실패",
};

// teamFlag → 색. 팀 번호 의미가 정해지면 여기만 바꾸면 된다.
const TEAM_COLOR = ["#3b82f6", "#ef4444", "#22c55e", "#eab308"];
const DEAD_COLOR = "#4b5563";

function Soldiers({ soldiers }: { soldiers: Soldier[] }) {
  return (
    <>
      {soldiers.map((s) => (
        <Box key={`${s.squadID}-${s.soldierID}`} position={[s.posX, 0.5, s.posY]}>
          <meshStandardMaterial color={s.hp <= 0 ? DEAD_COLOR : TEAM_COLOR[s.teamFlag % TEAM_COLOR.length]} />
        </Box>
      ))}
    </>
  );
}

type LogLevel = "info" | "send" | "recv" | "warn" | "error";
type LogEntry = { id: number; time: string; level: LogLevel; text: string };

const LOG_COLOR: Record<LogLevel, string> = {
  info: "text-white/80",
  send: "text-sky-300",
  recv: "text-emerald-300",
  warn: "text-amber-300",
  error: "text-red-400",
};

const LOG_LIMIT = 300;

/** 로그 패널에 한 줄로 보여줄 요약 문자열 */
function summarize(v: unknown): string {
  if (v == null) return "";
  if (typeof v !== "object") return String(v);

  const o = v as Record<string, unknown>;
  if (typeof o.name === "string" && Array.isArray(o.fields)) {
    return `${o.name} fields=[${(o.fields as number[]).join(", ")}] len=${o.pktLen}`;
  }
  try {
    return JSON.stringify(v).slice(0, 200);
  } catch {
    return "";
  }
}

export default function Home() {
  const wsRef = useRef<WebSocket | null>(null);

  // onopen 이벤트에만 의존하지 않고 실제 readyState를 그대로 비춘다
  const [wsState, setWsState] = useState<number>(WebSocket.CLOSED);
  const connected = wsState === WebSocket.OPEN;

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logIdRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  // PKT_CS_CREATE_SQUAD 입력값
  const [archerNum, setArcherNum] = useState(3);
  const [warriorNum, setWarriorNum] = useState(5);
  const [knightNum, setKnightNum] = useState(2);

  // PKT_CS_MOVE_SQUAD 대상 부대 (서버가 생성 응답으로 내려주는 ID)
  const [squadNum, setSquadNum] = useState(0);

  // 서버가 내려준 병사 스냅샷 — 화면은 전적으로 이 값으로만 그린다
  const [soldiers, setSoldiers] = useState<Soldier[]>([]);

  // 페이지를 떠날 때 소켓 정리
  useEffect(() => {
    return () => wsRef.current?.close();
  }, []);

  // 이벤트를 놓치더라도 버튼이 실제 소켓 상태와 어긋나지 않게 주기적으로 맞춘다
  useEffect(() => {
    const id = setInterval(() => {
      setWsState(wsRef.current?.readyState ?? WebSocket.CLOSED);
    }, 200);
    return () => clearInterval(id);
  }, []);

  // 로그가 쌓이면 항상 최신 줄이 보이게
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [logs]);

  const pushLog = (level: LogLevel, text: string) => {
    const time = new Date().toTimeString().slice(0, 8);
    setLogs((prev) => [...prev.slice(-(LOG_LIMIT - 1)), { id: logIdRef.current++, time, level, text }]);
  };

  const wsLog = (label: string, ...rest: unknown[]) => {
    const time = new Date().toISOString().slice(11, 23);
    const state = wsRef.current ? READY_STATE[wsRef.current.readyState] : "NONE";
    console.log(`%c[WS ${time}]%c ${label} %c(${state})`, "color:#0af;font-weight:bold", "color:inherit", "color:#888", ...rest);

    const detail = summarize(rest[0]);
    const level: LogLevel = label.startsWith("SEND") ? "send" : label.startsWith("RECV") ? "recv" : "info";
    pushLog(level, detail ? `${label} — ${detail}` : label);
  };

  const connect = () => {
    if (wsRef.current) {
      wsLog("연결 요청 무시 — 이미 소켓이 있음");
      return;
    }

    wsLog(`핸드셰이크 시작 → ${WS_URL}`);
    const startedAt = performance.now();
    const elapsed = () => `${Math.round(performance.now() - startedAt)}ms`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
    } catch (err) {
      console.error("[WS] 생성 실패 — URL 형식을 확인하세요:", WS_URL, err);
      pushLog("error", `생성 실패 — URL 형식 확인 필요: ${WS_URL}`);
      return;
    }

    ws.binaryType = "arraybuffer"; // 바이너리 패킷을 Blob 대신 ArrayBuffer로 받는다
    wsRef.current = ws;
    wsLog("WebSocket 객체 생성됨", { url: ws.url, binaryType: ws.binaryType });

    ws.onopen = (e) => {
      wsLog(`OPEN — 핸드셰이크 성공 (${elapsed()})`, {
        protocol: ws.protocol || "(없음)",
        extensions: ws.extensions || "(없음)",
        event: e,
      });
      setWsState(ws.readyState);
    };

    ws.onmessage = (e) => {
      if (!(e.data instanceof ArrayBuffer)) {
        wsLog(`RECV (텍스트 ${String(e.data).length}자)`, e.data);
        return;
      }

      wsLog(`RECV (${e.data.byteLength}바이트)`, dump(e.data));

      const snapshot = parseSoldierSnapshot(e.data);
      if (!snapshot) {
        wsLog("RECV — 병사 스냅샷 레이아웃과 길이가 맞지 않음, 무시");
        return;
      }

      wsLog(`RECV 병사 스냅샷 ${snapshot.soldierCount}명`, snapshot.soldiers);
      setSoldiers(snapshot.soldiers);
    };

    ws.onerror = (e) => {
      console.error(`[WS] ERROR (${elapsed()}) — 브라우저는 보안상 상세 사유를 주지 않습니다. 바로 뒤에 오는 CLOSE 코드를 보세요.`, e);
      pushLog("error", `ERROR (${elapsed()}) — 사유는 뒤따르는 CLOSE 코드로 확인`);
    };

    ws.onclose = (e) => {
      const reason = CLOSE_REASON[e.code] ?? "알 수 없는 코드";
      console.warn(`[WS] CLOSE (${elapsed()}) code=${e.code} (${reason}) reason="${e.reason || "(없음)"}" wasClean=${e.wasClean}`, e);
      pushLog("warn", `CLOSE (${elapsed()}) code=${e.code} — ${reason}`);
      wsRef.current = null;
      setWsState(WebSocket.CLOSED);
      setSoldiers([]);
    };
  };

  const disconnect = () => {
    if (!wsRef.current) {
      wsLog("해제 요청 무시 — 열린 소켓이 없음");
      return;
    }
    wsLog("close() 호출 — 종료 대기");
    wsRef.current.close(1000, "client disconnect");
  };

  const sendPacket = (buf: ArrayBuffer) => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) {
      wsLog("SEND 실패 — 소켓이 열려 있지 않음");
      return false;
    }
    wsLog("SEND", dump(buf));
    ws.send(buf);
    return true;
  };

  const sendCreateSquad = () => {
    sendPacket(createSquad(archerNum, warriorNum, knightNum));
  };

  const sendMoveSquad = (x: number, y: number) => {
    // 맵 밖을 찍어도 unsigned int 범위를 벗어나지 않게 잘라낸다.
    const posX = Math.min(MAP_W, Math.max(0, Math.round(x)));
    const posY = Math.min(MAP_H, Math.max(0, Math.round(y)));
    sendPacket(moveSquad(squadNum, posX, posY));
  };

  return (
    <div className="w-full h-dvh">
      <Canvas camera={{ position: [MAP_W / 2, 420, MAP_H + 380], far: 5000 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[MAP_W / 2, 400, MAP_H / 2]} />

        {/* 평면은 중심 기준이라 절반씩 밀어 좌상단 모서리를 원점에 맞춘다 */}
        <Plane
          args={[MAP_W, MAP_H]}
          position={[MAP_W / 2, 0, MAP_H / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={(e) => {
            e.stopPropagation();
            sendMoveSquad(e.point.x, e.point.z);
          }}
        >
          <meshStandardMaterial color="lightgray" />
        </Plane>

        {/* 원점 표시 — 맵의 (0,0) 모서리 */}
        <Box position={[0, 0.5, 0]} args={[2, 1, 2]}>
          <meshStandardMaterial color="black" />
        </Box>

        <Soldiers soldiers={soldiers} />

        <OrbitControls target={[MAP_W / 2, 0, MAP_H / 2]} />
      </Canvas>

      <div className="fixed top-0 left-0 w-full flex justify-start gap-5 items-center p-3">
        <button
          onClick={connected ? disconnect : connect}
          disabled={wsState === WebSocket.CONNECTING || wsState === WebSocket.CLOSING}
          className="w-30 h-15 min-w-30 min-h-15 bg-black rounded-md text-white text-base font-bold border-gray-400 border-2 disabled:opacity-50"
        >
          {wsState === WebSocket.OPEN ? "접속 해제" : wsState === WebSocket.CONNECTING ? "접속 중…" : wsState === WebSocket.CLOSING ? "종료 중…" : "접속"}
        </button>

        <div className="flex items-center gap-2 h-15 rounded-md bg-black/60 px-3 text-white">
          {(
            [
              ["궁수", archerNum, setArcherNum],
              ["전사", warriorNum, setWarriorNum],
              ["기사", knightNum, setKnightNum],
            ] as const
          ).map(([label, value, setValue]) => (
            <label key={label} className="flex items-center gap-1 text-sm">
              {label}
              <input type="number" min={0} value={value} onChange={(e) => setValue(Math.max(0, Number(e.target.value) || 0))} className="w-14 rounded bg-white/20 px-1 py-1 text-center" />
            </label>
          ))}

          <button onClick={sendCreateSquad} disabled={!connected} className="ml-1 h-10 px-3 bg-white text-black rounded-md font-bold disabled:opacity-40">
            부대 생성
          </button>
        </div>

        <div className="flex items-center gap-2 h-15 rounded-md bg-black/60 px-3 text-white">
          <label className="flex items-center gap-1 text-sm">
            SquadNum
            <input type="number" min={0} value={squadNum} onChange={(e) => setSquadNum(Math.max(0, Number(e.target.value) || 0))} className="w-16 rounded bg-white/20 px-1 py-1 text-center" />
          </label>
          <span className="text-xs text-white/60">바닥을 클릭하면 MOVE 패킷 전송</span>
        </div>
      </div>

      {/* 수신한 병사 값 확인용 패널 */}
      <div className="fixed top-3 right-3 w-72 max-h-[70dvh] overflow-y-auto rounded-md bg-black/70 p-3 text-white text-xs">
        <div className="font-bold mb-2">병사 {soldiers.length}명</div>
        {soldiers.length === 0 ? (
          <div className="text-white/50">수신 대기 중</div>
        ) : (
          <table className="w-full">
            <thead className="text-white/50">
              <tr>
                <th className="text-left">sq/id</th>
                <th>team</th>
                <th>pos</th>
                <th>HP</th>
                <th>st</th>
              </tr>
            </thead>
            <tbody>
              {soldiers.map((s) => (
                <tr key={`${s.squadID}-${s.soldierID}`} className={s.hp <= 0 ? "text-white/40" : ""}>
                  <td>
                    {s.squadID}/{s.soldierID}
                  </td>
                  <td className="text-center" style={{ color: TEAM_COLOR[s.teamFlag % TEAM_COLOR.length] }}>
                    ■ {s.teamFlag}
                  </td>
                  <td className="text-center">
                    {s.posX},{s.posY}
                  </td>
                  <td className="text-center">{s.hp}</td>
                  <td className="text-center">{s.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
