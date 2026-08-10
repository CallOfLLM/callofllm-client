export type GameLogLevel = "info" | "send" | "recv" | "warn" | "error";
export type GameLogger = (level: GameLogLevel, message: string) => void;

/** 복구 가능한 통신 오류는 Next 개발 오버레이 대신 콘솔 경고로 남긴다. */
export const writeGameLog: GameLogger = (level, message) => {
  const line = `[GAME ${level.toUpperCase()}] ${message}`;
  if (level === "warn" || level === "error") console.warn(line);
  else console.log(line);
};

/** 콘솔에 객체 전체를 쏟지 않도록 한 줄로 줄인다. */
export function summarizeForLog(value: unknown): string {
  if (value == null) return "";
  if (typeof value !== "object") return String(value);

  const record = value as Record<string, unknown>;
  if (typeof record.name === "string" && Array.isArray(record.fields)) {
    return `${record.name} fields=[${(record.fields as number[]).join(", ")}] len=${record.pktLen}`;
  }

  try {
    return JSON.stringify(value).slice(0, 200);
  } catch {
    return "";
  }
}
