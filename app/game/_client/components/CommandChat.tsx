import Image from "next/image";
import { useEffect, useRef, type FormEvent } from "react";
import UiPanelFrame from "../../../_components/UiPanelFrame";
import type { ChatMessage } from "../hooks/useCommandChat";
import styles from "./GameHud.module.css";

const ROLE_LABEL = {
  user: "나",
  assistant: "AI",
  error: "오류",
} as const;

const ROLE_CLASS = {
  user: styles.roleUser,
  assistant: styles.roleAssistant,
  error: styles.roleError,
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
    <section aria-label="AI 채팅" className={styles.chat}>
      <header className={styles.chatHeader}>
        <span>AI COMMAND LOG · {messages.length}</span>
        <button type="button" onClick={onClear} className={styles.clearButton}>
          기록 지우기
        </button>
      </header>

      <div className={styles.messages}>
        {messages.length === 0 ? (
          <div className={styles.emptyMessage}>아래 입력창에서 AI 지휘관에게 명령을 입력해 주세요.</div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={styles.message}>
              <span className={styles.messageTime}>{message.time}</span>
              <strong className={`${styles.messageRole} ${ROLE_CLASS[message.role]}`}>
                {ROLE_LABEL[message.role]}
              </strong>
              <span className={styles.messageText}>{message.text}</span>
            </div>
          ))
        )}
        {pending && <div className={styles.pendingMessage}>AI가 응답을 생성하고 있습니다…</div>}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSubmit} className={styles.chatForm}>
        <label htmlFor="ai-command" className="sr-only">
          AI 명령 입력
        </label>
        <div className={styles.commandField}>
          <UiPanelFrame
            variant="slim"
            className={styles.commandFieldFrame}
            sizes="(max-width: 700px) calc(100vw - 104px), calc(100vw - 132px)"
          />
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
            className={styles.commandInput}
          />
        </div>
        <button type="submit" disabled={pending || !input.trim() || !canCommand} className={styles.sendButton}>
          <Image
            src="/ui/pack/status-center.webp"
            alt=""
            fill
            sizes="(max-width: 700px) 91px, 112px"
            draggable={false}
            unoptimized
            className={styles.buttonFrame}
          />
          <span>{pending ? "전송 중…" : "명령 전송"}</span>
        </button>
      </form>
    </section>
  );
}
