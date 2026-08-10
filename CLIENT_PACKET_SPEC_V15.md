# 클라이언트 구현용 패킷 명세 — Protocol V15

이 문서는 현재 소스 코드 기준의 클라이언트 통신 규격이다.

- 전송: WebSocket binary frame
- 정수 인코딩: 4바이트 little-endian `int32`
- 기본 포트: `9000`
- simulation: `20ms`, 50Hz
- Type 100 전체 snapshot: `20ms`, 50Hz
- 세션 구조: WebSocket 연결마다 독립된 게임
- 현재 프로토콜 버전: `15`

V15의 wire 변경점은 Type 12 `START_STAGE`다. 서버는 현재 `maps/Map_###_map_640x320.json`의 정적 Grid만 보유한다. 맵 파일에는 스쿼드나 Soldier가 없으며, 양 팀 병력은 클라이언트가 기존 Type 0 `CREATE_SQUAD`로 생성한다. JSON 맵 적용으로 Type 0~12 및 Type 100~106의 wire 배치는 바뀌지 않았다.

## 1. 공통 패킷 헤더

모든 게임 패킷은 다음 8바이트 헤더로 시작한다.

| Offset | Size | Type | Field | 의미 |
|---:|---:|---|---|---|
| 0 | 4 | `int32` | `pkt_type` | 패킷 종류 |
| 4 | 4 | `int32` | `pkt_len` | 헤더를 포함한 전체 바이트 수 |

한 WebSocket binary frame에는 게임 패킷 하나만 넣는다. `pkt_len`은 해당 frame의 binary payload 길이와 같아야 한다. 브라우저에서는 수신한 `ArrayBuffer`를 little-endian `DataView`로 읽으면 된다.

## 2. 권장 접속 및 스테이지 시작 순서

1. WebSocket 연결
2. Type 101 `WELCOME` 수신 후 `protocolVersion == 15` 확인
3. Type 106 `MAP_INFO`로 기본 맵 확인
4. 사용자가 고른 맵 ID로 Type 11 `SELECT_MAP` 전송
5. 성공 Type 104와 새 Type 106 수신
6. Type 12 `START_STAGE` 전송
7. 성공 Type 104 수신. 직후 Type 100은 아직 생성한 병력이 없다면 `soldierCount=0`
8. 클라이언트가 Type 0 `CREATE_SQUAD`로 아군과 적군을 원하는 위치에 생성
9. Type 100 전체 snapshot에서 서버가 확정한 ID와 좌표 확인

`SELECT_MAP`은 `START_STAGE` 전이고 병사가 한 명도 없을 때만 가능하다. `START_STAGE`도 병사가 없는 상태에서 한 번만 가능하다. 따라서 순서는 반드시 `SELECT_MAP → START_STAGE → CREATE_SQUAD`로 잡는 것을 권장한다.

현재 모든 맵은 병력이 없는 정적 Grid다. `START_STAGE`는 선택을 잠그는 lifecycle 명령이며 자동 생성 명령이 아니다.

### 2.1 맵 입장 시 클라이언트 송신 패킷

사용자가 맵 선택 UI에서 맵을 클릭하면 클라이언트는 다음 순서로 패킷을 보낸다. 현재 외부 맵 ID는 1, 2, 3이다.

| 순서 | 방향 | Type | 전체 길이 | 역할 | 다음 단계로 넘어가는 기준 |
|---:|---|---:|---:|---|---|
| 1 | Client → Server | 11 `SELECT_MAP` | 12 | 선택한 정적 Grid 적용 | Type 104 `OK(0)`와 같은 mapID의 Type 106 수신 |
| 2 | Client → Server | 12 `START_STAGE` | 8 | 선택 맵 확정 및 변경 잠금 | Type 104 `OK(0)` 수신 |
| 3 | Client → Server | 0 `CREATE_SQUAD` | 32 | 아군 생성, 필요한 스쿼드 수만큼 반복 | 각 요청의 Type 104 `OK(0)` 수신 |
| 4 | Client → Server | 0 `CREATE_SQUAD` | 32 | 적군 생성, 필요한 스쿼드 수만큼 반복 | 각 요청의 Type 104 `OK(0)` 수신 |
| 5 | Server → Client | 100 `SOLDIER_POSITIONS` | 가변 | 전체 병력의 서버 확정 상태 적용 | `soldierCount`와 모든 record 반영 |

