"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { hasSeenManual } from "../(lib)/manual";
import styles from "./NicknameClient.module.css";

const COMMANDER_NAME_STORAGE_KEY = "nickname";
const COMMANDER_NAME_LABEL = "지휘관 이름";

export default function NicknameClient() {
  const router = useRouter();
  const commanderNameRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const savedCommanderName = localStorage.getItem(COMMANDER_NAME_STORAGE_KEY);

    if (savedCommanderName) {
      router.replace(hasSeenManual() ? "/main" : "/manual");
    }
  }, [router]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const commanderName = commanderNameRef.current?.value.trim() ?? "";

    if (!commanderName) {
      setError(`${COMMANDER_NAME_LABEL}을 입력해 주세요.`);
      commanderNameRef.current?.focus();
      return;
    }

    localStorage.setItem(COMMANDER_NAME_STORAGE_KEY, commanderName);
    router.push("/manual");
  };

  return (
    <main className={styles.screen}>
      <Image
        src="/bg/battlefield.webp"
        fill
        sizes="100vw"
        preload
        className={styles.background}
        alt=""
      />
      <div className={styles.atmosphere} aria-hidden="true" />

      <section className={styles.loginRail} aria-labelledby="commander-name-title">
        <h1 id="commander-name-title" className={styles.srOnly}>
          {COMMANDER_NAME_LABEL} 입력
        </h1>

        {error && (
          <p id="commander-name-error" role="alert" className={styles.error}>
            {error}
          </p>
        )}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <span className={styles.fieldChrome} aria-hidden="true">
              <Image
                src="/ui/pack/panel-slim-left.webp"
                alt=""
                width={56}
                height={72}
                draggable={false}
                unoptimized
                className={styles.fieldCap}
              />
              <span className={styles.fieldMiddle}>
                <Image
                  src="/ui/pack/panel-slim-center.webp"
                  alt=""
                  fill
                  sizes="(max-width: 640px) 45vw, 22rem"
                  draggable={false}
                  unoptimized
                  className={styles.fieldMiddleArt}
                />
              </span>
              <Image
                src="/ui/pack/panel-slim-right.webp"
                alt=""
                width={56}
                height={72}
                draggable={false}
                unoptimized
                className={styles.fieldCap}
              />
            </span>

            <input
              ref={commanderNameRef}
              id="commander-name"
              name="commanderName"
              type="text"
              maxLength={16}
              autoComplete="nickname"
              placeholder={`${COMMANDER_NAME_LABEL} 입력`}
              aria-label={COMMANDER_NAME_LABEL}
              aria-describedby={error ? "commander-name-error" : undefined}
              aria-invalid={Boolean(error)}
              onChange={() => error && setError("")}
              className={styles.input}
            />
            <span className={styles.fieldAccent} aria-hidden="true">
              <Image
                src="/ui/pack/accent-blue.webp"
                alt=""
                fill
                sizes="16rem"
                draggable={false}
                unoptimized
                className={styles.fieldAccentArt}
              />
            </span>
          </div>

          <button type="submit" className={styles.submitButton}>
            <Image
              src="/ui/pack/status-center.webp"
              alt=""
              fill
              sizes="(max-width: 640px) 136px, 160px"
              draggable={false}
              unoptimized
              className={styles.buttonArt}
            />
            <span className={styles.buttonContent}>
              <span>진입하기</span>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                <path d="M14 5h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-4" />
                <path d="m10 8 4 4-4 4M14 12H4" />
              </svg>
            </span>
          </button>
        </form>
      </section>
    </main>
  );
}
