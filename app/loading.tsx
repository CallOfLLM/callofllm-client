import SystemScreen from "./_components/SystemScreen";

export default function Loading() {
  return (
    <SystemScreen
      eyebrow="FIELD DEPLOYMENT · SYNC"
      title="전장을 준비하고 있습니다"
      description="지휘 체계와 전장 정보를 불러오는 중입니다. 잠시만 기다려 주세요."
      iconSrc="/ui/pack/swords.webp"
      role="status"
      busy
    />
  );
}