Type 100은 클라이언트가 보내는 패킷이 아니라 서버가 20ms마다 보내는 전체 snapshot이다. START_STAGE 성공 직후에는 아직 병력이 없으므로 `soldierCount=0`일 수 있다. 이후 CREATE_SQUAD가 처리되면 다음 snapshot부터 생성된 병력이 포함된다.

#### 1단계: SELECT_MAP

| Offset | Size | 값/Field |
|---:|---:|---|
| 0 | 4 | `pkt_type = 11` |
| 4 | 4 | `pkt_len = 12` |
| 8 | 4 | `mapID = 1`, `2` 또는 `3` |

성공 시 서버 응답 순서는 Type 104 `COMMAND_RESULT` 다음 Type 106 `MAP_INFO`다. 클라이언트는 Type 106의 `mapID`, `mapVersion`, `worldWidth`, `worldHeight`, `gridCellSize`가 자신이 로드할 시각 맵 에셋과 맞는지 확인한 뒤 START_STAGE를 보내야 한다.

#### 2단계: START_STAGE

| Offset | Size | 값/Field |
|---:|---:|---|
| 0 | 4 | `pkt_type = 12` |
| 4 | 4 | `pkt_len = 8` |

payload는 없다. 성공 시 서버는 Type 104, 현재 Type 100 전체 snapshot, Type 105 `STAGE_STATE` 순서로 즉시 보낸다. 이 명령이 성공하면 해당 세션에서는 SELECT_MAP을 다시 보낼 수 없다.

#### 3·4단계: 아군과 적군 CREATE_SQUAD

| Offset | Size | Field | 값/의미 |
|---:|---:|---|---|
| 0 | 4 | `pkt_type` | 0 |
| 4 | 4 | `pkt_len` | 32 |
| 8 | 4 | `archerCount` | 이 스쿼드의 궁수 수 |
| 12 | 4 | `warriorCount` | 이 스쿼드의 전사 수 |
| 16 | 4 | `knightCount` | 이 스쿼드의 기사 수 |
| 20 | 4 | `teamFlag` | 아군 0, 적군 1 |
| 24 | 4 | `spawnX` | 서버 월드 X 좌표 |
| 28 | 4 | `spawnY` | 서버 월드 Y 좌표. 3D 클라이언트에서는 일반적으로 `-worldZ` |

클라이언트가 보유한 스테이지 구성 데이터에 스쿼드가 여러 개라면 Type 0을 스쿼드마다 한 번씩 보낸다. Type 104에는 별도 request ID가 없으므로 구현을 단순하게 유지하려면 이전 CREATE_SQUAD의 Type 104를 받은 뒤 다음 CREATE_SQUAD를 보내는 방식을 권장한다. 성공 응답의 `(teamFlag, entityID)`가 생성된 `(teamFlag, squadID)`다.

생성 좌표가 JSON Grid의 WALL이거나 월드 범위 밖이면 Type 104 `INVALID_PAYLOAD(-1)`가 온다. 이 경우 해당 스쿼드는 생성되지 않으므로 클라이언트는 다른 FLOOR 좌표를 선택하거나 맵 배치 데이터를 수정해야 한다.

아군과 적군이 각각 한 명 이상 생성되면 서버의 Type 105 상태가 `RUNNING(1)`으로 전환된다. 한쪽 팀만 생성하면 `WAITING(0)` 상태가 유지된다.

### 2.2 재접속 시 예외

기존 논리 세션에 재접속할 때는 SELECT_MAP, START_STAGE, CREATE_SQUAD를 다시 보내지 않는다. 새 WebSocket 연결 직후 Type 10 `RESUME_SESSION(previousSessionID)`만 보내면 서버가 기존 WELCOME, MAP_INFO, 전체 Type 100 snapshot과 Type 105를 다시 전달한다. 재접속 성공 후 위 맵 입장 흐름을 반복하면 중복 생성 또는 `INVALID_STATE(-4)`가 발생한다.

