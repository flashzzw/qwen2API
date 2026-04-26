import { API_BASE } from "../../lib/api"
import { authFetch } from "../../lib/auth"
import type { ImageApiResponse } from "./types"

export type GenerateImagesPayload = {
  prompt: string
  n: number
  size: string
}

export async function generateImages(payload: GenerateImagesPayload) {
  const response = await authFetch(`${API_BASE}/v1/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: payload.prompt,
      n: payload.n,
      size: payload.size,
      response_format: "url",
    }),
  })
  const data = (await response.json()) as ImageApiResponse
  if (!response.ok) {
    throw new Error(String(data?.detail || data?.error || `HTTP ${response.status}`))
  }
  return data
}
