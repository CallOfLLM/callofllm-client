"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COMMAND_RESULT_CODE,
  dump,
  MAP_BOUNDS,
  parseServerPacket,
  PKT,
  PKT_NAME,
  PROTOCOL_VERSION,
  resumeSession,
  selectMap,
  STAGE_STATE,
  startStage,
  TEAM_FLAG,
} from "../../../(lib)/_packet";
import type { StageDeployment } from "../../../(lib)/squadfuncs";
import type { StageData } from "../../../(lib)/stages";
import {
  summarizeForLog,
  writeGameLog,
  type GameLogLevel,
  type GameLogger,
} from "../lib/gameLog";
import {
  createIdleStageSetup,
  createStageSetup,
  getExpectedEnemySquadCount,
  type AllySquad,
  type EnemySquad,
  type PendingCreate,
  type SetupPhase,
} from "../lib/stageSetup";
import {
  soldierKey,
  unitTypeFromInitialHP,
  type BattlefieldSoldier,
  type SoldierUnitType,
} from "../lib/soldierUnitType";

const DEFAULT_WS_URL = process.env.NEXT_PUBLIC_GAME_WS_URL?.trim() ?? "";

const SOCKET_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

const CONNECTION_STATES = ["connecting", "open", "closing", "closed"] as const;
export type ConnectionState = (typeof CONNECTION_STATES)[number];

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
  4002: "게임 프로토콜 버전 불일치",
};

const COMMAND_RESULT_NAME: Record<number, string> = {
  [COMMAND_RESULT_CODE.OK]: "OK",
  [COMMAND_RESULT_CODE.INVALID_PAYLOAD]: "INVALID_PAYLOAD",
  [COMMAND_RESULT_CODE.NOT_OWNER]: "NOT_OWNER",
  [COMMAND_RESULT_CODE.NOT_FOUND]: "NOT_FOUND",
  [COMMAND_RESULT_CODE.INVALID_STATE]: "INVALID_STATE",
  [COMMAND_RESULT_CODE.PATH_NOT_FOUND]: "PATH_NOT_FOUND",
  [COMMAND_RESULT_CODE.LIMIT_EXCEEDED]: "LIMIT_EXCEEDED",
};

const STAGE_STATE_NAME: Record<number, string> = {
  [STAGE_STATE.WAITING]: "WAITING",
  [STAGE_STATE.RUNNING]: "RUNNING",
  [STAGE_STATE.ALLY_WIN]: "ALLY_WIN",
  [STAGE_STATE.ENEMY_WIN]: "ENEMY_WIN",
  [STAGE_STATE.DRAW]: "DRAW",
};

const EXPECTED_MAP = {
  version: 1,
  width: MAP_BOUNDS.maxX + 1,
  height: MAP_BOUNDS.maxY + 1,
  gridCellSize: 10,
} as const;

export interface MapInfo {
  mapID: number;
  mapVersion: number;
  gridCellSize: number;
}

export interface StageStatus {
  stageState: number;
  aliveAllyCount: number;
  aliveEnemyCount: number;
}

export type SendCommand = (createPacket: () => ArrayBuffer) => boolean;

interface UseGameSessionOptions {
  stage: StageData | null;
  getLatestDeployment: () => StageDeployment | null;
  usedFallback: boolean;
  onDisconnected: () => void;
}