## 3. ID와 공통 enum

### 3.1 세션 ID

Type 101의 `sessionID`는 논리 게임 ID다. 연결이 끊겨도 기본 300,000ms 동안 게임이 정지된 채 보관된다. 새 WebSocket에서 Type 10으로 이 ID를 제출하면 진행 상태를 복구한다.

### 3.2 TeamFlag

| 값 | 이름 | 의미 |
|---:|---|---|
| 0 | `ALLY` | 아군 |
| 1 | `ENEMY` | 적군 |

스쿼드 ID는 팀별로 각각 0부터 발급된다. 따라서 스쿼드의 실제 키는 항상 `(teamFlag, squadID)`다.

`soldierID`는 스쿼드 내부 ID다. 병사의 키는 `(teamFlag, squadID, soldierID)`다. 병사가 다른 스쿼드로 편입되면 새 스쿼드의 `soldierID`를 받는다.

### 3.3 UnitType

| 값 | 이름 | 초기 HP | 기본 공격력 | 사정거리 | 이동속도 |
|---:|---|---:|---:|---:|---:|
| 0 | `ARCHER` | 100 | 10 | 150 | 20 |
| 1 | `WARRIOR` | 150 | 13 | 15 | 20 |
| 2 | `KNIGHT` | 200 | 15 | 20 | 20 |

공통 시야는 월드 거리 300이다. Type 6 지정 공격은 목표 스쿼드를 전역 범위에서 추적한다.

### 3.4 SoldierState

| 값 | 이름 | 클라이언트 표현 |
|---:|---|---|
| 0 | `IDLE` | 대기 |
| 1 | `MOVING` | 이동 |
| 2 | `CHASING` | 적 추적 |
| 3 | `ATTACKING` | 공격 |
| 4 | `DEAD` | 사망, HP도 0 |
| 5 | `HIT` | 피격 경직 |
| 6 | `FORMING` | 명시적 진형 정렬 |

### 3.5 Direction

Type 100의 `direction`은 `0..359`도 정수다. `0=+X`, `90=+Y`, `180=-X`, `270=-Y`이며 +Y 방향으로 각도가 증가한다. 이동 중에는 실제 이동 방향, 공격 중에는 목표 방향을 나타낸다.

### 3.6 CommandResult

| 값 | 이름 | 의미 |
|---:|---|---|
| 0 | `OK` | 성공 |
| -1 | `INVALID_PAYLOAD` | 길이, enum 또는 값이 잘못됨 |
| -2 | `NOT_OWNER` | 예약 값 |
| -3 | `NOT_FOUND` | 대상 ID가 없음 |
| -4 | `INVALID_STATE` | 현재 상태에서 실행할 수 없음 |
| -5 | `PATH_NOT_FOUND` | 이동 가능한 경로를 만들 수 없음 |
| -6 | `LIMIT_EXCEEDED` | 서버 자원 또는 수치 상한 초과 |

## 4. 패킷 목록

### Client → Server

| Type | 이름 | 전체 길이 | 기능 |
|---:|---|---:|---|
| 0 | `CREATE_SQUAD` | 32 | 스쿼드 생성 |
| 1 | `MOVE_SQUAD` | 24 | 목적지까지 일반 이동 |
| 2 | `ATTACK_SQUAD` | 16 | 시야 기반 자동 추적·공격 |
| 3 | `TRANSFER_SOLDIER` | 24 | 같은 팀의 다른 스쿼드로 편입 |
| 4 | `STOP_SQUAD` | 16 | 현재 위치에서 정지 |
| 5 | `SWAP_SOLDIER_POSITION` | 24 | 정지한 두 병사의 자리 교환 |
| 6 | `FOCUS_ATTACK` | 24 | 특정 적 스쿼드 집중 공격 |
| 7 | `SET_ATTACK_DAMAGE` | 24 | 특정 병사의 공격력을 지정 값으로 설정 |
| 8 | `MOVE_ENGAGE_ON_SIGHT` | 24 | 이동 중 시야에 적이 보이면 추적 전투 전환 |
| 9 | `MOVE_FIRE_IN_RANGE` | 24 | 이동 중 사정거리 안의 적만 공격하고 추적하지 않음 |
| 10 | `RESUME_SESSION` | 12 | 끊어진 논리 세션 재접속 |
| 11 | `SELECT_MAP` | 12 | 스테이지 시작 전 맵 선택 |
| 12 | `START_STAGE` | 8 | 선택 맵 확정. 자동 병력 생성 없음 |

