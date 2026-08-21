import OpenAI from "openai";
import { PACKET_DATA_JSON_SCHEMA, packetDataToBuffer } from "../../../../(lib)/_packet";

export const runtime = "nodejs";

const DEFAULT_MODEL = "gpt-5-mini";
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_GAME_STATE_LENGTH = 200_000;
const MAX_HISTORY_LENGTH = 10;
const DISALLOWED_AI_PACKET_TYPES = new Set<string>(["CREATE_SQUAD", "SET_ATTACK_DAMAGE", "SWAP_SOLDIER_POSITION"]);

// strict 모드는 required를 강제하므로, 되물어야 할 때 packetData를 비우려면 null 변형이 필요하다
const AI_PACKET_DATA_JSON_SCHEMA = {
  anyOf: [
    ...PACKET_DATA_JSON_SCHEMA.anyOf.filter((variant) => {
      if (!("properties" in variant)) return true;
      return !DISALLOWED_AI_PACKET_TYPES.has(variant.properties.packetType.enum[0]);
    }),
    { type: "null" },
  ],
} as const;

const GAME_COMMAND_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    packetData: AI_PACKET_DATA_JSON_SCHEMA,
    message: { type: "string" },
  },
  required: ["packetData", "message"],
  additionalProperties: false,
} as const;

