const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

const SYSTEM_PROMPT = `You are a command parser for a game.
Interpret the user's message as a game command and respond with ONLY a JSON object in this exact shape:
{
  "action": string,  // the action to perform, e.g. "move", "attack", "stop"
  "posx": number,    // target x position (0 if not applicable)
  "posy": number,    // target y position (0 if not applicable)
  "message": string  // a short Korean sentence describing the command you understood and executed
}
If the message is not a game command you can understand, respond with { "action": "none", "posx": -1, "posy": -1, "message": "이해할 수 없는 명령입니다." }.
Do not include any text outside the JSON object.`

const DEFAULT_PROMPT = 'stop'

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return Response.json(
      { error: 'OPENAI_API_KEY is not set' },
      { status: 500 }
    )
  }

  let prompt = DEFAULT_PROMPT
  try {
    const body = await request.json()
    if (typeof body?.prompt === 'string' && body.prompt.trim()) {
      prompt = body.prompt
    }
  } catch {
    // no body or invalid JSON — fall back to the default prompt
  }

  const res = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  })

  if (!res.ok) {
    const detail = await res.text()
    return Response.json(
      { error: 'OpenAI request failed', detail },
      { status: res.status }
    )
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content ?? ''

  let command: { action: string; posx: number; posy: number; message: string }
  try {
    const parsed = JSON.parse(content)
    command = {
      action: typeof parsed.action === 'string' ? parsed.action : 'none',
      posx: typeof parsed.posx === 'number' ? parsed.posx : -1,
      posy: typeof parsed.posy === 'number' ? parsed.posy : -1,
      message:
        typeof parsed.message === 'string'
          ? parsed.message
          : '이해할 수 없는 명령입니다.',
    }
  } catch {
    return Response.json(
      { error: 'Failed to parse model output', raw: content },
      { status: 502 }
    )
  }

  return Response.json(command)
}