### Server → Client

| Type | 이름 | 전체 길이 | 기능 |
|---:|---|---:|---|
| 100 | `SOLDIER_POSITIONS` | `12 + count × 32` | 모든 병사의 전체 authoritative snapshot |
| 101 | `WELCOME` | 24 | 프로토콜·세션·tick·복구시간 안내 |
| 102 | 예약 | 전송 안 함 | 공격은 Type 100 HP/state로 표현 |
| 103 | 예약 | 전송 안 함 | 사망은 Type 100 HP=0/state=4로 표현 |
| 104 | `COMMAND_RESULT` | 24 | 명령 결과 |
| 105 | `STAGE_STATE` | 20 | 승패 및 생존 수 |
| 106 | `MAP_INFO` | 28 | 선택된 맵 정보 |

## 5. Client → Server 상세

아래 표의 offset은 공통 헤더를 포함한 frame 시작 위치 기준이다.

### Type 0 — CREATE_SQUAD

| Offset | Field | 허용 값 / 의미 |
|---:|---|---|
| 0 | `pkt_type` | 0 |
| 4 | `pkt_len` | 32 |
| 8 | `archerCount` | 0 이상 |
| 12 | `warriorCount` | 0 이상 |
| 16 | `knightCount` | 0 이상 |
| 20 | `teamFlag` | 0 또는 1 |
| 24 | `spawnX` | 스쿼드 배치 중심 X |
| 28 | `spawnY` | 스쿼드 배치 중심 Y |

전체 인원은 `1..200`이다. 한 세션은 최대 128개 스쿼드, 2,000명이다. 좌표가 맵 밖이거나 차단 셀이면 실패한다. 성공 Type 104의 `teamFlag`와 `entityID`가 생성된 팀과 `squadID`다. JSON 스테이지에서는 START_STAGE 성공 후 이 패킷을 보내며, 클라이언트가 적군을 만들 때 `teamFlag=1`을 사용한다.

### Type 1 — MOVE_SQUAD

주의: 이 명령만 식별자 순서가 `squadID, teamFlag`다.

| Offset | Field | 의미 |
|---:|---|---|
| 0 | `pkt_type` | 1 |
| 4 | `pkt_len` | 24 |
| 8 | `squadID` | 이동할 스쿼드 |
| 12 | `teamFlag` | 스쿼드 팀 |
| 16 | `destX` | 목적지 X |
| 20 | `destY` | 목적지 Y |

JPS로 경로를 만들 수 없으면 `PATH_NOT_FOUND(-5)`다. 이동 중에는 느슨한 대형과 충돌 회피를 사용하며, 도착한다고 자동 진형 정렬하지 않는다.

### Type 2 — ATTACK_SQUAD

| Offset | Field | 의미 |
|---:|---|---|
| 0 | `pkt_type` | 2 |
| 4 | `pkt_len` | 16 |
| 8 | `squadID` | 명령 대상 |
| 12 | `teamFlag` | 대상 팀 |

각 병사는 시야 300 안의 가장 가까운 적을 찾고, 사정거리까지 추적한 뒤 공격한다.

### Type 3 — TRANSFER_SOLDIER

| Offset | Field | 의미 |
|---:|---|---|
| 0 | `pkt_type` | 3 |
| 4 | `pkt_len` | 24 |
| 8 | `teamFlag` | 병사와 두 스쿼드의 팀 |
| 12 | `soldierID` | 현재 스쿼드 안의 병사 ID |
| 16 | `currentSquadID` | 현재 스쿼드 |
| 20 | `nextSquadID` | 편입할 스쿼드 |

두 스쿼드는 같은 팀이어야 한다. 편입 후 병사는 새 스쿼드의 새 `soldierID`를 받고 그 스쿼드 쪽으로 이동한다. Type 104의 `entityID`는 `nextSquadID`다.