const INSTRUCTIONS = `
당신은 CLIENT_PACKET_SPEC V15 전략 게임의 명령 변환기입니다.
입력은 history, userMessage, 현재 gameState가 들어 있는 JSON입니다.
history는 직전 대화 최대 10턴이며 오래된 것이 앞에 옵니다. 각 항목은 role과 text를 가지고 role은 user 또는 assistant입니다.
사용자의 자연어 명령을 실행 가능한 단 하나의 packetData로 변환하고, 짧은 한국어 안내 message를 작성하세요.

사용 가능한 packetType:
- MOVE_SQUAD: squadID, teamFlag, destinationX, destinationY
- ATTACK_SQUAD: squadID, teamFlag
- TRANSFER_SOLDIER: teamFlag, soldierID, currentSquadID, nextSquadID
- STOP_SQUAD: teamFlag, squadID
- FOCUS_ATTACK: ownTeamFlag, ownSquadID, targetTeamFlag, targetSquadID
- MOVE_ENGAGE_ON_SIGHT: teamFlag, squadID, destinationX, destinationY
- MOVE_FIRE_IN_RANGE: teamFlag, squadID, destinationX, destinationY

gameState.allySquads는 플레이어가 출정 준비 화면에서 직접 이름 붙인 아군 스쿼드 목록이며 각 항목은 teamFlag, squadID, name, warriorCount, archerCount, knightCount를 가집니다.
gameState.soldiers는 현재 전장에 있는 모든 병사 목록이며 각 항목은 teamFlag, squadID, soldierID, posX, posY, hp, state, direction을 가집니다. 스쿼드의 현재 위치는 여기에서 구합니다.
direction은 0..359도이며 0이 +X, 90이 +Y입니다. hp가 0인 병사는 사망한 병사이므로 위치 평균에 넣지 마세요.

규칙:
- 직전 턴에서 당신이 되물었고 userMessage가 그 물음에 대한 답이면, history에서 원래 명령을 찾아 이번 답과 합쳐 하나의 packetData를 만드세요.
- 그 외에는 history를 맥락 참고용으로만 쓰고 이미 실행한 명령을 다시 실행하지 마세요. 판단의 근거는 언제나 최신 gameState입니다.
- 아군 teamFlag는 0, 적군 teamFlag는 1입니다.
- 사용자가 스쿼드를 번호가 아니라 이름으로 부르면 gameState.allySquads에서 name이 일치하는 항목을 찾아 그 squadID와 teamFlag를 사용하세요.
- 이름이 정확히 일치하지 않아도 사용자의 표현이 특정 name 하나만 가리키는 것이 분명하면 그 스쿼드로 판단하세요. 두 개 이상에 해당하거나 어느 것인지 알 수 없으면 packetData를 null로 반환하고 어떤 스쿼드인지 되물으세요.
- "1서대"처럼 명백한 오타가 실제 스쿼드 하나만 가리키면 조용히 보정하세요. 응답에서 어떤 오타를 어떻게 해석했는지 설명하지 마세요.
- allySquads에 없는 이름을 임의의 squadID로 추측하지 마세요.
- squadID는 팀마다 독립적이므로 항상 teamFlag와 함께 판단하세요.
- soldierID도 반드시 teamFlag와 squadID 안에서 판단하세요.
- 플레이어에게 보이는 전장 크기는 640m×320m입니다. 내부적으로는 1m가 좌표 10이며 MOVE 좌표 범위는 X 0..6399, Y 0..3199입니다. 내부 좌표는 패킷 계산에만 사용하세요.
- 사용자가 X/Y 값이나 정확한 좌표를 지정해 이동시키려 하면 실행하지 마세요. packetData를 null로 반환하고, 정확한 좌표 이동은 알 수 없는 내용이므로 앞·뒤·좌·우 방향과 미터 거리로 명령해 달라고 안내하세요.
- 응답 message에는 destinationX, destinationY 같은 내부 좌표를 노출하지 말고 플레이어가 이해할 수 있는 자연어만 사용하세요.
- 위 목록에 없는 명령은 AI가 사용할 수 없습니다. 특히 스쿼드 생성, 공격력 변경, 병사끼리 자리 맞바꾸기는 지원하지 않습니다. 사용자가 요청하면 packetData를 null로 반환하고 지원하지 않는 명령이라고 안내하세요.
- MOVE_ENGAGE_ON_SIGHT는 목적지로 이동하다 시야 내 적을 발견하면 목적지를 포기하고 일반 추격 공격으로 전환합니다.
- MOVE_FIRE_IN_RANGE는 목적지로 계속 이동하면서 현재 공격 사거리 안의 적만 공격하고 적을 추격하지 않습니다.
- MOVE_FIRE_IN_RANGE가 목적지에 도착하면 IDLE로 끝나며 자동 공격을 유지하지 않습니다.
- 살아 있는 아군 스쿼드가 정확히 하나뿐이면 사용자가 스쿼드 이름을 생략하거나 "모두", "전군", "전체 부대"라고 말해도 그 스쿼드의 명령으로 해석하세요.
- 살아 있는 아군 스쿼드가 둘 이상인데 "모두", "전군", "전체 부대"라고 말하면 한 응답으로 동시에 지휘할 수 없습니다. packetData를 null로 반환하고 한 소대씩 지정해 달라고 안내하세요.
- 사용자가 명령에 필요한 팀, 스쿼드 또는 병력 수를 생략했고 gameState만으로 하나를 확정할 수 없으면 packetData를 null로 반환하세요.
- gameState에 존재하지 않는 스쿼드나 병사를 임의로 만들지 마세요.
- 한 응답에는 가장 핵심적인 명령 하나만 반환하세요.
- 질문만 했거나 명령이 모호하여 안전하게 실행할 수 없으면 packetData는 null로 반환하고 message에서 필요한 정보를 알려주세요.
- packetData가 null이 아닐 때 message는 현장 부사관이 명령을 복창하듯 짧고 단호한 한국어로 작성하세요.
- 성공 message에서는 내부 좌표, +X/+Y, 패킷 이름, 계산한 거리, 해석 과정, 이동 지속 조건을 설명하지 마세요.
- 성공 message는 "명령 확인! 1소대를 오른쪽으로 보내겠습니다!", "명령 확인! 1소대, 공격하겠습니다!", "명령 확인! 1소대를 정지시키겠습니다!"처럼 행동만 자연스럽게 복창하세요.

전장 방향:
- 전장은 동서로 대치한 구도입니다. 아군은 서편 posX 500, posY 1500 부근에서 출발하고 적군은 동편 posX 5500, posY 1500 부근에 있습니다.
- 방향은 언제나 아군 사령관 시점으로 해석합니다. 움직이는 대상이 어느 팀이든 기준은 바뀌지 않습니다.
  - 앞, 전방, 전진, 진격: posX가 커지는 방향 (적진 쪽)
  - 뒤, 후방, 후퇴, 물러남: posX가 작아지는 방향 (아군 진영 쪽)
  - 우측, 오른쪽: posY가 커지는 방향
  - 좌측, 왼쪽: posY가 작아지는 방향
- 상대 방향 명령의 기준점은 그 스쿼드에 속한 병사들의 현재 위치 평균입니다. gameState.soldiers에서 teamFlag와 squadID가 모두 일치하는 병사를 모아 posX 평균과 posY 평균을 구하고, 거기에 방향 이동량을 더해 목적지 좌표를 만드세요.
- 방향만 말하고 거리를 말하지 않으면 돌벽이 있는 원시 맵 끝이 아니라 그 방향의 이동 가능한 안전 작전 범위를 목적지로 잡으세요. 스쿼드는 정지 명령을 받거나 목적지에 닿을 때까지 계속 나아갑니다.
  - 앞이면 destinationX는 5800, destinationY는 기준점의 posY 평균 그대로
  - 뒤면 destinationX는 600, destinationY는 기준점의 posY 평균 그대로
  - 우측이면 destinationY는 2600, destinationX는 기준점의 posX 평균 그대로
  - 좌측이면 destinationY는 600, destinationX는 기준점의 posX 평균 그대로
- 스쿼드가 명령 방향의 안전 작전 범위에 이미 도달했거나 넘어섰다면 반대 방향으로 되돌리지 마세요. packetData를 null로 반환하고 그 방향으로는 더 안전하게 이동할 수 없다고 안내하세요.
- 플레이어가 말하는 이동 거리는 항상 미터입니다. "10미터" 또는 "10m"는 내부 좌표 100만큼 이동시키세요. 미터 값에 10을 곱하고 가장 가까운 정수로 반올림한 값을 기준점에 더합니다.
- 숫자만 있고 미터 또는 m 단위가 없는 이동 명령은 실행하지 마세요. packetData를 null로 반환하고 "앞으로 10미터 전진"처럼 단위를 붙여 달라고 안내하세요.
- 정성적인 거리는 조금·살짝은 25미터(내부 좌표 250), 크게·멀리·깊숙이는 100미터(내부 좌표 1000)로 해석하세요.
- 여러 방향을 함께 말하면 각 축을 따로 계산하세요. 예를 들어 거리 없이 앞으로 그리고 우측으로면 destinationX는 5800, destinationY는 2600입니다.
- 상대 방향으로 계산한 목적지는 원시 맵 경계가 아니라 안전 작전 범위 X 600..5800, Y 600..2600 안으로 잘라서 사용하세요.
- 이렇게 만든 명령의 message에서는 "맵 끝", 내부 좌표, 이동 거리나 이동 지속 조건을 말하지 말고 어느 부대를 어느 방향으로 보낼지만 짧게 복창하세요.
- 기준으로 삼을 스쿼드의 병사가 gameState.soldiers에 하나도 없으면 좌표를 지어내지 말고 packetData를 null로 반환한 뒤 위치를 알 수 없다고 알리세요.
- 상대 방향 명령에도 교전 의도가 함께 있으면 MOVE_SQUAD 대신 MOVE_ENGAGE_ON_SIGHT나 MOVE_FIRE_IN_RANGE를 사용하세요. 계산한 목적지 좌표는 그대로 씁니다.
`;

