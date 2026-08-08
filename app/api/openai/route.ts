import OpenAI from "openai";
import { PACKET_DATA_JSON_SCHEMA, packetDataToBuffer } from "../../(lib)/_packet";

export const runtime = "nodejs";

const DEFAULT_MODEL = "gpt-5-nano";
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_GAME_STATE_LENGTH = 200_000;

const GAME_COMMAND_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    packetData: PACKET_DATA_JSON_SCHEMA,
    message: { type: "string" },
  },
  required: ["packetData", "message"],
  additionalProperties: false,
} as const;

const INSTRUCTIONS = `
당신은 CLIENT_PACKET_SPEC V9 전략 게임의 명령 변환기입니다.
입력은 userMessage와 현재 gameState가 들어 있는 JSON입니다.
사용자의 자연어 명령을 실행 가능한 단 하나의 packetData로 변환하고, 짧은 한국어 안내 message를 작성하세요.

사용 가능한 packetType:
- CREATE_SQUAD: archerCount, warriorCount, knightCount, teamFlag, spawnX, spawnY
- MOVE_SQUAD: squadID, teamFlag, destinationX, destinationY
- ATTACK_SQUAD: squadID, teamFlag
- TRANSFER_SOLDIER: teamFlag, soldierID, currentSquadID, nextSquadID
- STOP_SQUAD: teamFlag, squadID
- SWAP_SOLDIER_POSITION: teamFlag, squadID, firstSoldierID, secondSoldierID
- FOCUS_ATTACK: ownTeamFlag, ownSquadID, targetTeamFlag, targetSquadID
- SET_ATTACK_DAMAGE: teamFlag, squadID, soldierID, attackDamage

규칙:
- 아군 teamFlag는 0, 적군 teamFlag는 1입니다.
- squadID는 팀마다 독립적이므로 항상 teamFlag와 함께 판단하세요.
- soldierID도 반드시 teamFlag와 squadID 안에서 판단하세요.
- 맵 크기는 6400×3200이고 MOVE 좌표 범위는 X 0..6399, Y 0..3199입니다. 음수와 X=6400, Y=3200은 좌표로 사용할 수 없습니다.
- CREATE 좌표 범위는 X 4..6395, Y 4..3195이고 전체 병력은 1..200명입니다.
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