### Type 4 — STOP_SQUAD

| Offset | Field | 의미 |
|---:|---|---|
| 0 | `pkt_type` | 4 |
| 4 | `pkt_len` | 16 |
| 8 | `teamFlag` | 팀 |
| 12 | `squadID` | 정지할 스쿼드 |

이동, 추적, 공격 명령을 취소하고 현재 위치를 각 병사의 고정 위치로 삼는다.

### Type 5 — SWAP_SOLDIER_POSITION

| Offset | Field | 의미 |
|---:|---|---|
| 0 | `pkt_type` | 5 |
| 4 | `pkt_len` | 24 |
| 8 | `teamFlag` | 팀 |
| 12 | `squadID` | 스쿼드 |
| 16 | `firstSoldierID` | 첫 병사 |
| 20 | `secondSoldierID` | 둘째 병사 |

두 병사는 서로 달라야 하며, 해당 스쿼드의 생존 병사가 모두 STOP/IDLE일 때만 즉시 자리를 바꾼다.

### Type 6 — FOCUS_ATTACK

| Offset | Field | 의미 |
|---:|---|---|
| 0 | `pkt_type` | 6 |
| 4 | `pkt_len` | 24 |
| 8 | `ownTeamFlag` | 공격 측 팀 |
| 12 | `ownSquadID` | 공격 스쿼드 |
| 16 | `targetTeamFlag` | 목표 팀 |
| 20 | `targetSquadID` | 목표 스쿼드 |

공격 측과 목표는 다른 팀이어야 한다. 목표 스쿼드만 추적하며 목표가 사라지면 일반 상태로 돌아간다.

### Type 7 — SET_ATTACK_DAMAGE

| Offset | Field | 의미 |
|---:|---|---|
| 0 | `pkt_type` | 7 |
| 4 | `pkt_len` | 24 |
| 8 | `teamFlag` | 팀 |
| 12 | `squadID` | 스쿼드 |
| 16 | `soldierID` | 병사 |
| 20 | `attackDamage` | 새 공격력 `1..1,000,000` |

증가량이 아니라 최종 공격력 값으로 덮어쓴다.

### Type 8 — MOVE_ENGAGE_ON_SIGHT

| Offset | Field | 의미 |
|---:|---|---|
| 0 | `pkt_type` | 8 |
| 4 | `pkt_len` | 24 |
| 8 | `teamFlag` | 팀 |
| 12 | `squadID` | 스쿼드 |
| 16 | `destX` | 목적지 X |
| 20 | `destY` | 목적지 Y |

목적지로 이동하다 시야 300 안에서 적을 발견하면 기존 이동을 버리고 일반 추적·공격 모드로 전환한다.

### Type 9 — MOVE_FIRE_IN_RANGE

필드 배치는 Type 8과 같다. 이동 경로는 유지한다. 적이 현재 사정거리 안에 있을 때만 공격하며 타깃을 따라가지 않는다. 공격 쿨타임 중에는 원래 목적지로 계속 이동한다.

### Type 10 — RESUME_SESSION

| Offset | Field | 의미 |
|---:|---|---|
| 0 | `pkt_type` | 10 |
| 4 | `pkt_len` | 12 |
| 8 | `previousSessionID` | 복구할 기존 논리 세션 ID |

새 연결에서 다른 게임 명령보다 먼저 보내는 것을 권장한다. 성공하면 서버가 기존 세션 ID가 담긴 WELCOME, MAP_INFO, 성공 Type 104, 전체 snapshot, STAGE_STATE를 보낸다. 맵 선택과 START_STAGE 여부도 기존 GameInstance에 그대로 보존된다.

### Type 11 — SELECT_MAP

| Offset | Field | 의미 |
|---:|---|---|
| 0 | `pkt_type` | 11 |
| 4 | `pkt_len` | 12 |
| 8 | `mapID` | 서버에 등록된 0 이상 맵 ID |

