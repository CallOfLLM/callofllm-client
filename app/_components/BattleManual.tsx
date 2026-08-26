import styles from "./BattleManual.module.css";

const COMMANDS = [
  {
    eyebrow: "MOVE",
    title: "방향과 거리로 이동",
    description: "숫자를 쓸 때는 m 또는 미터 단위를 꼭 붙입니다.",
    command: "스쿼드 1 앞으로 50미터 전진",
  },
  {
    eyebrow: "ATTACK",
    title: "가장 가까운 적 공격",
    description: "부대가 적을 추적해 교전합니다.",
    command: "스쿼드 1 공격",
  },
  {
    eyebrow: "ADVANCE & ENGAGE",
    title: "이동 중 적 발견 시 교전",
    description: "목적지로 가다가 적을 발견하면 추적 공격으로 전환합니다.",
    command: "스쿼드 1 앞으로 전진하면서 적을 발견하면 교전해",
  },
  {
    eyebrow: "FIRE ON THE MOVE",
    title: "이동하며 사거리 공격",
    description: "사거리 안의 적만 공격하며 목적지로 계속 이동합니다.",
    command: "스쿼드 1 오른쪽으로 50미터 이동하며 사거리 안의 적만 공격해",
  },
  {
    eyebrow: "STOP",
    title: "현재 행동 정지",
    description: "채팅 기록을 지워도 이미 실행한 명령은 취소되지 않습니다.",
    command: "스쿼드 1 정지",
  },
] as const;

const DIRECTIONS = [
  { label: "앞 / 전진", description: "적진 쪽으로 이동" },
  { label: "뒤 / 후퇴", description: "아군 진영 쪽으로 이동" },
  { label: "왼쪽 · 오른쪽", description: "아군 지휘관 시점 기준" },
  { label: "거리", description: "10m, 50미터처럼 단위까지 입력" },
] as const;

type BattleManualProps = {
  compact?: boolean;
};

export default function BattleManual({ compact = false }: BattleManualProps) {
  return (
    <div className={`${styles.manual} ${compact ? styles.compact : ""}`}>
      <section className={styles.section} aria-labelledby="manual-quick-start">
        <header className={styles.sectionHeader}>
          <span>01 · QUICK START</span>
          <h2 id="manual-quick-start">출정까지 세 단계</h2>
        </header>

        <ol className={styles.steps}>
          <li>
            <span className={styles.stepNumber}>1</span>
            <div>
              <strong>병력 충원</strong>
              <p>본부의 부대 충원에서 보병·궁수·기마병을 골드로 모집합니다.</p>
            </div>
          </li>
          <li>
            <span className={styles.stepNumber}>2</span>
            <div>
              <strong>스쿼드 편성</strong>
              <p>출정 준비에서 최대 5개 스쿼드, 스쿼드당 최대 200명을 배치하고 이름을 정합니다.</p>
            </div>
          </li>
          <li>
            <span className={styles.stepNumber}>3</span>
            <div>
              <strong>자연어로 명령</strong>
              <p>작전 시작 후 화면 아래 입력창에서 부대 이름과 행동을 함께 입력합니다.</p>
            </div>
          </li>
        </ol>
      </section>

      <aside className={styles.coreRule} aria-label="핵심 지휘 규칙">
        <span>CORE RULE</span>
        <div>
          <strong>한 번에 한 스쿼드, 한 가지 행동</strong>
          <p>
            스쿼드가 둘 이상이면 “모두” 대신 정확한 부대 이름을 사용하세요. AI가 대상을 되물으면 편성한
            이름으로 답하면 됩니다.
          </p>
        </div>
      </aside>

      <section className={styles.section} aria-labelledby="manual-commands">
        <header className={styles.sectionHeader}>
          <span>02 · COMMAND</span>
          <h2 id="manual-commands">바로 쓸 수 있는 명령</h2>
        </header>

        <div className={styles.commandGrid}>
          {COMMANDS.map((item) => (
            <article key={item.eyebrow} className={styles.commandCard}>
              <span>{item.eyebrow}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <code>{item.command}</code>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.splitSection} aria-label="방향과 화면 조작">
        <article className={styles.section}>
          <header className={styles.sectionHeader}>
            <span>03 · DIRECTION</span>
            <h2>방향과 거리</h2>
          </header>
          <dl className={styles.directionList}>
            {DIRECTIONS.map((direction) => (
              <div key={direction.label}>
                <dt>{direction.label}</dt>
                <dd>{direction.description}</dd>
              </div>
            ))}
          </dl>
          <p className={styles.caution}>X/Y 좌표나 단위 없는 숫자 대신 방향과 미터 거리로 명령하세요.</p>
        </article>

        <article className={styles.section}>
          <header className={styles.sectionHeader}>
            <span>04 · CAMERA</span>
            <h2>전장 화면 조작</h2>
          </header>
          <ul className={styles.controlList}>
            <li>
              <kbd>좌클릭 드래그</kbd>
              <span>시점 회전</span>
            </li>
            <li>
              <kbd>우클릭 드래그</kbd>
              <span>화면 이동</span>
            </li>
            <li>
              <kbd>마우스 휠</kbd>
              <span>확대·축소</span>
            </li>
            <li>
              <kbd>카메라 버튼</kbd>
              <span>선택한 스쿼드 추적·해제</span>
            </li>
          </ul>
        </article>
      </section>

      <section className={styles.section} aria-labelledby="manual-battle-flow">
        <header className={styles.sectionHeader}>
          <span>05 · BATTLE FLOW</span>
          <h2 id="manual-battle-flow">전투 중 알아둘 점</h2>
        </header>
        <ul className={styles.notes}>
          <li>
            <strong>첫 명령 도움말</strong>
            <span>작전 시작 후 10초 동안 아무 입력도 없으면 실제 부대 이름을 넣은 예시가 한 번 표시됩니다.</span>
          </li>
          <li>
            <strong>AI의 확인 질문</strong>
            <span>대상이나 거리가 모호하면 AI가 되묻습니다. 필요한 정보만 이어서 입력하세요.</span>
          </li>
          <li>
            <strong>고급 명령</strong>
            <span>개별 병사 편입과 특정 적 집중 공격도 지원하지만, 식별 번호가 필요하면 AI가 되물을 수 있습니다.</span>
          </li>
          <li>
            <strong>승리와 패배</strong>
            <span>적군을 전멸시키면 승리하고, 아군이 전멸하면 패배합니다.</span>
          </li>
          <li>
            <strong>진행과 보상</strong>
            <span>첫 클리어에만 골드가 지급되고 다음 스테이지가 열립니다.</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
