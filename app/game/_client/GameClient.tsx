"use client";

import { useCallback, useEffect, useState } from "react";
import { squadSoldierCount } from "../../(lib)/squadfuncs";
import CommandChat from "./components/CommandChat";
import ConnectionBar from "./components/ConnectionBar";
import GameScene from "./components/GameScene";
import ObjectivePanel from "./components/ObjectivePanel";
import SoldierDebugPanel from "./components/SoldierDebugPanel";
import SquadPanel from "./components/SquadPanel";
import BriefingOverlay from "./components/overlays/BriefingOverlay";
import LoadingOverlay from "./components/overlays/LoadingOverlay";
import ResultOverlay from "./components/overlays/ResultOverlay";
import { useCommandChat } from "./hooks/useCommandChat";
import { useEnemyCommander } from "./hooks/useEnemyCommander";
import { useGameSession } from "./hooks/useGameSession";
import { useObjective, type Outcome } from "./hooks/useObjective";
import { useSelectedStage } from "./hooks/useSelectedStage";
import { SETUP_PHASE_LABEL } from "./lib/stageSetup";

type GamePhase = "loading" | "briefing" | "playing" | "finished";

function getGamePhase(outcome: Outcome, started: boolean, ready: boolean): GamePhase {
  if (outcome !== "playing") return "finished";
  if (started) return "playing";
  return ready ? "briefing" : "loading";
}

export default function GameClient() {
  const {
    stage,
    deployment,
    usedFallback,
    clearedBefore,
    nextStageHref,
    getLatestDeployment,
    persistStageClear,
  } = useSelectedStage();
  const [assetsReady, setAssetsReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [followSquadID, setFollowSquadID] = useState<number | null>(null);

  const clearFollowSquad = useCallback(() => setFollowSquadID(null), []);
  const toggleFollowSquad = useCallback((squadID: number) => {
    setFollowSquadID((current) => (current === squadID ? null : squadID));
  }, []);

  const session = useGameSession({
    stage,
    getLatestDeployment,
    usedFallback,
    onDisconnected: clearFollowSquad,
  });

  const mission = useObjective(
    started ? (stage?.objective ?? null) : null,
    session.soldiers,
    session.stageStatus?.stageState,
  );

  const phase = getGamePhase(mission.outcome, started, session.networkReady && assetsReady);
  const playing = phase === "playing";
  const finished = phase === "finished";
  const canCommand = session.commandReady && playing;

  useEnemyCommander({
    enabled: canCommand && session.enemySquadsReady,
    serverProtocolVersion: session.serverProtocolVersion,
    soldiers: session.soldiers,
    enemySquads: session.enemySquads,
    stageStatus: session.stageStatus,
    sendCommand: session.sendCommand,
    pushLog: session.pushLog,
  });

  const chat = useCommandChat({
    playing,
    finished,
    commandReady: session.commandReady,
    serverProtocolVersion: session.serverProtocolVersion,
    stageStatus: session.stageStatus,
    currentGoal: mission.step?.label ?? null,
    allySquads: session.allySquads,
    soldiers: session.soldiers,
    allowedCommands: stage?.allowedCommands,
    sendCommand: session.sendCommand,
    notifyCommand: mission.notifyCommand,
    pushLog: session.pushLog,
  });

  const finishStage = session.finishStage;

  useEffect(() => {
    if (!finished || !stage) return;

    finishStage();
    if (mission.outcome === "clear") persistStageClear();
  }, [finishStage, finished, mission.outcome, persistStageClear, stage]);

  const handleSceneReady = useCallback(() => setAssetsReady(true), []);

  const displaySquads =
    session.allySquads.length > 0
      ? session.allySquads
      : (deployment?.squads ?? [])
          .filter((squad) => squadSoldierCount(squad) > 0)
          .map((squad) => ({ ...squad, squadID: null }));

  const awardedGold =
    mission.outcome === "clear" &&
    stage &&
    stage.id > clearedBefore
      ? stage.rewardGold
      : 0;

  return (
    <div className="h-dvh w-full">
      <GameScene
        soldiers={session.soldiers}
        followSquadID={followSquadID}
        condition={mission.step?.condition ?? null}
        stepOrigin={mission.stepOrigin}
        fail={stage?.objective.fail}
        onReady={handleSceneReady}
      />

      <ConnectionBar
        wsUrl={session.wsUrl}
        connectionState={session.connectionState}
        protocolReady={session.protocolReady}
        serverProtocolVersion={session.serverProtocolVersion}
        sessionID={session.sessionID}
        mapInfo={session.mapInfo}
        setupLabel={SETUP_PHASE_LABEL[session.setupPhase]}
        onUrlChange={session.setWsUrl}
        onConnect={session.connect}
        onDisconnect={session.disconnect}
      />

      {playing && stage && mission.step && (
        <ObjectivePanel
          stage={stage}
          step={mission.step}
          stepIndex={mission.stepIndex}
          stepCount={mission.stepCount}
          progressRatio={mission.progressRatio}
          progressLabel={mission.progressLabel}
          onHintSelect={chat.setChatInput}
        />
      )}

      <SquadPanel
        squads={displaySquads}
        followSquadID={followSquadID}
        onFollowSquadToggle={toggleFollowSquad}
      />
      <SoldierDebugPanel soldiers={session.soldiers} />

      <CommandChat
        messages={chat.chatMessages}
        pending={chat.chatPending}
        input={chat.chatInput}
        canCommand={canCommand}
        playing={playing}
        finished={finished}
        onInputChange={chat.setChatInput}
        onSend={chat.sendChatMessage}
        onClear={chat.clearChat}
      />

      {phase === "loading" && (
        <LoadingOverlay
          networkReady={session.networkReady}
          assetsReady={assetsReady}
          disconnected={session.connectionClosed}
          setupLabel={SETUP_PHASE_LABEL[session.setupPhase]}
          setupFailed={session.setupPhase === "failed"}
        />
      )}

      {phase === "briefing" && stage && (
        <BriefingOverlay stage={stage} squads={displaySquads} onStart={() => setStarted(true)} />
      )}

      {phase === "finished" && stage && (
        <ResultOverlay
          clear={mission.outcome === "clear"}
          reason={mission.reason}
          stageID={stage.id}
          stageTitle={stage.title}
          awardedGold={awardedGold}
          nextHref={mission.outcome === "clear" ? nextStageHref : null}
        />
      )}
    </div>
  );
}
