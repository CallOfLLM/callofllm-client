"use client";

import { useEffect } from "react";
import { markManualSeen } from "../../(lib)/manual";

/** 설명서 화면이 실제로 열린 뒤에만 최초 열람 기록을 남긴다. */
export default function ManualSeenMarker() {
  useEffect(() => {
    markManualSeen();
  }, []);

  return null;
}