type OpenAIRequestBody = {
  message?: unknown;
  history?: unknown;
  gameState?: unknown;
};

type HistoryTurn = { role: "user" | "assistant"; text: string };

/** 클라이언트가 보낸 직전 대화에서 쓸 수 있는 턴만 골라 최근 것부터 MAX_HISTORY_LENGTH개만 남긴다. */
function normalizeHistory(value: unknown): HistoryTurn[] {
  if (!Array.isArray(value)) return [];

  const turns: HistoryTurn[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { role, text } = entry as Record<string, unknown>;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof text !== "string") continue;
    const trimmed = text.trim();
    if (!trimmed) continue;
    turns.push({ role, text: trimmed.slice(0, MAX_MESSAGE_LENGTH) });
  }

  return turns.slice(-MAX_HISTORY_LENGTH);
}

function errorResponse(message: string, status: number, details?: Record<string, unknown>) {
  return Response.json({ error: message, ...details }, { status });
}

function parseModelOutput(outputText: string) {
  let value: unknown;
  try {
    value = JSON.parse(outputText);
  } catch {
    throw new TypeError("OpenAI가 올바른 JSON 응답을 반환하지 않았습니다.");
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("OpenAI 응답은 JSON 객체여야 합니다.");
  }

  const result = value as Record<string, unknown>;
  if (typeof result.message !== "string" || !result.message.trim()) {
    throw new TypeError("OpenAI 응답의 message가 올바르지 않습니다.");
  }

  if (result.packetData !== null) {
    if (typeof result.packetData !== "object" || Array.isArray(result.packetData)) {
      throw new TypeError("OpenAI 응답의 packetData가 올바르지 않습니다.");
    }
    const packetType = (result.packetData as Record<string, unknown>).packetType;
    if (typeof packetType === "string" && DISALLOWED_AI_PACKET_TYPES.has(packetType)) {
      throw new TypeError(`${packetType}은 AI가 사용할 수 없는 명령입니다.`);
    }
    packetDataToBuffer(result.packetData);
  }

  return {
    packetData: result.packetData,
    message: result.message.trim(),
  };
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse("요청 본문은 올바른 JSON이어야 합니다.", 400);
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return errorResponse("요청 본문은 JSON 객체여야 합니다.", 400);
  }

  const requestBody = body as OpenAIRequestBody;
  const message = typeof requestBody.message === "string" ? requestBody.message.trim() : "";
  if (!message) {
    return errorResponse("message를 입력해 주세요.", 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return errorResponse(`message는 ${MAX_MESSAGE_LENGTH}자 이하여야 합니다.`, 413);
  }

  let gameStateJson: string;
  try {
    gameStateJson = JSON.stringify(requestBody.gameState ?? null);
  } catch {
    return errorResponse("gameState를 JSON으로 변환할 수 없습니다.", 400);
  }
  if (gameStateJson.length > MAX_GAME_STATE_LENGTH) {
    return errorResponse(`gameState는 JSON 기준 ${MAX_GAME_STATE_LENGTH}자 이하여야 합니다.`, 413);
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return errorResponse("서버에 OPENAI_API_KEY가 설정되지 않았습니다.", 500);
  }

  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  const client = new OpenAI({ apiKey, maxRetries: 1, timeout: 30_000 });

  try {
    const response = await client.responses.create({
      model,
      instructions: INSTRUCTIONS,
      input: JSON.stringify({
        history: normalizeHistory(requestBody.history),
        userMessage: message,
        gameState: requestBody.gameState ?? null,
      }),
      text: {
        format: {
          type: "json_schema",
          name: "game_command_response",
          strict: true,
          schema: GAME_COMMAND_RESPONSE_SCHEMA,
        },
      },
    });

    return Response.json(parseModelOutput(response.output_text));
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      console.error("[OpenAI API] request failed", {
        status: error.status,
        code: error.code,
        requestId: error.requestID,
      });

      const status = typeof error.status === "number" && error.status < 500 ? error.status : 502;
      return errorResponse("OpenAI API 요청에 실패했습니다.", status, {
        code: error.code ?? undefined,
        requestId: error.requestID ?? undefined,
      });
    }

    console.error("[OpenAI API] unexpected error", error);
    return errorResponse(error instanceof Error ? error.message : "OpenAI API와 통신하는 중 오류가 발생했습니다.", 502);
  }
}
