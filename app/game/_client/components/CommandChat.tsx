import { useEffect, useRef, type FormEvent } from "react";
import type { ChatMessage } from "../hooks/useCommandChat";

const ROLE_LABEL = {
  user: "나",
  assistant: "AI",
  error: "오류",
} as const;

const ROLE_COLOR = {
  user: "text-sky-300",
  assistant: "text-emerald-300",
  error: "text-red-400",
} as const;

type Props = {
  messages: ChatMessage[];
  pending: boolean;
  input: string;
  canCommand: boolean;
  playing: boolean;
  finished: boolean;
  onInputChange: (input: string) => void;
  onSend: () => Promise<void>;
  onClear: () => void;
};

function inputPlaceholder({ finished, playing, canCommand }: Pick<Props, "finished" | "playing" | "canCommand">) {
  if (finished) return "스테이지가 끝났습니다";
  if (!playing) return "작전을 시작하면 명령할 수 있습니다";
  if (!canCommand) return "게임 서버 접속 후 AI 명령을 사용할 수 있습니다";
  return "AI에게 명령을 입력하세요";
}

export default function CommandChat({
  messages,
  pending,
  input,
  canCommand,
  playing,
  finished,
  onInputChange,
  onSend,
  onClear,
}: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSend();
  };

  return (
    <section
      aria-label="AI 채팅"
      className="fixed inset-x-0 bottom-0 z-20 flex h-72 flex-col border-t border-white/15 bg-slate-950/90 text-white backdrop-blur"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs font-bold">
        <span>AI 채팅 ({messages.length})</span>
        <button type="button" onClick={onClear} className="rounded bg-white/15 px-2 py-1 font-normal hover:bg-white/25">
          지우기
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 text-sm leading-relaxed">
        {messages.length === 0 ? (
          <div className="text-white/40">아래 입력창에서 AI에게 명령을 입력해 주세요</div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="mb-2 whitespace-pre-wrap break-words">
              <span className="text-xs text-white/35">{message.time} </span>
              <strong className={`mr-1 text-xs ${ROLE_COLOR[message.role]}`}>{ROLE_LABEL[message.role]}</strong>
              <span className="text-white/85">{message.text}</span>
            </div>
          ))
        )}
        {pending && <div className="text-sm text-emerald-300/70">AI가 응답을 생성하고 있습니다…</div>}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-white/10 p-3">
        <label htmlFor="ai-command" className="sr-only">
          AI 명령 입력
        </label>
        <input
          id="ai-command"
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
          }}
          maxLength={4000}
          autoComplete="off"
          placeholder={inputPlaceholder({ finished, playing, canCommand })}
          className="h-12 min-w-0 flex-1 rounded-lg border border-white/15 bg-white/10 px-4 text-white outline-none transition placeholder:text-white/35 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
        />
        <button
          type="submit"
          disabled={pending || !input.trim() || !canCommand}
          className="h-12 min-w-24 rounded-lg bg-sky-500 px-5 font-bold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "전송 중…" : "전송"}
        </button>
      </form>
    </section>
  );
}
