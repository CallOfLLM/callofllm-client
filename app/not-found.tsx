import SystemScreen from "./_components/SystemScreen";

export default function NotFound() {
  return (
    <SystemScreen
      eyebrow="SYSTEM · 404"
      title="작전 구역을 찾을 수 없습니다"
      description="요청한 경로가 존재하지 않거나 이동되었습니다. 지휘 본부에서 작전을 다시 선택해 주세요."
      iconSrc="/ui/pack/shield.webp"
      actions={[
        { label: "지휘 본부로", href: "/main", emphasis: "primary" },
        { label: "로그인 화면", href: "/", emphasis: "secondary" },
      ]}
    />
  );
}