/** WebSocket 연결, V15 초기화 절차와 서버가 내려주는 전장 상태를 한곳에서 관리한다. */
export function useGameSession({ stage, getLatestDeployment, usedFallback, onDisconnected }: UseGameSessionOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const connectRef = useRef<() => void>(() => undefined);

  const setupRef = useRef(createIdleStageSetup());
  const pendingCreatesRef = useRef<PendingCreate[]>([]);
  const sessionIDRef = useRef<number | null>(null);
  const resumeSessionIDRef = useRef<number | null>(null);
  const protocolReadyRef = useRef(false);
  const soldierUnitTypesRef = useRef(new Map<string, SoldierUnitType>());

  const [wsUrl, setWsUrl] = useState(DEFAULT_WS_URL);
  const [wsState, setWsState] = useState<number>(SOCKET_STATE.CLOSED);
  const [connectionClosed, setConnectionClosed] = useState(!DEFAULT_WS_URL);
  const [protocolReady, setProtocolReady] = useState(false);
  const [serverProtocolVersion, setServerProtocolVersion] = useState<number>();
  const [sessionID, setSessionID] = useState<number>();
  const [mapInfo, setMapInfo] = useState<MapInfo>();
  const [setupPhase, setSetupPhase] = useState<SetupPhase>("idle");

  const [soldiers, setSoldiers] = useState<BattlefieldSoldier[]>([]);
  const [stageStatus, setStageStatus] = useState<StageStatus>();
  const [allySquads, setAllySquads] = useState<AllySquad[]>([]);
  const [enemySquads, setEnemySquads] = useState<EnemySquad[]>([]);
  const enemySquadsRef = useRef<EnemySquad[]>([]);

  const pushLog = useCallback<GameLogger>((level, message) => writeGameLog(level, message), []);

  const wsLog = useCallback(
    (label: string, ...details: unknown[]) => {
      const readyState = wsRef.current?.readyState;
      const stateName = readyState === undefined ? "NONE" : CONNECTION_STATES[readyState].toUpperCase();
      const detail = summarizeForLog(details[0]);
      const level: GameLogLevel = label.startsWith("SEND") ? "send" : label.startsWith("RECV") ? "recv" : "info";
      pushLog(level, detail ? `${label} (${stateName}) — ${detail}` : `${label} (${stateName})`);
    },
    [pushLog],
  );

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsLog("연결 요청 무시 — 이미 소켓이 있음");
      return;
    }

    const url = wsUrl.trim();
    if (!url) {
      pushLog("error", "서버 주소가 비어 있습니다");
      return;
    }
    if (!stage) {
      pushLog("error", "스테이지 정보를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    protocolReadyRef.current = false;
    setProtocolReady(false);
    setServerProtocolVersion(undefined);
    setSessionID(undefined);
    sessionIDRef.current = null;
    setupRef.current = createIdleStageSetup();
    setSetupPhase("idle");

    wsLog(`핸드셰이크 시작 → ${url}`);
    const startedAt = performance.now();
    const elapsed = () => `${Math.round(performance.now() - startedAt)}ms`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
      setConnectionClosed(false);
      setWsState(SOCKET_STATE.CONNECTING);
    } catch (error) {
      console.warn("[WS] 생성 실패 — URL 형식을 확인하세요:", url, error);
      pushLog("error", `생성 실패 — 주소 형식 확인 필요 (ws:// 또는 wss:// 로 시작해야 함): ${url}`);
      setConnectionClosed(true);
      return;
    }

    ws.binaryType = "arraybuffer";
    wsRef.current = ws;
    wsLog("WebSocket 객체 생성됨", { url: ws.url, binaryType: ws.binaryType });

    ws.onopen = (event) => {
      wsLog(`OPEN — 핸드셰이크 성공 (${elapsed()})`, {
        protocol: ws.protocol || "(없음)",
        extensions: ws.extensions || "(없음)",
        event,
      });
      setWsState(ws.readyState);
    };

    const sendSetupPacket = (label: string, buffer: ArrayBuffer) => {
      if (ws.readyState !== SOCKET_STATE.OPEN) {
        pushLog("error", `${label} 전송 실패 — 소켓이 열려 있지 않습니다`);
        return false;
      }

      wsLog(`SEND ${label}`, dump(buffer));
      ws.send(buffer);
      return true;
    };

    const failSetup = (message: string) => {
      setupRef.current.phase = "failed";
      setSetupPhase("failed");
      pushLog("error", message);
    };

    const sendNextSquad = () => {
      const setup = setupRef.current;
      const next = setup.queue.shift();

      if (!next) {
        if (setup.createdAllyCount === 0 || setup.createdEnemyCount === 0) {
          failSetup(
            `STAGE ${setup.stageID} 배치 실패 — 아군 ${setup.createdAllyCount}개, 적군 ${setup.createdEnemyCount}개 생성. 양 팀 모두 최소 한 스쿼드가 필요합니다. map=${setup.mapID}의 생성 좌표를 확인하세요.`,
          );
          return;
        }

        setup.phase = "ready";
        setSetupPhase("ready");
        pushLog("info", `STAGE ${setup.stageID} 초기 배치 완료 — 스쿼드 ${setup.createdCount}개`);
        return;
      }

      // COMMAND_RESULT에 request ID가 없으므로 전송 순서대로 결과를 대응시킨다.
      pendingCreatesRef.current.push(next.pendingCreate);
      sendSetupPacket(`CREATE_SQUAD '${next.label}' (남은 ${setup.queue.length}개)`, next.buffer);
    };

    const maybeStartStage = () => {
      const setup = setupRef.current;
      if (setup.phase !== "selectingMap") return;
      if (!setup.mapCommandAccepted || setup.confirmedMapID !== setup.mapID) return;

      setup.phase = "startingStage";
      setSetupPhase("startingStage");
      sendSetupPacket("START_STAGE", startStage());
    };

    const beginStageSetup = () => {
      try {
        if (usedFallback) pushLog("warn", "잘못된 stage 번호라 1번 스테이지를 사용합니다.");

        soldierUnitTypesRef.current.clear();
        const setup = createStageSetup(stage, getLatestDeployment());

        pendingCreatesRef.current = [];
        setAllySquads([]);
        enemySquadsRef.current = [];
        setEnemySquads([]);

        setupRef.current = setup;
        setSetupPhase(setup.phase);
        pushLog("info", `STAGE ${stage.id} '${stage.title}' 준비 시작 — map=${setup.mapID}, 배치 ${setup.queue.length}개`);
        sendSetupPacket(`SELECT_MAP map=${setup.mapID}`, selectMap(setup.mapID));
      } catch (error) {
        failSetup(`스테이지 초기화 실패 — ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
      }
    };

    const applyCreateResult = (resultCode: number, resultName: string, teamFlag: number, entityID: number) => {
      const pending = pendingCreatesRef.current.shift();
      if (!pending) return;

      if (resultCode !== COMMAND_RESULT_CODE.OK) {
        const squadName = pending.kind === "ally" ? `아군 스쿼드 '${pending.squad.name}'` : `적군 ${pending.squad.unitType} 스쿼드`;
        const detail = resultCode === COMMAND_RESULT_CODE.INVALID_PAYLOAD ? " (생성 좌표가 맵 밖이거나 벽입니다)" : "";
        pushLog("error", `${squadName} 생성 실패 — ${resultName}${detail}`);
        return;
      }

      const expectedTeamFlag = pending.kind === "ally" ? TEAM_FLAG.ALLY : TEAM_FLAG.ENEMY;
      if (teamFlag !== expectedTeamFlag) {
        pushLog("error", `CREATE_SQUAD 응답 팀 불일치 — 예상 team=${expectedTeamFlag}, 실제 team=${teamFlag}`);
        return;
      }

      setupRef.current.createdCount += 1;
      if (pending.kind === "ally") {
        setupRef.current.createdAllyCount += 1;
        setAllySquads((squads) => [...squads, { ...pending.squad, squadID: entityID }]);
        pushLog("info", `아군 스쿼드 '${pending.squad.name}' → squadID ${entityID}`);
        return;
      }

      setupRef.current.createdEnemyCount += 1;
      enemySquadsRef.current = [...enemySquadsRef.current, { ...pending.squad, squadID: entityID }];
      setEnemySquads(enemySquadsRef.current);
      pushLog("info", `적군 ${pending.squad.unitType} 스쿼드 → squadID ${entityID}`);
    };

    ws.onmessage = (event) => {
      if (!(event.data instanceof ArrayBuffer)) {
        wsLog(`RECV (텍스트 ${String(event.data).length}자)`, event.data);
        return;
      }

      const packet = parseServerPacket(event.data);
      if (packet?.pktType === PKT.SC_SOLDIER_POSITIONS) {
        // 고빈도 스냅샷의 전체 fields/hex를 콘솔로 보내면 Next 개발 로그 WebSocket이 포화된다.
        const enemyUnitTypes = new Map(enemySquadsRef.current.map((squad) => [squad.squadID, squad.unitType]));
        const nextUnitTypes = new Map(soldierUnitTypesRef.current);
        const battlefieldSoldiers = packet.soldiers.map((soldier): BattlefieldSoldier => {
          const key = soldierKey(soldier);
          const enemyUnitType =
            soldier.teamFlag === TEAM_FLAG.ENEMY ? enemyUnitTypes.get(soldier.squadID) : undefined;
          const unitType =
            enemyUnitType ?? nextUnitTypes.get(key) ?? unitTypeFromInitialHP(soldier.hp) ?? "WARRIOR";

          nextUnitTypes.set(key, unitType);
          return { ...soldier, unitType };
        });

        soldierUnitTypesRef.current = nextUnitTypes;
        setSoldiers(battlefieldSoldiers);
        return;
      }

      const packetDump = dump(event.data);
      wsLog(`RECV (${event.data.byteLength}바이트)`, packetDump);

      if (!packet) {
        pushLog(
          "error",
          `RECV — 지원하는 서버 패킷 구조와 맞지 않아 무시 (type=${packetDump.pktType ?? "없음"}, declared=${packetDump.pktLen ?? "없음"}, actual=${packetDump.byteLength})`,
        );
        return;
      }

      switch (packet.pktType) {
        case PKT.SC_WELCOME: {
          setServerProtocolVersion(packet.protocolVersion);
          if (packet.protocolVersion !== PROTOCOL_VERSION) {
            protocolReadyRef.current = false;
            setProtocolReady(false);
            pushLog(
              "error",
              `프로토콜 버전 불일치 — 클라이언트 V${PROTOCOL_VERSION}, 서버 V${packet.protocolVersion}; 명령을 보내지 않고 연결 종료`,
            );
            ws.close(4002, "protocol version mismatch");
            break;
          }

          protocolReadyRef.current = true;
          setProtocolReady(true);
          setSessionID(packet.sessionID);
          sessionIDRef.current = packet.sessionID;
          pushLog(
            "info",
            `WELCOME — V${packet.protocolVersion}, session=${packet.sessionID}, tick=${packet.serverTickMs}ms, reconnectTimeout=${packet.reconnectTimeoutMs}ms`,
          );

          const resumeTarget = resumeSessionIDRef.current;
          if (resumeTarget !== null && resumeTarget === packet.sessionID) {
            resumeSessionIDRef.current = null;
            setupRef.current.phase = "ready";
            setSetupPhase("ready");
            pushLog("info", `세션 #${resumeTarget} 복구 — SELECT_MAP과 CREATE_SQUAD를 다시 보내지 않습니다`);
            break;
          }

          if (setupRef.current.phase !== "idle") break;

          if (resumeTarget !== null) {
            setupRef.current.phase = "resuming";
            setSetupPhase("resuming");
            sendSetupPacket(`RESUME_SESSION #${resumeTarget}`, resumeSession(resumeTarget));
            break;
          }

          beginStageSetup();
          break;
        }

        case PKT.SC_COMMAND_RESULT: {
          const resultName = COMMAND_RESULT_NAME[packet.resultCode] ?? `UNKNOWN(${packet.resultCode})`;
          const commandName = PKT_NAME[packet.requestPacketType] ?? `TYPE_${packet.requestPacketType}`;
          const ok = packet.resultCode === COMMAND_RESULT_CODE.OK;
          pushLog(ok ? "recv" : "error", `${commandName} 결과 — ${resultName}, team=${packet.teamFlag}, entity=${packet.entityID}`);

          const setup = setupRef.current;
          switch (packet.requestPacketType) {
            case PKT.CS_RESUME_SESSION:
              if (setup.phase !== "resuming" || ok) break;
              resumeSessionIDRef.current = null;
              setup.phase = "idle";
              pushLog("warn", `세션 복구 실패(${resultName}) — 새 세션으로 스테이지를 다시 준비합니다`);
              beginStageSetup();
              break;

            case PKT.CS_SELECT_MAP:
              if (setup.phase !== "selectingMap") break;
              if (!ok) {
                failSetup(`맵 선택 실패 — ${resultName}. 서버에 map=${setup.mapID}이 있는지, 이미 START_STAGE가 끝난 세션이 아닌지 확인하세요.`);
                break;
              }
              setup.mapCommandAccepted = true;
              // WELCOME 직후 기본 MAP_INFO를 SELECT_MAP 결과로 재사용하지 않는다.
              setup.confirmedMapID = null;
              maybeStartStage();
              break;

            case PKT.CS_START_STAGE:
              if (setup.phase !== "startingStage") break;
              if (!ok) {
                failSetup(`START_STAGE 실패 — ${resultName}. 이미 시작했거나 병력이 남아 있는 세션입니다.`);
                break;
              }
              setup.phase = "creatingSquads";
              setSetupPhase("creatingSquads");
              pushLog("info", `START_STAGE 성공 — map=${packet.entityID} 확정, 부대 ${setup.queue.length}개 생성 시작`);
              sendNextSquad();
              break;

            case PKT.CS_CREATE_SQUAD:
              applyCreateResult(packet.resultCode, resultName, packet.teamFlag, packet.entityID);
              if (setup.phase === "creatingSquads") sendNextSquad();
              break;
          }
          break;
        }

        case PKT.SC_MAP_INFO: {
          pushLog(
            "recv",
            `MAP_INFO — map=${packet.mapID}, version=${packet.mapVersion}, world=${packet.worldWidth}×${packet.worldHeight}, cell=${packet.gridCellSize}`,
          );
          setMapInfo({
            mapID: packet.mapID,
            mapVersion: packet.mapVersion,
            gridCellSize: packet.gridCellSize,
          });

          const setup = setupRef.current;
          if (setup.phase !== "selectingMap" || !setup.mapCommandAccepted || packet.mapID !== setup.mapID) break;

          const metadataMatches =
            packet.mapVersion === EXPECTED_MAP.version &&
            packet.worldWidth === EXPECTED_MAP.width &&
            packet.worldHeight === EXPECTED_MAP.height &&
            packet.gridCellSize === EXPECTED_MAP.gridCellSize;
          if (!metadataMatches) {
            failSetup(
              `MAP_INFO 불일치 — map=${packet.mapID}, version=${packet.mapVersion}, world=${packet.worldWidth}×${packet.worldHeight}, cell=${packet.gridCellSize}`,
            );
            break;
          }

          setup.confirmedMapID = packet.mapID;
          maybeStartStage();
          break;
        }

        case PKT.SC_STAGE_STATE: {
          const status = {
            stageState: packet.stageState,
            aliveAllyCount: packet.aliveAllyCount,
            aliveEnemyCount: packet.aliveEnemyCount,
          };
          setStageStatus(status);
          pushLog(
            "recv",
            `STAGE — ${STAGE_STATE_NAME[packet.stageState] ?? `UNKNOWN(${packet.stageState})`}, ally=${packet.aliveAllyCount}, enemy=${packet.aliveEnemyCount}`,
          );
          break;
        }
      }
    };

    ws.onerror = (event) => {
      console.warn(
        `[WS] ERROR (${elapsed()}) — 브라우저는 보안상 상세 사유를 주지 않습니다. 바로 뒤에 오는 CLOSE 코드를 보세요.`,
        event,
      );
      pushLog("error", `ERROR (${elapsed()}) — 사유는 뒤따르는 CLOSE 코드로 확인`);
    };

    ws.onclose = (event) => {
      const reason = CLOSE_REASON[event.code] ?? "알 수 없는 코드";
      console.warn(
        `[WS] CLOSE (${elapsed()}) code=${event.code} (${reason}) reason="${event.reason || "(없음)"}" wasClean=${event.wasClean}`,
        event,
      );
      pushLog("warn", `CLOSE (${elapsed()}) code=${event.code} — ${reason}`);

      const setupPhaseAtClose = setupRef.current.phase;
      const pendingResumeTarget = resumeSessionIDRef.current;
      const resumeTarget = pendingResumeTarget ?? (setupPhaseAtClose === "ready" ? sessionIDRef.current : null);
      const resumeInProgress =
        setupPhaseAtClose === "resuming" || (setupPhaseAtClose === "idle" && pendingResumeTarget !== null);
      const resumable =
        event.code !== 1000 && resumeTarget !== null && (setupPhaseAtClose === "ready" || resumeInProgress);
      resumeSessionIDRef.current = resumable ? resumeTarget : null;

      if (resumable) {
        pushLog("info", `세션 #${resumeTarget}을 기억해 두었습니다. 다시 접속하면 이어서 진행합니다.`);
      } else {
        soldierUnitTypesRef.current.clear();
        setAllySquads([]);
        enemySquadsRef.current = [];
        setEnemySquads([]);
      }

      wsRef.current = null;
      setConnectionClosed(true);
      setWsState(SOCKET_STATE.CLOSED);
      protocolReadyRef.current = false;
      setProtocolReady(false);
      setServerProtocolVersion(undefined);
      setSessionID(undefined);
      sessionIDRef.current = null;
      setMapInfo(undefined);
      setupRef.current = createIdleStageSetup();
      setSetupPhase("idle");
      pendingCreatesRef.current = [];
      setSoldiers([]);
      setStageStatus(undefined);
      onDisconnected();
    };
  }, [getLatestDeployment, onDisconnected, pushLog, stage, usedFallback, wsLog, wsUrl]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (!DEFAULT_WS_URL || !stage) return;

    const timeoutID = window.setTimeout(() => connectRef.current(), 0);
    return () => window.clearTimeout(timeoutID);
  }, [stage]);

  useEffect(() => {
    const intervalID = window.setInterval(() => {
      setWsState(wsRef.current?.readyState ?? SOCKET_STATE.CLOSED);
    }, 200);

    return () => window.clearInterval(intervalID);
  }, []);

  useEffect(() => {
    return () => wsRef.current?.close();
  }, []);

  const disconnect = useCallback(() => {
    if (!wsRef.current) {
      wsLog("해제 요청 무시 — 열린 소켓이 없음");
      return;
    }

    wsLog("close() 호출 — 종료 대기");
    wsRef.current.close(1000, "client disconnect");
  }, [wsLog]);

  const finishStage = useCallback(() => {
    wsRef.current?.close(1000, "stage finished");
  }, []);

  const sendPacket = useCallback(
    (buffer: ArrayBuffer) => {
      const ws = wsRef.current;
      if (ws?.readyState !== SOCKET_STATE.OPEN) {
        wsLog("SEND 실패 — 소켓이 열려 있지 않음");
        return false;
      }
      if (!protocolReadyRef.current) {
        pushLog("error", "SEND 실패 — 서버 WELCOME 확인 전에는 명령을 보낼 수 없습니다");
        return false;
      }

      wsLog("SEND", dump(buffer));
      ws.send(buffer);
      return true;
    },
    [pushLog, wsLog],
  );

  const sendCommand: SendCommand = useCallback(
    (createPacket) => {
      try {
        return sendPacket(createPacket());
      } catch (error) {
        const message = error instanceof Error ? error.message : "패킷 생성 중 알 수 없는 오류가 발생했습니다.";
        pushLog("error", `SEND 실패 — ${message}`);
        return false;
      }
    },
    [pushLog, sendPacket],
  );

  const connected = wsState === SOCKET_STATE.OPEN;
  const connectionState = CONNECTION_STATES[wsState] ?? "closed";
  const commandReady = connected && protocolReady && setupPhase === "ready";
  const networkReady =
    protocolReady &&
    setupPhase === "ready" &&
    stageStatus?.stageState === STAGE_STATE.RUNNING &&
    stageStatus.aliveAllyCount > 0 &&
    stageStatus.aliveEnemyCount > 0 &&
    soldiers.length > 0;

  const enemySquadsReady = useMemo(() => {
    const expected = getExpectedEnemySquadCount(stage);
    return expected > 0 && enemySquads.length === expected;
  }, [enemySquads.length, stage]);

  return {
    wsUrl,
    setWsUrl,
    connectionState,
    connectionClosed,
    protocolReady,
    serverProtocolVersion,
    sessionID,
    mapInfo,
    setupPhase,
    networkReady,
    commandReady,
    soldiers,
    stageStatus,
    allySquads,
    enemySquads,
    enemySquadsReady,
    connect,
    disconnect,
    finishStage,
    sendCommand,
    pushLog,
  };
}
