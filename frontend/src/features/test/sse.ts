import type { StreamDelta } from "./types"

export function parseStreamLine(rawLine: string): StreamDelta | null {
  const line = rawLine.trim()
  if (!line || line.startsWith(":") || line === "data: [DONE]" || !line.startsWith("data: ")) {
    return null
  }

  try {
    const payload = JSON.parse(line.slice(6))
    if (payload.error) return { content: "", reasoning: "", error: String(payload.error) }
    return {
      content: payload.choices?.[0]?.delta?.content ?? "",
      reasoning: payload.choices?.[0]?.delta?.reasoning_content ?? "",
    }
  } catch {
    return null
  }
}
