"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Box, OrbitControls, Plane } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import { Group } from "three";
import { SquadType } from "./(lib)/_type";

const RED_POS = { posX: 0, posY: 0 };
const MOVE_SPEED = 2; // units per second

function createShieldWall(center: { posX: number; posY: number }, distance = 2): SquadType[] {
  const wall: SquadType[] = [];
  for (let dx = -distance; dx <= distance; dx++) {
    for (let dy = -distance; dy <= distance; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === distance) {
        wall.push({ posX: center.posX + dx, posY: center.posY + dy, action: "idle" });
      }
    }
  }
  return wall;
}

function Units({ squad, target, onArrive }: { squad: SquadType[]; target: { x: number; z: number } | null; onArrive: () => void }) {
  const groupRef = useRef<Group>(null);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group || !target) return;

    const dx = target.x - group.position.x;
    const dz = target.z - group.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.05) {
      group.position.set(target.x, 0, target.z);
      onArrive();
      return;
    }

    const step = Math.min(MOVE_SPEED * delta, dist);
    group.position.x += (dx / dist) * step;
    group.position.z += (dz / dist) * step;
  });

  return (
    <group ref={groupRef}>
      <Box position={[RED_POS.posX, 0.5, RED_POS.posY]}>
        <meshStandardMaterial color="red" />
      </Box>

      {squad.map((unit, i) => (
        <Box key={i} position={[unit.posX, 0.5, unit.posY]}>
          <meshStandardMaterial color="green" />
        </Box>
      ))}
    </group>
  );
}

export default function Home() {
  const [squad, setSquad] = useState<SquadType[]>(() => createShieldWall(RED_POS));
  const [prompts, setPropmpt] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [target, setTarget] = useState<{ x: number; z: number } | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [prompts]);

  const setSquadAction = (action: SquadType["action"]) => {
    setSquad((prev) => prev.map((unit) => ({ ...unit, action })));
  };

  const sendPrompt = async () => {
    const text = prompt.trim();
    if (!text) return;
    setPropmpt((prev) => [...prev, text]);
    setPrompt("");

    try {
      const res = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      if (!res.ok) {
        console.error("Command request failed:", await res.text());
        return;
      }

      const command: { action: string; posx: number; posy: number; message: string } = await res.json();
      setPropmpt((prev) => [...prev, command.message]);
      if (command.action === "none") return;
      setTarget({ x: command.posx, z: command.posy });
      setSquadAction("walk");
    } catch (err) {
      console.error("Failed to send prompt:", err);
    }
  };

  return (
    <div className="w-full h-dvh">
      <Canvas camera={{ position: [8, 8, 8] }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 10, 5]} />

        <Plane
          args={[640, 320]}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={(e) => {
            e.stopPropagation();
            setTarget({ x: e.point.x, z: e.point.z });
            setSquadAction("walk");
          }}
        >
          <meshStandardMaterial color="lightgray" />
        </Plane>

        <Units
          squad={squad}
          target={target}
          onArrive={() => {
            setTarget(null);
            setSquadAction("idle");
          }}
        />

        <OrbitControls />
      </Canvas>

      <div className="fixed top-0 left-0 w-full flex justify-start gap-5 items-center p-3">
        <button className="w-30 h-15 min-w-30 min-h-15 bg-black rounded-md text-white text-base font-bold border-gray-400 border-2">SUMMON</button>
      </div>

      <div className="fixed bottom-22 left-0 w-120 h-130 flex flex-col justify-end p-3">
        <div className="flex flex-col gap-2 overflow-y-auto rounded-md bg-black/30 p-3">
          {prompts.map((message, i) => (
            <div key={i} className="self-start max-w-full wrap-break-word rounded-md bg-white/80 px-3 py-2 text-sm text-black">
              {message}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </div>

      <div className="fixed bottom-0 left-0 w-full flex justify-start gap-3 items-center h-24 p-3">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) sendPrompt();
          }}
          className="size-full bg-gray-500/40 rounded-md px-2"
        />
        <button onClick={sendPrompt} className="w-20 h-full bg-black text-white font-bold rounded-md">
          SEND
        </button>
      </div>
    </div>
  );
}
