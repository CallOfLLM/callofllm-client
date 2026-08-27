"use client";

import { useEffect } from "react";
import SystemScreen from "./_components/SystemScreen";

type ErrorProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

export default function Error({ error, retry }: ErrorProps) {
  useEffect(() => {
    console.error("[Call of LLM] 화면 렌더링 오류", error);
  }, [error]);

  return (
    <SystemScreen
      eyebrow="SYSTEM · INTERRUPTED"
      title="지휘 체계에 문제가 발생했습니다"
      description="일시적인 오류로 화면을 불러오지 못했습니다. 다시 시도하거나 지휘 본부로 이동해 주세요."
      iconSrc="/ui/pack/pause.webp"
      tone="red"
      role="alert"
      detail={
        error.digest ? (
          <span>
            오류 식별자: <code>{error.digest}</code>
          </span>
        ) : undefined
      }
      actions={[
        { label: "다시 시도", onClick: retry, emphasis: "primary" },
        { label: "지휘 본부로", href: "/main", emphasis: "secondary" },
      ]}
    />
  );
}
