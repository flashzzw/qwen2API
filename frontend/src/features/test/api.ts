import { API_BASE } from "../../lib/api"
import { authFetch } from "../../lib/auth"
import type { ChatCompletionPayload, ChatCompletionResponse, ModelListResponse } from "./types"

export async function listModels() {
  const response = await authFetch(`${API_BASE}/v1/models`)
  if (!response.ok) return []
  const payload = (await response.json()) as ModelListResponse
  return (payload.data || [])
    .map(model => model.id)
    .filter((id: unknown): id is string => typeof id === "string" && !!id)
}

export async function createChatCompletion(payload: ChatCompletionPayload) {
  const response = await authFetch(`${API_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  return response
}

export async function createNonStreamingCompletion(payload: ChatCompletionPayload) {
  const response = await createChatCompletion({ ...payload, stream: false })
  return (await response.json()) as ChatCompletionResponse
}
