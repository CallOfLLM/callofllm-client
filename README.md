# Call of LLM

자연어로 부대를 지휘하고, LLM이 해석한 명령을 실시간 전장에 반영하는 3D 스쿼드 전략 게임입니다.

> 🎮 **지금 플레이하기:** [https://callofllm.vercel.app](https://callofllm.vercel.app)

Call of LLM에서 플레이어는 좌표나 패킷을 직접 다루지 않습니다. “1소대를 앞으로 1000 전진시켜”, “적을 발견하면 교전해”처럼 한국어로 명령하면 OpenAI 모델이 현재 전장 상태와 대화 맥락을 읽고 실행 가능한 Protocol V15 명령으로 변환합니다. 별도의 적군 전술 AI도 같은 전장을 관찰하면서 보병·궁병·기병의 역할에 맞춰 대응합니다.

- 현재 클라이언트 프로토콜: **CLIENT_PACKET_SPEC V15**
- 현재 콘텐츠: **20개 스테이지**
- 플레이 방식: **싱글 플레이 / 실시간 자연어 지휘**
- 온라인 대전: **준비 중**
- 진행 데이터: **브라우저 localStorage 저장**

---

## 목차

- [프로젝트 소개](#프로젝트-소개)
- [핵심 특징](#핵심-특징)
- [게임 진행 흐름](#게임-진행-흐름)
- [플레이 방법](#플레이-방법)
- [자연어 명령 가이드](#자연어-명령-가이드)
- [부대·경제·성장 시스템](#부대경제성장-시스템)
- [스테이지](#스테이지)
- [전장 화면과 조작](#전장-화면과-조작)
- [시스템 아키텍처](#시스템-아키텍처)
- [Protocol V15 요약](#protocol-v15-요약)
- [기술 스택](#기술-스택)
- [로컬 실행](#로컬-실행)
- [환경 변수](#환경-변수)
- [스크립트](#스크립트)
- [라우트와 API 계약](#라우트와-api-계약)
- [프로젝트 구조](#프로젝트-구조)
- [데이터 저장과 초기화](#데이터-저장과-초기화)
- [Vercel 배포](#vercel-배포)
- [문제 해결](#문제-해결)
- [보안·개인정보·비용](#보안개인정보비용)
- [현재 구현 범위와 제한사항](#현재-구현-범위와-제한사항)
- [문서와 라이선스](#문서와-라이선스)

## 프로젝트 소개

Call of LLM은 일반적인 RTS의 버튼·단축키 중심 조작을 자연어 지휘로 바꾼 실험적인 전략 게임입니다.

플레이어가 입력한 문장은 Next.js 서버의 OpenAI Route Handler로 전달됩니다. Route Handler는 최신 병사 위치, HP, 상태, 스쿼드 이름, 현재 목표와 최근 대화를 모델에 함께 전달하고, strict JSON Schema로 검증되는 단일 게임 명령을 받습니다. 브라우저는 이 명령을 다시 검증한 뒤 little-endian 바이너리 패킷으로 직렬화하여 외부 게임 시뮬레이션 서버에 보냅니다.

전장 상태의 최종 결정권은 LLM이나 브라우저가 아니라 외부 WebSocket 게임 서버에 있습니다. 서버가 50Hz로 보내는 전체 병사 스냅샷이 렌더링, 목표 판정, 다음 AI 판단의 기준이 됩니다.

### 이 저장소가 담당하는 것

- 닉네임, 부대 관리, 충원, 시설, 스테이지 선택, 출정 편성 UI
- 자연어 명령을 게임 명령으로 변환하는 OpenAI API 어댑터
- 적군 스쿼드의 주기적 전술 판단
- Protocol V15 패킷 직렬화·역직렬화와 런타임 검증
- WebSocket 연결, 맵 선택, 스테이지 시작, 부대 생성, 세션 복구
- React Three Fiber 기반 3D 전장 렌더링
- 튜토리얼 목표, 클리어·실패, 보상과 진행도 처리
- 브라우저 localStorage 기반 싱글 플레이 데이터 저장

### 이 저장소가 담당하지 않는 것

- authoritative 전투 시뮬레이션 서버
- Protocol V15 WebSocket 서버의 배포와 운영
- 사용자 계정, 서버 저장, 데이터베이스, 클라우드 동기화
- 실제 온라인 PvP 매칭

로컬에서 전투까지 실행하려면 이 클라이언트 외에 **Protocol V15와 호환되는 외부 WebSocket 게임 서버**가 반드시 필요합니다.

## 핵심 특징

### 1. 자연어 기반 부대 지휘

한국어 명령을 이동, 공격, 정지, 집중 공격, 이동 교전 등의 구조화된 게임 명령으로 변환합니다. 스쿼드 이름과 현재 위치를 함께 전달하므로 “1소대”, “왼쪽 부대”처럼 실제 편성 맥락을 활용할 수 있습니다.

### 2. 검증 가능한 Structured Outputs

OpenAI Responses API의 strict JSON Schema 형식을 사용합니다. 모델 출력은 서버에서 패킷 스키마로 한 번 검증되고, 브라우저에서도 패킷 구조를 다시 확인한 뒤에만 게임 서버로 전송됩니다.

### 3. 전장 전체를 읽는 적군 전술 AI

적군 AI는 전투 시작 직후 한 번, 이후 10초마다 최신 전장 상태를 분석합니다.

- 보병: 전열 유지, 차단, 추적, 집중 공격
- 궁병: 후열 유지, 거리 확보, 이동 사격
- 기병: 측면 접근과 적 대열 관통
- 생존한 적 스쿼드마다 정확히 하나의 명령 생성
- <code>teamFlag=1</code> 적군 소유권을 서버와 클라이언트 양쪽에서 검증

### 4. authoritative 실시간 시뮬레이션

- 서버 simulation tick: 20ms, 50Hz
- 전체 병사 스냅샷: 20ms, 50Hz
- 브라우저는 서버가 확정한 ID, 좌표, HP, 상태, 방향만 렌더링
- 공격과 사망도 별도 이벤트가 아니라 전체 스냅샷의 HP와 상태로 표현

### 5. 3D 전장과 카메라 추적

Three.js, React Three Fiber, Drei를 사용해 GLB 지형과 병사 모델을 렌더링합니다. 자유 카메라 조작과 스쿼드별 추적 카메라를 지원하며, 서버의 스냅샷에 따라 병사 위치와 방향을 갱신합니다.

### 6. 보유 병력 편성과 성장 루프

스테이지 1~20은 모두 맵 ID 1에서 적군 보병 10명을 상대하는 소규모 전투입니다. 플레이어는 준비 화면에서 보유 병력을 최대 5개 소대로 직접 편성하며, 각 스테이지의 첫 클리어에만 10 G와 다음 스테이지 해금이 적용됩니다.

## 게임 진행 흐름

~~~mermaid
flowchart TD
    A[닉네임 설정] --> B[부대 관리]
    B --> C[부대 충원]
    B --> D[부대 설비]
    B --> E[스테이지 선택]
    C --> B
    D --> B
    E --> F[출정 준비: 보유 병력을 최대 5개 소대로 편성]
    F --> H[전장 입장]
    H --> I[WebSocket 연결과 V15 초기화]
    I --> J[작전 브리핑]
    J --> K[자연어로 실시간 지휘]
    K --> L{작전 결과}
    L -- 첫 클리어 --> M[골드 지급과 다음 스테이지 해금]
    L -- 실패 또는 재도전 --> N[다시 시도]
    M --> E
    N --> H
~~~

## 플레이 방법

### 1. 라이브 버전 열기

[callofllm.vercel.app](https://callofllm.vercel.app)에 접속합니다.

3D 전장과 여러 고정 패널을 함께 사용하므로 현재는 최신 데스크톱 Chrome, Edge, Safari, Firefox처럼 WebGL과 WebSocket을 지원하는 브라우저를 권장합니다.

### 2. 닉네임 설정

첫 화면에서 최대 16자의 닉네임을 입력합니다. 닉네임은 계정 서버가 아니라 현재 브라우저의 localStorage에 저장됩니다. 이미 닉네임이 있으면 다음 방문부터 부대 관리 화면으로 바로 이동합니다.

### 3. 스테이지 진행

<code>출정</code> 메뉴에서 스테이지 1부터 시작합니다. 스테이지를 선택하면 출정 준비 화면이 열리며, 보유한 보병·궁수·기병을 최대 5개 소대로 직접 편성한 뒤 전장에 입장합니다. 스테이지 1~20의 적군은 모두 보병 10명입니다.

각 스테이지는 앞 스테이지를 클리어해야 열립니다. 전장 화면의 <code>예시 명령</code> 버튼은 명령 예시를 채팅 입력창에 채워 주지만 자동으로 전송하지는 않습니다.

### 4. 병력 충원

<code>부대 충원</code>에서 골드를 사용해 보병, 궁수, 기병을 한 명씩 충원할 수 있습니다. 충원한 병력은 스테이지 1~20의 출정 준비 화면에서 직접 편성해 사용합니다. 초기 보유 병력은 0명이므로 첫 출정 전에 최소 한 명을 충원해야 합니다.

### 5. 스테이지 공통 편성

스테이지 1~20은 모두 맵 ID 1에서 같은 적군 구성과 목표로 진행합니다.

- 아군: 보유 병력을 최대 5개 소대로 직접 편성
- 적군: 보병 10명의 단일 스쿼드
- 목표: 적군 10명 전멸
- 첫 클리어 보상: 10 G
- 스테이지 선택 후 출정 준비 화면에서 편성을 저장하고 게임 입장
- 마지막 편성은 다음 게임의 출정 준비 화면에 자동으로 복원

### 6. 전장 준비

게임 화면은 다음 조건이 모두 만족될 때까지 로딩 오버레이를 표시합니다.

- 외부 게임 서버 연결
- Protocol V15 <code>WELCOME</code> 확인
- 맵 선택과 메타데이터 검증
- 스테이지 시작
- 아군·적군 스쿼드 생성
- 양 팀 생존 병사 확인과 <code>RUNNING</code> 상태 수신
- 지형·병사 3D 모델 로딩

준비가 끝나면 브리핑에서 목표와 출전 편성을 확인하고 <code>작전 시작</code>을 누릅니다.

### 7. 자연어 명령

화면 아래 채팅창에 명령을 입력합니다. 모델이 실행 가능한 패킷을 생성하면 브라우저가 이를 외부 게임 서버로 전송합니다. 명령이 모호하면 임의의 스쿼드나 좌표를 추측하지 않고 필요한 정보를 되묻습니다.

### 8. 결과와 보상

- 모든 목표 달성: 클리어
- 아군 전멸: 즉시 실패
- 스테이지별 추가 실패 조건 충족: 즉시 실패
- 첫 클리어: 보상 골드 지급과 진행도 갱신
- 재클리어: 골드 중복 지급 없음
- 결과 화면: 다음 스테이지, 다시 시도, 스테이지 선택

## 자연어 명령 가이드

### 지원 명령

| 의도 | Protocol 명령 | 예시 |
|---|---|---|
| 지정 위치나 방향으로 이동 | <code>MOVE_SQUAD</code> | <code>1소대를 앞으로 1000 전진시켜</code> |
| 시야 안의 적 추적·공격 | <code>ATTACK_SQUAD</code> | <code>1소대 공격</code> |
| 병사를 다른 아군 스쿼드로 편입 | <code>TRANSFER_SOLDIER</code> | <code>1소대 3번 병사를 2소대로 편입해</code> |
| 이동·추적·공격 중지 | <code>STOP_SQUAD</code> | <code>1소대 정지</code> |
| 특정 적 스쿼드 집중 공격 | <code>FOCUS_ATTACK</code> | <code>1소대로 적 2소대를 집중 공격해</code> |
| 이동 중 적 발견 시 추적 전투 | <code>MOVE_ENGAGE_ON_SIGHT</code> | <code>1소대를 앞으로 2000 전진하면서 적을 발견하면 교전해</code> |
| 목적지를 유지하며 사거리 내 이동 사격 | <code>MOVE_FIRE_IN_RANGE</code> | <code>궁병대를 오른쪽으로 이동시키면서 사거리 안의 적만 공격해</code> |

자연어 AI는 다음 명령을 직접 만들 수 없습니다.

- <code>CREATE_SQUAD</code>: 스테이지 초기화 과정에서 클라이언트가 생성
- <code>SET_ATTACK_DAMAGE</code>: 플레이어 자연어 명령으로 차단
- <code>SWAP_SOLDIER_POSITION</code>: 플레이어 자연어 명령으로 차단

### 방향 해석

방향은 항상 아군 지휘관 관점으로 해석합니다.

| 표현 | 좌표 변화 | 의미 |
|---|---:|---|
| 앞, 전방, 전진, 진격 | X 증가 | 적 진영 방향 |
| 뒤, 후방, 후퇴, 물러남 | X 감소 | 아군 진영 방향 |
| 오른쪽, 우측 | Y 증가 | 전장 우측 |
| 왼쪽, 좌측 | Y 감소 | 전장 좌측 |

- 숫자로 거리를 말하면 현재 스쿼드 생존 병사의 평균 위치에 해당 거리를 더합니다.
- <code>조금</code>, <code>살짝</code>은 250으로 해석합니다.
- <code>크게</code>, <code>멀리</code>, <code>깊숙이</code>는 1000으로 해석합니다.
- 거리를 생략하면 해당 방향의 맵 끝을 목적지로 사용합니다.
- 여러 방향을 함께 말하면 X축과 Y축을 각각 계산합니다.
- 계산 결과는 X 0~6399, Y 0~3199 안으로 제한합니다.
- 위치를 계산할 살아 있는 병사가 없으면 좌표를 만들어 내지 않고 실행을 보류합니다.

### 대화와 실행 규칙

- 한 모델 응답은 가장 핵심적인 명령 하나만 실행합니다.
- 최근 정상 대화 최대 10턴을 함께 보내 후속 답변의 맥락을 유지합니다.
- 최신 전장 상태가 과거 대화보다 우선합니다.
- 사용자가 지정한 이름이 여러 스쿼드와 겹치면 어느 스쿼드인지 되묻습니다.
- 존재하지 않는 스쿼드·병사 ID를 임의로 생성하지 않습니다.
- 스테이지 1~20에서는 사용자 AI가 지원하는 모든 명령을 동일하게 사용할 수 있습니다.
- AI 안내 메시지가 생성되더라도 <code>packetData</code>가 <code>null</code>이면 게임 서버에는 아무 명령도 보내지 않습니다.

## 부대·경제·성장 시스템

### 초기 데이터

| 항목 | 초기값 |
|---|---:|
| 골드 | 500 G |
| 보병 | 0명 |
| 궁수 | 0명 |
| 기병 | 0명 |
| 보병 공격력 표시값 | 13 |
| 궁수 공격력 표시값 | 10 |
| 기병 공격력 표시값 | 15 |
| 마지막 클리어 스테이지 | 0 |

### 병력 충원 비용

| UI 병종 | Protocol UnitType | 1명당 비용 |
|---|---|---:|
| 보병 / 전사 | <code>WARRIOR</code> | 10 G |
| 궁수 / 궁병 | <code>ARCHER</code> | 50 G |
| 기병 / 기마병 | <code>KNIGHT</code> | 100 G |

충원 카드를 한 번 누를 때마다 해당 병종이 한 명 늘고 골드가 차감됩니다. 골드가 부족한 카드는 비활성화됩니다.

### 시설 강화 비용

| 시설 | 1회 비용 | localStorage 표시값 변화 |
|---|---:|---:|
| 보병훈련소 | 200 G | 보병 공격력 +1 |
| 궁병훈련소 | 500 G | 궁수 공격력 +1 |
| 기병훈련소 | 1,000 G | 기병 공격력 +1 |

> 현재 시설 강화는 브라우저의 공격력 표시값만 올립니다. 전투 클라이언트가 이 값을 <code>SET_ATTACK_DAMAGE</code> 패킷으로 서버에 적용하지 않으므로 실제 Protocol V15 전투 공격력에는 아직 반영되지 않습니다.

### Protocol V15 병종 기본 수치

| 병종 | 초기 HP | 기본 공격력 | 사정거리 | 이동속도 |
|---|---:|---:|---:|---:|
| 궁수 | 100 | 10 | 150 | 20 |
| 보병 | 150 | 13 | 15 | 20 |
| 기병 | 200 | 15 | 20 | 20 |

- 공통 시야: 300
- 일반 공격: 시야 안의 가장 가까운 적을 찾아 사정거리까지 추적
- 지정 집중 공격: 목표 스쿼드를 전역 범위에서 추적

## 스테이지

스테이지는 1부터 20까지 앞에서부터 순서대로 해금됩니다. 모든 스테이지가 맵 ID 1, 적군 보병 10명, 적군 전멸 목표와 첫 클리어 보상 10 G를 공유합니다. 아군은 각 스테이지의 출정 준비 화면에서 보유 병력을 최대 5개 소대로 직접 편성합니다.

| 스테이지 | 맵 ID | 핵심 목표 | 아군 편성 | 적군 | 첫 클리어 보상 |
|---:|---:|---|---|---|---:|
| 1~20 | 1 | 적군 보병 10명 전멸 | 보유 병력 직접 편성, 최대 5개 소대 | 보병 10명 | 10 G |

### 스테이지별 명령 사용

스테이지 1~20에서는 [지원 명령](#지원-명령)을 모두 사용할 수 있습니다. 스테이지 진행도에 따른 별도의 명령 제한은 없습니다.

## 전장 화면과 조작

### 3D 카메라

기본 Drei <code>OrbitControls</code>를 사용합니다.

- 마우스 왼쪽 드래그: 회전
- 마우스 휠 또는 가운데 드래그: 확대·축소
- 마우스 오른쪽 드래그: 평행 이동
- 우측 상단 스쿼드의 카메라 버튼: 해당 스쿼드 중심을 부드럽게 추적
- 같은 카메라 버튼을 다시 누름: 추적 해제

### 화면 구성

- 좌측 상단: WebSocket 주소, 접속·해제 버튼, 프로토콜·세션·맵 상태
- 상단 중앙: 현재 스테이지 목표, 단계, 이동 진행도
- 우측 상단: 아군 스쿼드 이름과 병종별 편성, 카메라 추적 버튼
- 좌측 패널: 병사 수와 스쿼드/병사 ID, 팀, 좌표, HP, 상태, 방향
- 3D 전장: 지형, 병사 모델, 팀 색상, 목표선·영역, 이탈 경계
- 하단: 사용자·AI·오류 메시지를 구분하는 자연어 명령 채팅

### 시각 표현

- 아군 표식: 파란색
- 적군 표식: 빨간색
- 사망 병사 표식: 회색
- 목표 지점·목표선: 초록색
- 이탈 패배 경계: 빨간색

## 시스템 아키텍처

~~~mermaid
flowchart LR
    Player[플레이어] --> UI[Next.js 브라우저 UI]
    UI <--> Storage[(localStorage)]

    UI -- 자연어 + 최근 대화 + 최신 전장 --> UserAPI["POST /api/openai/command/user"]
    UserAPI -- Responses API + strict JSON Schema --> OpenAI[OpenAI API]
    OpenAI --> UserAPI
    UserAPI -- packetData 또는 null --> UI

    UI -- 최신 전장 / 전투 시작 직후와 10초 주기 --> EnemyAPI["POST /api/openai/command/enemy"]
    EnemyAPI --> OpenAI
    OpenAI --> EnemyAPI
    EnemyAPI -- 적 스쿼드별 명령 배열 --> UI

    UI -- V15 binary command --> GameServer[외부 authoritative WebSocket 게임 서버]
    GameServer -- 50Hz 전체 병사 snapshot / stage state --> UI
    UI --> Scene[React Three Fiber 3D 전장]
~~~

### 사용자 명령 데이터 흐름

1. 플레이어가 한국어 명령을 입력합니다.
2. 브라우저가 최근 대화, 현재 목표, 아군 이름·ID 표, 전체 병사 스냅샷을 사용자 API에 보냅니다.
3. Route Handler가 OpenAI Responses API에 strict JSON Schema 응답을 요청합니다.
4. Route Handler가 모델 출력을 <code>packetDataToBuffer</code>로 검증합니다.
5. 브라우저가 응답 패킷의 구조와 값 범위를 다시 검사합니다.
6. 검증된 명령을 little-endian V15 바이너리 패킷으로 직렬화합니다.
7. 외부 게임 서버가 명령을 처리합니다.
8. 서버가 보낸 다음 전체 스냅샷으로 화면과 목표 상태를 갱신합니다.

### 적군 AI 데이터 흐름

1. 작전 시작 직후, 이후 10초마다 최신 전장 상태를 적군 API에 보냅니다.
2. 서버는 살아 있는 아군 수를 기준으로 <code>DEFENSE</code> 또는 <code>OFFENSE</code> 전략 모드를 정합니다.
3. 모델은 살아 있는 적 스쿼드마다 한 개의 명령을 반환합니다.
4. 서버가 중복 명령, 소유권, 팀, 대상, 좌표, 병종별 허용 행동을 검증합니다.
5. 브라우저가 <code>teamFlag=1</code> 소유권을 다시 확인합니다.
6. 검증을 모두 통과한 명령만 외부 게임 서버로 전송합니다.

### 신뢰 경계

- OpenAI 모델: 명령 후보 생성
- Next.js Route Handler: 입력 제한, JSON Schema, 명령 의미 검증
- 브라우저: 스테이지 allowlist와 적군 소유권 재검증
- WebSocket 게임 서버: 이동·전투·HP·승패의 최종 authoritative 판정

## Protocol V15 요약

전체 wire 규격은 [CLIENT_PACKET_SPEC_V15.md](./CLIENT_PACKET_SPEC_V15.md)를 참고하세요.

### 공통 규칙

- 전송 방식: WebSocket binary frame
- 한 frame에는 게임 패킷 하나만 포함
- 정수 인코딩: 4바이트 little-endian <code>int32</code>
- 공통 헤더: 8바이트
- 기본 게임 서버 포트: 9000
- simulation: 20ms, 50Hz
- Type 100 전체 snapshot: 20ms, 50Hz
- 세션: WebSocket 연결마다 독립 게임
- 현재 프로토콜 버전: 15

| Offset | Size | Field | 의미 |
|---:|---:|---|---|
| 0 | 4 | <code>pkt_type</code> | 패킷 종류 |
| 4 | 4 | <code>pkt_len</code> | 헤더를 포함한 전체 바이트 수 |

### 스테이지 초기화 순서

~~~mermaid
sequenceDiagram
    participant C as Browser Client
    participant S as V15 Game Server

    C->>S: WebSocket connect
    S-->>C: WELCOME (101) + MAP_INFO (106)
    Note over C: protocolVersion == 15 확인
    C->>S: SELECT_MAP (11)
    S-->>C: COMMAND_RESULT OK (104)
    S-->>C: 선택한 MAP_INFO (106)
    Note over C: map/version/world/cell 검증
    C->>S: START_STAGE (12)
    S-->>C: COMMAND_RESULT OK (104)
    S-->>C: 빈 snapshot (100) + STAGE_STATE (105)
    loop 아군·적군 스쿼드마다 순차 처리
        C->>S: CREATE_SQUAD (0)
        S-->>C: COMMAND_RESULT (104)
    end
    S-->>C: authoritative SOLDIER_POSITIONS (100), 50Hz
    S-->>C: STAGE_STATE RUNNING (105)
~~~

<code>COMMAND_RESULT</code>에는 별도의 request ID가 없습니다. 따라서 초기 <code>CREATE_SQUAD</code>는 병렬 전송하지 않고 이전 요청의 Type 104를 받은 뒤 다음 스쿼드를 보내야 합니다.

### Client → Server

| Type | 이름 | 전체 길이 | 역할 |
|---:|---|---:|---|
| 0 | <code>CREATE_SQUAD</code> | 32 | 병종 구성, 팀, 생성 좌표로 스쿼드 생성 |
| 1 | <code>MOVE_SQUAD</code> | 24 | 지정 좌표까지 일반 이동 |
| 2 | <code>ATTACK_SQUAD</code> | 16 | 시야 기반 자동 추적·공격 |
| 3 | <code>TRANSFER_SOLDIER</code> | 24 | 같은 팀의 다른 스쿼드로 병사 편입 |
| 4 | <code>STOP_SQUAD</code> | 16 | 이동·추적·공격 취소 |
| 5 | <code>SWAP_SOLDIER_POSITION</code> | 24 | 정지한 두 병사의 자리 교환 |
| 6 | <code>FOCUS_ATTACK</code> | 24 | 특정 적 스쿼드 집중 공격 |
| 7 | <code>SET_ATTACK_DAMAGE</code> | 24 | 특정 병사의 공격력 값 설정 |
| 8 | <code>MOVE_ENGAGE_ON_SIGHT</code> | 24 | 이동 중 적 발견 시 추적 전투 |
| 9 | <code>MOVE_FIRE_IN_RANGE</code> | 24 | 목적지를 유지하며 사거리 내 이동 사격 |
| 10 | <code>RESUME_SESSION</code> | 12 | 끊어진 논리 세션 복구 |
| 11 | <code>SELECT_MAP</code> | 12 | 스테이지 시작 전 맵 선택 |
| 12 | <code>START_STAGE</code> | 8 | 선택 맵 확정과 변경 잠금 |

### Server → Client

| Type | 이름 | 전체 길이 | 역할 |
|---:|---|---:|---|
| 100 | <code>SOLDIER_POSITIONS</code> | <code>12 + count × 32</code> | 모든 병사의 authoritative 전체 snapshot |
| 101 | <code>WELCOME</code> | 24 | 프로토콜, 세션, tick, 복구 시간 |
| 102 | 예약 | 전송하지 않음 | 공격은 Type 100 HP·state로 표현 |
| 103 | 예약 | 전송하지 않음 | 사망은 Type 100 HP=0·state=DEAD로 표현 |
| 104 | <code>COMMAND_RESULT</code> | 24 | 명령 결과 |
| 105 | <code>STAGE_STATE</code> | 20 | 진행 상태, 승패, 양 팀 생존 수 |
| 106 | <code>MAP_INFO</code> | 28 | 맵 ID, 버전, 크기, Grid 셀 크기 |

### ID 규칙

- 스쿼드 ID는 팀마다 0부터 독립 발급됩니다.
- 스쿼드의 실제 키는 <code>(teamFlag, squadID)</code>입니다.
- 병사의 실제 키는 <code>(teamFlag, squadID, soldierID)</code>입니다.
- 병사가 다른 스쿼드로 편입되면 새 스쿼드 안에서 새 <code>soldierID</code>를 받습니다.
- 아군 <code>teamFlag=0</code>, 적군 <code>teamFlag=1</code>입니다.

### 주요 제한

| 항목 | 제한 |
|---|---:|
| 스쿼드 1개 인원 | 1~200명 |
| 세션당 스쿼드 | 최대 128개 |
| 세션당 병사 | 최대 2,000명 |
| 월드 좌표 | X 0~6399, Y 0~3199 |
| 안전한 생성 좌표 | X 4~6395, Y 4~3195 |
| 클라이언트가 기대하는 mapVersion | 1 |
| 월드 크기 | 6400 × 3200 |
| Navigation Grid 셀 크기 | 10 |

### 명령 결과 코드

| 코드 | 이름 | 의미 |
|---:|---|---|
| 0 | <code>OK</code> | 성공 |
| -1 | <code>INVALID_PAYLOAD</code> | 길이, enum, 좌표, 값이 잘못됨 |
| -2 | <code>NOT_OWNER</code> | 소유권 오류 또는 예약 값 |
| -3 | <code>NOT_FOUND</code> | 대상 ID나 맵을 찾을 수 없음 |
| -4 | <code>INVALID_STATE</code> | 현재 lifecycle에서 실행할 수 없음 |
| -5 | <code>PATH_NOT_FOUND</code> | 이동 가능한 경로를 만들 수 없음 |
| -6 | <code>LIMIT_EXCEEDED</code> | 서버 자원 또는 수치 상한 초과 |

### 세션 복구

비정상 연결 종료가 발생하면 클라이언트는 현재 페이지 메모리에 마지막 논리 세션 ID를 기억합니다. 다음 연결에서 다른 초기화 명령보다 먼저 <code>RESUME_SESSION</code>을 보내고, 성공하면 맵 선택과 스쿼드 생성을 반복하지 않습니다.

Protocol V15 서버의 기본 세션 보존 시간은 300,000ms이지만, 클라이언트는 <code>WELCOME</code>의 <code>reconnectTimeoutMs</code>를 실제 안내값으로 사용합니다. 브라우저 새로고침이나 탭 종료 후에는 현재 구현상 메모리의 세션 ID가 사라지므로 자동 복구되지 않습니다.

### 맵

- 맵 ID 0: 장애물이 없는 서버 내장 sandbox
- 외부 JSON 맵 ID: 1, 2, 3
- 서버는 전체 Grid를 브라우저에 보내지 않음
- 클라이언트는 선택한 <code>mapID</code>와 <code>mapVersion</code>에 맞는 렌더링 에셋을 자체 보유해야 함
- 현재 등록된 스테이지 1~20은 모두 <code>mapID=1</code>을 사용함

## 기술 스택

아래 버전은 <code>package.json</code>에 선언된 현재 기준입니다.

| 영역 | 기술 |
|---|---|
| Framework | Next.js 16.3.0 App Router |
| UI | React 19.2.8, React DOM 19.2.8 |
| Language | TypeScript 5, strict mode |
| Styling | Tailwind CSS 4, <code>@tailwindcss/postcss</code> |
| 3D | Three.js 0.185.1 |
| React 3D | <code>@react-three/fiber</code> 9.7, <code>@react-three/drei</code> 10.7 |
| AI | OpenAI JavaScript SDK 7.4, Responses API, Structured Outputs |
| Asset tooling | <code>draco3d</code> 1.5.7 |
| Lint | ESLint 9, <code>eslint-config-next</code> 16.3 |
| Runtime | Node.js 22 이상 |
| Deployment | Vercel |

사용자 명령 Route Handler는 <code>gpt-5.6-luna</code>와 추론 강도 <code>none</code>을, 적군 전술 Route Handler는 <code>gpt-5.6-terra</code>와 추론 강도 <code>low</code>를 서버 코드에서 각각 고정해 사용합니다. 두 모델 모두 Responses API와 Structured Outputs를 지원합니다. 자세한 기능은 [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)와 [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra) 공식 문서에서 확인할 수 있습니다.

## 로컬 실행

### 준비물

- Node.js 22 이상
- npm
- OpenAI API key
- Protocol V15 호환 WebSocket 게임 서버
- WebGL과 WebSocket을 지원하는 브라우저

### 1. 저장소 받기

~~~bash
git clone https://github.com/CallOfLLM/callofllm-client.git
cd callofllm-client
~~~

이미 저장소를 받은 상태라면 현재 프로젝트 루트에서 다음 단계부터 진행합니다.

### 2. 의존성 설치

~~~bash
npm ci
~~~

<code>package-lock.json</code>이 포함되어 있으므로 재현 가능한 설치에는 <code>npm ci</code>를 권장합니다.

### 3. 환경 파일 만들기

~~~bash
cp .env.example .env.local
~~~

<code>.env.local</code>을 열고 실제 값을 입력합니다.

~~~dotenv
OPENAI_API_KEY=your_openai_api_key
NEXT_PUBLIC_GAME_WS_URL=wss://your-game-server.example/
~~~

<code>.env*</code> 파일은 <code>.gitignore</code>에 포함되어 있고 <code>.env.example</code>만 추적됩니다. 실제 API key를 README, 이슈, 로그, 클라이언트 코드에 커밋하지 마세요.

### 4. 개발 서버 실행

~~~bash
npm run dev
~~~

[http://localhost:3000](http://localhost:3000)을 엽니다.

### 5. WebSocket 연결

<code>NEXT_PUBLIC_GAME_WS_URL</code>을 설정했다면 게임 화면 진입 시 자동 연결을 시도합니다. 값을 비워 두었다면 게임 화면 좌측 상단 입력창에 <code>ws://</code> 또는 <code>wss://</code> 주소를 입력하고 <code>접속</code>을 누릅니다.

외부 게임 서버가 없으면 관리 화면과 편성 UI는 확인할 수 있지만 실제 전장 초기화와 전투는 진행되지 않습니다.

### 프로덕션 모드 확인

~~~bash
npm run build
npm run start
~~~

## 환경 변수

| 변수 | 필수 여부 | 노출 범위 | 설명 |
|---|---|---|---|
| <code>OPENAI_API_KEY</code> | AI 기능에 필수 | 서버 전용 | 사용자·적군 Route Handler가 OpenAI API를 호출할 때 사용하는 비밀 키 |
| <code>NEXT_PUBLIC_GAME_WS_URL</code> | 자동 연결에 선택, 전투에는 WS 서버 필수 | 브라우저 공개 | 외부 Protocol V15 WebSocket 서버 주소 |

### 주의사항

- <code>OPENAI_API_KEY</code>에 절대로 <code>NEXT_PUBLIC_</code> 접두사를 붙이지 마세요.
- <code>NEXT_PUBLIC_GAME_WS_URL</code>은 브라우저 번들에 포함되는 공개값이므로 비밀을 넣지 마세요.
- <code>NEXT_PUBLIC_*</code> 값은 빌드 시 클라이언트 번들에 주입됩니다. 배포 환경에서 주소를 바꾸면 다시 빌드·배포해야 합니다.
- HTTPS 페이지에서는 혼합 콘텐츠 차단을 피하기 위해 공개 접근 가능한 <code>wss://</code> 서버를 사용하세요.
- 모델 ID와 추론 강도는 각 OpenAI Route Handler의 서버 코드에 고정되어 있으며 환경 변수로 덮어쓰지 않습니다.
- 모델을 바꿀 때는 Responses API와 strict JSON Schema Structured Outputs 지원 여부를 확인하세요.

## 스크립트

| 명령 | 설명 |
|---|---|
| <code>npm run dev</code> | Next.js 개발 서버 실행 |
| <code>npm run build</code> | 프로덕션 빌드 생성 |
| <code>npm run start</code> | 빌드된 프로덕션 서버 실행 |
| <code>npm run lint</code> | ESLint 정적 검사 |
| <code>npm run generate:ground-grid</code> | GLB 지형의 stone 메시로 Grid 바이너리·메타데이터 재생성 |

### 지형 Grid 재생성

<code>npm run generate:ground-grid</code>는 일반 실행에 필요하지 않습니다. <code>public/Ground_optimize.glb</code>의 stone 메시를 Draco로 디코딩하고 6400×3200 Grid에 래스터화하여 다음 파일을 **덮어씁니다**.

- <code>public/Ground_optimize.grid.bin</code>
- <code>public/Ground_optimize.grid.json</code>

지형 원본을 변경하고 충돌·경로용 Grid를 다시 만들 때만 실행하세요. 생성 후에는 변경된 메타데이터와 실제 게임 서버 맵의 정합성을 별도로 확인해야 합니다.

### 현재 검증 범위

현재 <code>package.json</code>에는 자동 테스트 스크립트나 테스트 러너가 없습니다. 기본 검증 명령은 다음 두 가지입니다.

~~~bash
npm run lint
npm run build
~~~

## 라우트와 API 계약

### 사용자 페이지

| 경로 | 역할 |
|---|---|
| <code>/</code> | 닉네임 입력. 저장된 닉네임이 있으면 <code>/main</code>으로 이동 |
| <code>/main</code> | 출정, 충원, 시설, 온라인 대전 카드가 있는 부대 관리 허브 |
| <code>/troop</code> | 골드를 사용한 병력 충원 |
| <code>/building</code> | 병종별 공격력 표시값 강화 |
| <code>/stage</code> | 진행도에 따른 스테이지 목록과 잠금 상태 |
| <code>/stage/ready?stage=1</code> | 보유 병력을 최대 5개 소대로 편성하고 출정을 확정하는 준비 화면 |
| <code>/game?stage=1</code> | WebSocket 전장, 3D 렌더링, 자연어 명령, 목표와 결과 |

잘못된 스테이지 번호로 <code>/game</code>에 들어가면 스테이지 1을 사용합니다. 저장된 아군 편성 없이 <code>/game</code>에 직접 들어가면 해당 스테이지의 출정 준비 화면으로 이동합니다. <code>/stage/ready</code>는 스테이지 1~20 모두에서 준비 화면을 표시하고 마지막 편성을 자동으로 복원하며, 병력이 한 명 이상 편성된 경우에만 해당 게임 화면으로 이동할 수 있습니다.

### POST /api/openai/command/user

플레이어의 자연어 한 문장을 실행 가능한 단일 명령으로 변환합니다.

요청 개요:

~~~json
{
  "message": "1소대를 앞으로 1000 전진시켜",
  "history": [
    {
      "role": "user",
      "text": "이 부대가 1소대야"
    },
    {
      "role": "assistant",
      "text": "1소대를 확인했습니다."
    }
  ],
  "gameState": {
    "protocolVersion": 15,
    "mapBounds": {
      "minX": 0,
      "maxX": 6399,
      "minY": 0,
      "maxY": 3199
    },
    "stage": {
      "stageState": 1,
      "aliveAllyCount": 1,
      "aliveEnemyCount": 1
    },
    "currentGoal": "부대를 앞쪽으로 이동시키세요.",
    "allySquads": [
      {
        "teamFlag": 0,
        "squadID": 0,
        "name": "1소대",
        "warriorCount": 1,
        "archerCount": 0,
        "knightCount": 0
      }
    ],
    "soldiers": [
      {
        "teamFlag": 0,
        "squadID": 0,
        "soldierID": 0,
        "posX": 3200,
        "posY": 1600,
        "hp": 150,
        "state": 0,
        "direction": 0
      }
    ]
  }
}
~~~

성공 응답:

~~~json
{
  "packetData": {
    "packetType": "MOVE_SQUAD",
    "squadID": 0,
    "teamFlag": 0,
    "destinationX": 4200,
    "destinationY": 1600
  },
  "message": "1소대를 전방으로 1000 이동시킵니다."
}
~~~

명령이 모호한 경우:

~~~json
{
  "packetData": null,
  "message": "어느 스쿼드를 이동할지 알려 주세요."
}
~~~

제한:

| 항목 | 제한 |
|---|---:|
| <code>message</code> | 필수, 최대 4,000자 |
| <code>history</code> | 유효한 최근 10턴 |
| <code>gameState</code> | JSON 문자열 기준 최대 200,000자 |
| OpenAI timeout | 30초 |
| OpenAI SDK retry | 최대 1회 |

### POST /api/openai/command/enemy

브라우저 게임 클라이언트가 내부적으로 호출하는 적군 전술 API입니다. 최신 전체 병사 상태와 적 스쿼드 메타데이터를 받고, 살아 있는 적 스쿼드별 명령 배열을 반환합니다.

요청 개요:

~~~json
{
  "gameState": {
    "protocolVersion": 15,
    "mapBounds": {
      "minX": 0,
      "maxX": 6399,
      "minY": 0,
      "maxY": 3199
    },
    "stage": {
      "stageState": 1,
      "aliveAllyCount": 2,
      "aliveEnemyCount": 1
    },
    "enemySquads": [
      {
        "teamFlag": 1,
        "squadID": 0,
        "role": "infantry",
        "unitType": "WARRIOR",
        "warriorCount": 1,
        "archerCount": 0,
        "knightCount": 0
      }
    ],
    "soldiers": [
      {
        "teamFlag": 0,
        "squadID": 0,
        "soldierID": 0,
        "posX": 1200,
        "posY": 1500,
        "hp": 150,
        "state": 0,
        "direction": 0
      },
      {
        "teamFlag": 0,
        "squadID": 0,
        "soldierID": 1,
        "posX": 1250,
        "posY": 1550,
        "hp": 150,
        "state": 0,
        "direction": 0
      },
      {
        "teamFlag": 1,
        "squadID": 0,
        "soldierID": 0,
        "posX": 5200,
        "posY": 1600,
        "hp": 150,
        "state": 0,
        "direction": 180
      }
    ]
  }
}
~~~

응답 개요:

~~~json
{
  "packetData": [
    {
      "packetType": "MOVE_ENGAGE_ON_SIGHT",
      "teamFlag": 1,
      "squadID": 0,
      "destinationX": 3000,
      "destinationY": 1600
    }
  ],
  "message": "보병 전열이 서쪽으로 진격합니다.",
  "strategy": "보병으로 전선을 만들고 후열을 보호합니다.",
  "strategyMode": "DEFENSE"
}
~~~

제한:

| 항목 | 제한 |
|---|---:|
| 전체 요청 | JSON 문자열 기준 최대 500,000자 |
| 병사 | 최대 2,000명 |
| 살아 있는 적 스쿼드 | 최대 64개 |
| OpenAI timeout | 30초 |
| OpenAI SDK retry | 최대 1회 |

적군이 없거나 아군이 모두 사망한 상태에서는 빈 <code>packetData</code> 배열을 반환합니다.

### 오류 응답

두 API는 입력과 모델 출력을 검증하고 상황에 따라 다음 상태 코드를 반환합니다.

- <code>400</code>: JSON 형식, 필수 값, 필드 범위가 잘못됨
- <code>413</code>: 메시지, 전장 상태, 병사·스쿼드 수 제한 초과
- <code>500</code>: 서버에 <code>OPENAI_API_KEY</code>가 없음
- <code>502</code>: OpenAI API 실패, timeout, 예기치 않은 모델 출력

현재 두 API에는 애플리케이션 자체 인증과 rate limit이 구현되어 있지 않습니다. 공개 배포에서는 별도의 접근 제어와 사용량 보호가 필요합니다.

## 프로젝트 구조

~~~text
callofllm/
├── app/
│   ├── (lib)/
│   │   ├── _gametype.ts          # 경제, 병력, 공격력, 진행도와 localStorage
│   │   ├── _packet.ts            # Protocol V15 상수, 스키마, 직렬화·역직렬화
│   │   ├── squadfuncs.ts         # 출정 편성 저장, 제한, spawn 계산
│   │   └── stages.ts             # 스테이지 목표, 배치, 보상
│   ├── _client/
│   │   └── NicknameClient.tsx    # 닉네임 입력과 저장
│   ├── _components/
│   │   ├── CommandHeader.tsx     # 닉네임, 골드, 보유 병력, 로그아웃
│   │   └── SelectionButtonPage.tsx
│   ├── api/openai/command/
│   │   ├── user/route.ts         # 사용자 자연어 → 단일 V15 명령
│   │   └── enemy/route.ts        # 최신 전장 → 적 스쿼드별 전술 명령
│   ├── building/                 # 시설 강화
│   ├── game/
│   │   ├── _client/
│   │   │   ├── GameClient.tsx    # 게임·WS·3D·AI 전체 오케스트레이션
│   │   │   ├── useObjective.ts   # 서버 STAGE_STATE 기반 승패 판정
│   │   │   ├── LoadingOverlay.tsx
│   │   │   ├── BriefingOverlay.tsx
│   │   │   └── ResultOverlay.tsx
│   │   └── page.tsx
│   ├── main/                     # 부대 관리 허브
│   ├── stage/                    # 스테이지 선택과 출정 준비
│   ├── troop/                    # 병력 충원
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── public/
│   ├── bg/                       # 화면 배경
│   ├── profile/                  # 지휘관 프로필
│   ├── Ground_optimize.glb       # 3D 지형
│   ├── Ground_optimize.grid.bin  # 지형 Grid 바이너리
│   ├── Ground_optimize.grid.json # Grid 메타데이터
│   └── soldier_low_ktx2.glb      # 병사 모델
├── scripts/
│   └── generate-ground-grid.mjs  # 지형 Grid 생성기
├── CLIENT_PACKET_SPEC_V15.md     # 전체 WebSocket wire protocol
├── .env.example
├── package.json
└── README.md
~~~

### 핵심 모듈

- <code>app/(lib)/_packet.ts</code>: V15 패킷의 단일 진실 원천입니다. JSON Schema, 필드 범위, 직렬화 함수, 서버 패킷 파서를 포함합니다.
- <code>app/(lib)/stages.ts</code>: 스테이지 메타데이터와 승리·추가 패배 조건을 정의합니다.
- <code>app/game/_client/GameClient.tsx</code>: WebSocket lifecycle, 세션 복구, 스테이지 초기화, AI 호출, 3D 장면과 전장 UI를 조율합니다.
- <code>app/api/openai/command/user/route.ts</code>: 사용자의 자연어를 단일 안전 명령으로 변환합니다.
- <code>app/api/openai/command/enemy/route.ts</code>: 적군 전체의 전술을 만들고 스쿼드 소유권과 병종 역할을 검증합니다.

## 데이터 저장과 초기화

별도 데이터베이스나 로그인 계정이 없습니다. 다음 데이터는 현재 브라우저 origin의 localStorage에 저장됩니다.

| localStorage key | 저장 내용 | 삭제 시 영향 |
|---|---|---|
| <code>nickname</code> | 최대 16자 닉네임 | 다음 방문에 닉네임 입력 화면 표시 |
| <code>gamedata</code> | 골드, 보유 병력, 병종별 공격력 표시값, 마지막 클리어 스테이지 | 기본값 500 G, 병력 0, 진행도 0으로 복귀 |
| <code>deployment</code> | 마지막 출전 스테이지와 재사용할 스쿼드 이름·병종별 인원 | 다음 출정 준비 화면이 빈 편성으로 시작 |

### 저장되지 않는 데이터

- AI 채팅 기록
- 현재 전투의 병사 스냅샷
- 현재 WebSocket 연결
- 자동 복구용 session ID
- 카메라 상태

페이지를 새로고침하면 위 메모리 상태는 사라집니다.

### 로그아웃과 완전 초기화

헤더의 <code>로그아웃</code>은 <code>nickname</code>, <code>gamedata</code>, <code>deployment</code>을 함께 삭제합니다. 다시 닉네임을 입력하면 골드 500 G, 병력 0명, 기본 공격력, 스테이지 진행도 0과 빈 편성으로 새 게임을 시작합니다.

> 로그아웃으로 삭제한 게임 기록은 복구할 수 없습니다. 필요한 진행 데이터가 있다면 먼저 브라우저 저장소를 백업하세요.

## Vercel 배포

이 프로젝트는 별도 <code>vercel.json</code> 없이 Vercel의 Next.js 자동 감지로 배포할 수 있습니다.

### 배포 순서

1. Git 저장소를 Vercel 프로젝트로 가져옵니다.
2. Node.js 22 이상을 사용하도록 프로젝트 런타임을 확인합니다.
3. Production, Preview, Development 환경에 필요한 환경 변수를 설정합니다.
4. <code>OPENAI_API_KEY</code>를 서버 전용 비밀로 등록합니다.
5. <code>NEXT_PUBLIC_GAME_WS_URL</code>에 공개 접근 가능한 <code>wss://</code> V15 서버 주소를 입력합니다.
6. 빌드와 배포를 실행합니다.
7. <code>NEXT_PUBLIC_GAME_WS_URL</code>을 바꿨다면 반드시 재배포합니다.

### 배포 구조에서 중요한 점

- Vercel은 Next.js UI와 OpenAI Route Handler를 호스팅합니다.
- 외부 게임 시뮬레이션 서버는 Vercel 프로젝트에 포함되지 않습니다.
- 브라우저가 WebSocket 서버에 직접 연결하므로 해당 서버는 인터넷에서 접근 가능해야 합니다.
- 배포 페이지가 HTTPS이므로 WebSocket도 <code>wss://</code>를 사용해야 합니다.
- 게임 서버는 Protocol V15, world 6400×3200, mapVersion 1, Grid 셀 크기 10과 호환되어야 합니다.
- OpenAI API 사용량은 배포자의 API key에 청구됩니다.

현재 공개 플레이 버전:

> [https://callofllm.vercel.app](https://callofllm.vercel.app)

## 문제 해결

### 게임 화면이 로딩에서 멈춥니다

다음을 순서대로 확인하세요.

1. <code>NEXT_PUBLIC_GAME_WS_URL</code> 또는 화면 상단 주소가 비어 있지 않은지
2. 주소가 <code>ws://</code> 또는 <code>wss://</code>로 시작하는지
3. 외부 게임 서버가 실행 중이고 브라우저에서 접근 가능한지
4. HTTPS 페이지에서 <code>wss://</code>를 사용하는지
5. 서버가 Protocol V15를 사용하는지
6. 서버의 맵 메타데이터가 version 1, 6400×3200, cell 10인지
7. 아군과 적군 스쿼드가 각각 최소 하나 이상 성공적으로 생성됐는지
8. 브라우저 콘솔의 <code>COMMAND_RESULT</code>와 WebSocket close code

### WebSocket close code 1006이 표시됩니다

1006은 비정상 종료입니다. 서버 미기동, 방화벽, DNS, 주소 오타, 터널 만료, TLS 실패를 확인하세요. 브라우저는 WebSocket 보안상 상세 원인을 숨길 수 있으므로 게임 서버 로그도 함께 확인해야 합니다.

### close code 4002가 표시됩니다

클라이언트 V15와 서버가 보낸 <code>protocolVersion</code>이 일치하지 않습니다. Protocol V15 호환 서버를 사용하세요.

### MAP_INFO 불일치 또는 스테이지 준비 실패가 표시됩니다

클라이언트는 선택한 맵에 대해 다음 값을 기대합니다.

- <code>mapVersion=1</code>
- <code>worldWidth=6400</code>
- <code>worldHeight=3200</code>
- <code>gridCellSize=10</code>

또한 생성 좌표가 맵 범위 밖이거나 WALL이면 <code>CREATE_SQUAD</code>가 <code>INVALID_PAYLOAD(-1)</code>로 실패합니다.

### AI 명령이 500 오류를 반환합니다

서버 환경에 <code>OPENAI_API_KEY</code>가 있는지 확인하세요. 키를 수정했다면 개발 서버를 다시 시작하거나 배포를 다시 실행합니다.

### AI 명령이 502 오류를 반환합니다

OpenAI API 연결, 모델 ID, Responses API·Structured Outputs 지원 여부, 프로젝트 사용 한도와 서버 로그를 확인하세요. 각 OpenAI 요청의 timeout은 30초이고 SDK 재시도는 최대 1회입니다.

### AI가 명령 대신 질문합니다

스쿼드, 병사, 대상, 거리, 좌표를 현재 전장 상태만으로 하나로 확정할 수 없으면 <code>packetData=null</code>로 되묻는 것이 정상 동작입니다. 스쿼드 이름이나 번호와 원하는 행동을 더 구체적으로 입력하세요.

### 출정 준비 화면에서 출정할 수 없습니다

초기 보유 병력은 보병·궁수·기병 모두 0명입니다. <code>부대 충원</code>에서 병력을 한 명 이상 충원한 뒤 출정 준비 화면에서 최대 5개 소대 중 하나에 배치하세요. 편성 인원이 0명이면 출정 버튼이 비활성화됩니다.

### 진행도나 병력이 다른 브라우저에서 보이지 않습니다

게임 데이터는 서버 계정이 아니라 브라우저 localStorage에만 있습니다. 다른 브라우저, 시크릿 창, 다른 기기, 다른 origin에는 자동으로 동기화되지 않습니다.

### 새로고침 후 이전 전투로 복구되지 않습니다

자동 복구용 session ID는 React 메모리에만 있습니다. 같은 페이지에서 비정상 연결이 끊긴 뒤 다시 접속하는 경우에는 복구를 시도하지만, 새로고침이나 탭 종료 후에는 ID가 사라집니다.

## 보안·개인정보·비용

### API key

- <code>OPENAI_API_KEY</code>는 서버 Route Handler에서만 읽습니다.
- 키를 <code>NEXT_PUBLIC_*</code> 변수나 브라우저 코드에 넣지 마세요.
- Git에 커밋된 적이 있다면 파일 삭제만 하지 말고 해당 키를 폐기하고 재발급하세요.

### OpenAI로 전송되는 데이터

사용자 명령을 해석할 때 다음 정보가 OpenAI API에 전달됩니다.

- 플레이어가 입력한 자연어
- 최근 정상 대화 최대 10턴
- 현재 목표
- 아군 스쿼드 이름과 병종 구성
- 전체 병사의 팀, ID, 좌표, HP, 상태, 방향

적군 판단에서도 최신 전체 병사 상태와 적군 스쿼드 메타데이터가 전달됩니다. 닉네임은 현재 사용자 명령 API payload에 직접 포함되지 않지만, 사용자가 채팅에 직접 입력한 내용은 그대로 전송될 수 있습니다. 민감한 개인정보나 비밀을 명령창에 입력하지 마세요.

### 공개 API 보호

현재 <code>/api/openai/command/user</code>와 <code>/api/openai/command/enemy</code>에는 로그인, API 인증, CAPTCHA, 사용자별 quota, rate limit이 없습니다. 공개 배포를 운영할 때는 다음 보호를 추가하는 것을 권장합니다.

- origin·세션 기반 접근 제어
- 사용자·IP·세션 단위 rate limit
- 일일 OpenAI 예산과 사용량 경보
- 요청 크기와 동시 실행 수 모니터링
- 오류율, 지연 시간, token 사용량 관찰

### API 사용량

- 플레이어 자연어 명령 1회마다 사용자 AI 요청 1회
- 전투 시작 직후 적군 AI 요청 1회
- 전투 중 10초마다 적군 AI 요청 1회

오래 지속되는 전투와 동시 사용자가 많아질수록 OpenAI API 사용량이 증가합니다.

## 현재 구현 범위와 제한사항

README의 설명은 현재 소스 코드 기준입니다.

- **온라인 대전:** 메인 메뉴 카드만 있으며 실제 PvP는 준비 중입니다.
- **맵:** Protocol V15는 외부 맵 1~3을 지원하며 현재 스테이지 1~20은 모두 외부 맵 1을 사용합니다.
- **시설 강화:** localStorage의 공격력 표시값만 증가하며 실제 전투 공격력에는 아직 적용되지 않습니다.
- **전투 손실:** 사망한 병사는 전투 후 보유 병력에서 차감되지 않습니다.
- **진행 저장:** 계정이나 서버 DB 없이 localStorage에만 저장됩니다.
- **세션 복구:** 같은 페이지에서 끊긴 연결만 자동 복구 대상으로 기억합니다.
- **무승부:** Protocol에는 <code>DRAW</code> 상태가 있지만 현재 목표·결과 UI는 별도 무승부 흐름을 구현하지 않았습니다.
- **게임 서버:** 이 저장소에 V15 시뮬레이션 서버 구현과 배포 구성이 없습니다.
- **OpenAI API 보호:** 애플리케이션 인증과 rate limit이 없습니다.
- **테스트:** 자동화 테스트 스크립트와 테스트 파일이 없습니다.
- **CI/CD:** 저장소 자체 GitHub Actions workflow는 없습니다.

## 문서와 라이선스

### 관련 문서

- [CLIENT_PACKET_SPEC_V15.md](./CLIENT_PACKET_SPEC_V15.md): 전체 바이너리 패킷 규격, enum, lifecycle, 맵 관계
- [.env.example](./.env.example): 로컬·배포 환경 변수 예시
- [OpenAI GPT-5.6 Luna 공식 문서](https://developers.openai.com/api/docs/models/gpt-5.6-luna): 사용자 명령 모델의 API와 Structured Outputs 지원 정보
- [OpenAI GPT-5.6 Terra 공식 문서](https://developers.openai.com/api/docs/models/gpt-5.6-terra): 적군 전술 모델의 API와 Structured Outputs 지원 정보

### 라이선스

현재 저장소에는 별도의 <code>LICENSE</code> 파일이 없습니다. 코드·에셋의 사용, 수정, 배포 조건이 명시되어 있지 않으므로 외부 프로젝트에서 사용하거나 재배포하기 전에 저장소 소유자에게 조건을 확인하세요.

### 기여

현재 별도의 <code>CONTRIBUTING.md</code>, Code of Conduct, Security Policy가 없습니다. 공식적인 외부 기여 절차를 운영하려면 해당 정책 문서를 먼저 추가해야 합니다.

---

자연어 한 문장이 실제 바이너리 명령이 되고, 그 결과가 다시 다음 판단의 전장 상태가 되는 반복 구조가 Call of LLM의 핵심입니다.
