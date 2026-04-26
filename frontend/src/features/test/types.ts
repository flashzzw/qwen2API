export type ChatMessage = {
  role: string
  content: string
  reasoning?: string
  error?: boolean
}

export type ModelListResponse = {
  data?: Array<{ id?: string }>
}

export type ChatCompletionPayload = {
  model: string
  messages: ChatMessage[]
  stream: boolean
}

export type ChatCompletionResponse = {
  error?: string
  choices?: Array<{ message?: ChatMessage; delta?: { content?: string; reasoning_content?: string } }>
}

export type StreamDelta = {
  content: string
  reasoning: string
  error?: string
}