성공하면 Type 104 뒤에 새 Type 106이 온다. START_STAGE 전이고 actor가 없으면 여러 번 변경할 수 있다. 없는 ID는 `NOT_FOUND(-3)`, 이미 시작했거나 actor가 있으면 `INVALID_STATE(-4)`다.

### Type 12 — START_STAGE

| Offset | Field | 의미 |
|---:|---|---|
| 0 | `pkt_type` | 12 |
| 4 | `pkt_len` | 8 |

payload가 없는 헤더 전용 패킷이다. 선택된 정적 Grid를 확정하고 더 이상 SELECT_MAP으로 바꾸지 못하게 잠근다. 맵 파일에서는 스쿼드나 Soldier를 생성하지 않는다. 성공 Type 104의 `entityID`는 확정된 `mapID`다. 서버는 성공 직후 현재 Type 100 전체 snapshot과 Type 105를 즉시 보낸다. 아직 CREATE_SQUAD를 보내지 않았다면 이 snapshot의 `soldierCount`는 0이다.

성공 뒤 클라이언트는 Type 0을 필요한 횟수만큼 보낸다. 적군 생성은 Type 0의 `teamFlag=1(ENEMY)`, 아군 생성은 `teamFlag=0(ALLY)`를 사용한다. `spawnX`, `spawnY`가 맵의 벽 셀이면 서버는 `INVALID_PAYLOAD(-1)`로 거부한다.

다음 경우 `INVALID_STATE(-4)`다.

- 이미 START_STAGE가 성공함
- CREATE 등으로 actor가 이미 존재함
- 스테이지가 WAITING 상태가 아님

## 6. Server → Client 상세

### Type 100 — SOLDIER_POSITIONS

Header 다음 `soldierCount`가 있고, 이어서 32바이트 record가 그 수만큼 반복된다.

| Offset | Field | 의미 |
|---:|---|---|
| 0 | `pkt_type` | 100 |
| 4 | `pkt_len` | `12 + soldierCount × 32` |
| 8 | `soldierCount` | 이번 전체 snapshot의 병사 수 |

각 record의 시작을 `base = 12 + index × 32`로 계산한다.

| Record offset | Field | 의미 |
|---:|---|---|
| +0 | `squadID` | 현재 스쿼드 ID |
| +4 | `soldierID` | 현재 스쿼드 내부 ID |
| +8 | `teamFlag` | 0 아군, 1 적군 |
| +12 | `posX` | 월드 X |
| +16 | `posY` | 월드 Y |
| +20 | `HP` | 현재 체력, 사망은 0 |
| +24 | `state` | SoldierState |
| +28 | `direction` | 0..359도 |

매 packet은 전체 상태다. delta가 아니므로 클라이언트는 이전 목록을 이 snapshot으로 교체할 수 있다. Type 102·103은 오지 않는다.

현재 Type 100에는 `unitType`과 영구적인 전역 `unitID`가 없다. 클라이언트가 병종 모델을 유지해야 한다면 CREATE나 맵 에셋을 기준으로 별도 메타데이터를 관리해야 한다.

### Type 101 — WELCOME

| Offset | Field | 현재 값 / 의미 |
|---:|---|---|
| 0 | `pkt_type` | 101 |
| 4 | `pkt_len` | 24 |
| 8 | `protocolVersion` | 15 |
| 12 | `sessionID` | 논리 게임 세션 ID |
| 16 | `serverTickMs` | 20 |
| 20 | `reconnectTimeoutMs` | 기본 300000 |

마지막 값은 5분을 밀리초로 표현한 세션 보존 시간이다. 서버 환경설정에 따라 달라질 수 있으므로 고정값으로 가정하지 말고 수신 값을 사용한다.

### Type 104 — COMMAND_RESULT

| Offset | Field | 의미 |
|---:|---|---|
| 0 | `pkt_type` | 104 |
| 4 | `pkt_len` | 24 |
| 8 | `requestPacketType` | 결과가 대응하는 Type 0..12 |
| 12 | `resultCode` | 0 또는 음수 결과 코드 |
| 16 | `teamFlag` | 관련 팀, 없으면 -1 |
| 20 | `entityID` | 관련 squadID/sessionID/mapID, 없으면 -1 |

