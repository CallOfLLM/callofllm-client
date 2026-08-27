import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Video | Call of LLM",
  description: "Watch the Call of LLM video.",
};

export default function VideoPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-black px-4 py-8">
      <video
        className="max-h-[calc(100dvh-4rem)] w-full max-w-6xl rounded-xl bg-black shadow-2xl"
        controls
        playsInline
        preload="metadata"
        aria-label="Call of LLM video"
      >
        <source src="/callofllm_video.mp4" type="video/mp4" />
        브라우저에서 영상을 재생할 수 없습니다. 영상 파일을
        <a href="/callofllm_video.mp4"> 직접 열어 보세요.</a>
      </video>
    </main>
  );
}
