import OpenAI from "openai";
import { PACKET_DATA_JSON_SCHEMA, packetDataToBuffer } from "../../(lib)/_packet";

export const runtime = "nodejs";

const DEFAULT_MODEL = "gpt-5-mini";
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_GAME_STATE_LENGTH = 200_000;
const DISALLOWED_AI_PACKET_TYPES = new Set<string>(["CREATE_SQUAD", "SET_ATTACK_DAMAGE"]);

const AI_PACKET_DATA_JSON_SCHEMA = {
  anyOf: PACKET_DATA_JSON_SCHEMA.anyOf.filter((variant) => {
    if (!("properties" in variant)) return true;
    return !DISALLOWED_AI_PACKET_TYPES.has(variant.properties.packetType.enum[0]);
  }),
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
당신은 CLIENT_PACKET_SPEC V11 전략 게임의 명령 변환기입니다.
입력은 userMessage와 현재 gameState가 들어 있는 JSON입니다.
사용자의 자연어 명령을 실행 가능한 단 하나의 packetData로 변환하고, 짧은 한국어 안내 message를 작성하세요.

사용 가능한 packetType:
- MOVE_SQUAD: squadID, teamFlag, destinationX, destinationY
- ATTACK_SQUAD: squadID, teamFlag
- TRANSFER_SOLDIER: teamFlag, soldierID, currentSquadID, nextSquadID
- STOP_SQUAD: teamFlag, squadID
- SWAP_SOLDIER_POSITION: teamFlag, squadID, firstSoldierID, secondSoldierID
- FOCUS_ATTACK: ownTeamFlag, ownSquadID, targetTeamFlag, targetSquadID
- MOVE_ENGAGE_ON_SIGHT: teamFlag, squadID, destinationX, destinationY
- MOVE_FIRE_IN_RANGE: teamFlag, squadID, destinationX, destinationY

gameState.allySquads는 플레이어가 출정 준비 화면에서 직접 이름 붙인 아군 스쿼드 목록이며 각 항목은 teamFlag, squadID, name, warriorCount, archerCount, knightCount를 가집니다.

규칙:
- 아군 teamFlag는 0, 적군 teamFlag는 1입니다.
- 사용자가 스쿼드를 번호가 아니라 이름으로 부르면 gameState.allySquads에서 name이 일치하는 항목을 찾아 그 squadID와 teamFlag를 사용하세요.
- 이름이 정확히 일치하지 않아도 사용자의 표현이 특정 name 하나만 가리키는 것이 분명하면 그 스쿼드로 판단하세요. 두 개 이상에 해당하거나 어느 것인지 알 수 없으면 packetData를 null로 반환하고 어떤 스쿼드인지 되물으세요.
- allySquads에 없는 이름을 임의의 squadID로 추측하지 마세요.
- squadID는 팀마다 독립적이므로 항상 teamFlag와 함께 판단하세요.
- soldierID도 반드시 teamFlag와 squadID 안에서 판단하세요.
- 맵 크기는 6400×3200이고 MOVE 좌표 범위는 X 0..6399, Y 0..3199입니다. 음수와 X=6400, Y=3200은 좌표로 사용할 수 없습니다.
- CREATE_SQUAD와 SET_ATTACK_DAMAGE는 AI가 사용할 수 없습니다. 사용자가 요청하면 packetData를 null로 반환하고 지원하지 않는 명령이라고 안내하세요.
- MOVE_ENGAGE_ON_SIGHT는 목적지로 이동하다 시야 내 적을 발견하면 목적지를 포기하고 일반 추격 공격으로 전환합니다.
- MOVE_FIRE_IN_RANGE는 목적지로 계속 이동하면서 현재 공격 사거리 안의 적만 공격하고 적을 추격하지 않습니다.
- MOVE_FIRE_IN_RANGE가 목적지에 도착하면 IDLE로 끝나며 자동 공격을 유지하지 않습니다.
- 사용자가 명령에 필요한 팀, 스쿼드, 병력 수 또는 좌표를 생략했고 gameState만으로 하나를 확정할 수 없으면 packetData를 null로 반환하세요.
- gameState에 존재하지 않는 스쿼드나 병사를 임의로 만들지 마세요.
- 한 응답에는 가장 핵심적인 명령 하나만 반환하세요.
- 질문만 했거나 명령이 모호하여 안전하게 실행할 수 없으면 packetData는 null로 반환하고 message에서 필요한 정보를 알려주세요.
- packetData가 null이 아닐 때 message에는 생성한 명령을 간결하게 설명하세요.
`;

type OpenAIRequestBody = {
  message?: unknown;
  gameState?: unknown;
};

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
