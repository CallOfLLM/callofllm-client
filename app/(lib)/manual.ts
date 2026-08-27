export const MANUAL_SEEN_STORAGE_KEY = "manual_seen_v1";

/** 이 브라우저에서 새 사용설명서를 한 번 열었는지 기록한다. */
export function markManualSeen(): void {
  localStorage.setItem(MANUAL_SEEN_STORAGE_KEY, "1");
}

export function hasSeenManual(): boolean {
  return localStorage.getItem(MANUAL_SEEN_STORAGE_KEY) === "1";
}