Type 104는 명령 결과이므로 Type 100과 별도로 반드시 분기해서 처리한다.

### Type 105 — STAGE_STATE

| Offset | Field | 의미 |
|---:|---|---|
| 0 | `pkt_type` | 105 |
| 4 | `pkt_len` | 20 |
| 8 | `stageState` | 아래 enum |
| 12 | `aliveAllyCount` | 생존 아군 수 |
| 16 | `aliveEnemyCount` | 생존 적군 수 |

| 값 | 이름 |
|---:|---|
| 0 | `WAITING` |
| 1 | `RUNNING` |
| 2 | `ALLY_WIN` |
| 3 | `ENEMY_WIN` |
| 4 | `DRAW` |

양 팀에 생존 병사가 한 명 이상 생기면 RUNNING으로 전환된다. 전투가 시작된 뒤 한쪽이 전멸하면 승패가 확정된다.

### Type 106 — MAP_INFO

| Offset | Field | 의미 |
|---:|---|---|
| 0 | `pkt_type` | 106 |
| 4 | `pkt_len` | 28 |
| 8 | `mapID` | 현재 선택된 서버 맵 ID |
| 12 | `mapVersion` | 맵 에셋/서버 데이터 정합성 버전 |
| 16 | `worldWidth` | 월드 너비 |
| 20 | `worldHeight` | 월드 높이 |
| 24 | `gridCellSize` | 서버 Navigation Grid 셀 크기 |

현재 외부 JSON 맵 ID는 `1`, `2`, `3`이고 `mapVersion=1`, 크기는 6400×3200, 셀 크기는 10이다. ID 0은 장애물이 없는 서버 내장 sandbox 맵이며 역시 `mapVersion=1`이다. 서버는 전체 Grid를 네트워크로 보내지 않는다. 클라이언트는 `(mapID, mapVersion)`에 대응하는 렌더링용 맵 에셋을 자체 보유해야 한다.

## 7. JSON 맵과 클라이언트의 관계

서버 맵 파일은 지형과 Navigation Grid만 관리한다.

- `maps/Map_001_map_640x320.json` → `mapID=1`
- `maps/Map_002_map_640x320.json` → `mapID=2`
- `maps/Map_003_map_640x320.json` → `mapID=3`
- `data[row][column]`: `0=FLOOR`, `1=WALL`
- 적군/아군 스쿼드 정보: 맵 파일에 없음

클라이언트는 맵 선택 시 mapID만 보내고 Type 106의 mapVersion을 확인한 뒤 같은 버전의 시각 에셋을 표시한다. `START_STAGE` 성공 후 클라이언트가 보유한 스테이지 구성에 따라 Type 0을 보내 적군과 아군을 생성한다. 생성 요청의 최종 `squadID`, `soldierID`, 위치는 Type 104와 Type 100이 authoritative하다.

JSON의 `rowDirection`은 `-Z`다. 서버의 2D `posY`는 클라이언트 3D 공간의 `-Z`에 대응한다. 즉 서버 `gridY=row`, `posY=row*10+cellLocalY`이며, 3D 렌더러에서 사용할 때는 일반적으로 `worldZ=-posY`로 변환한다. `posX`는 그대로 X축이다.

서버 맵 제작 형식은 [SERVER_MAP_DATA_V15.md](./SERVER_MAP_DATA_V15.md)에 정리되어 있다.

## 8. 구현 시 주의사항

- 반드시 binary frame으로 송수신한다.
- 모든 필드는 little-endian 4바이트 정수다.
- `pkt_len`을 payload 길이가 아니라 헤더 포함 전체 길이로 기록한다.
- Type별 정확한 길이만 허용된다. 특히 START_STAGE는 정확히 8바이트다.
- 스쿼드를 찾을 때 `squadID`만 사용하지 말고 `teamFlag`와 묶는다.
- Type 100은 전체 snapshot이며 매번 배열을 교체해도 된다.
- Type 102와 103을 기다리지 않는다.
- WELCOME의 protocolVersion이 15가 아니면 명령을 보내지 않고 버전 불일치를 표시한다.
- reconnectTimeoutMs는 밀리초 단위이며 서버가 알려준 값을 사용한다.
