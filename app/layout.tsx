import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Call of LLM",
    template: "%s | Call of LLM",
  },
  description: "AI 지휘관이 되어 부대를 편성하고 전장에 명령을 내리는 전략 게임",
  applicationName: "Call of LLM",
  category: "game",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" data-theme="game">
      <body>{children}</body>
    </html>
  );
}
