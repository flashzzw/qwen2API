import { useEffect, useRef, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { toast } from "sonner"
import { createChatCompletion, createNonStreamingCompletion, listModels } from "./api"
import { parseStreamLine } from "./sse"
import type { ChatMessage, StreamDelta } from "./types"

const DEFAULT_MODEL = "qwen3.6-plus"
const EMPTY_RESPONSE_MESSAGE = "❌ 响应为空（账号可能未激活或无可用账号）"

function appendAssistantDelta(messages: ChatMessage[], delta: StreamDelta) {
  const next = [...messages]
  const last = next[next.length - 1]
  next[next.length - 1] = {
    ...last,
    content: last.content + delta.content,
    reasoning: (last.reasoning || "") + delta.reasoning,
  }
  return next
}

function replaceLastAssistant(messages: ChatMessage[], message: ChatMessage) {
  const next = [...messages]
  next[next.length - 1] = message
  return next
}

export function useChatTester() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [availableModels, setAvailableModels] = useState<string[]>([DEFAULT_MODEL])
  const [stream, setStream] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    listModels().then(ids => {
      if (!ids.length) return
      setAvailableModels(ids)
      setModel(current => ids.includes(current) ? current : ids[0])
    })
  }, [])

  const clearMessages = () => setMessages([])
  const toggleStream = () => setStream(value => !value)

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMessage = { role: "user", content: input }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setInput("")
    setLoading(true)

    try {
      if (stream) await sendStreaming(model, nextMessages, setMessages)
      else await sendNonStreaming(model, nextMessages, setMessages)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "未知错误"
      toast.error(`网络错误: ${message}`)
      setMessages(prev => [...prev, { role: "assistant", content: `❌ 网络错误: ${message}`, error: true }])
    } finally {
      setLoading(false)
    }
  }

  return {
    messages,
    input,
    loading,
    model,
    availableModels,
    stream,
    bottomRef,
    setInput,
    setModel,
    toggleStream,
    clearMessages,
    sendMessage,
  }
}

async function sendNonStreaming(
  model: string,
  messages: ChatMessage[],
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>,
) {
  const data = await createNonStreamingCompletion({ model, messages, stream: false })
  if (data.error) {
    setMessages(prev => [...prev, { role: "assistant", content: `❌ ${data.error}`, error: true }])
  } else if (data.choices?.[0]?.message) {
    setMessages(prev => [...prev, data.choices![0].message!])
  } else {
    setMessages(prev => [...prev, { role: "assistant", content: `❌ 未知响应: ${JSON.stringify(data)}`, error: true }])
  }
}

async function sendStreaming(
  model: string,
  messages: ChatMessage[],
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>,
) {
  const response = await createChatCompletion({ model, messages, stream: true })
  if (!response.ok) {
    const errText = await response.text()
    setMessages(prev => [...prev, { role: "assistant", content: `❌ HTTP ${response.status}: ${errText}`, error: true }])
    return
  }
  if (!response.body) throw new Error("No response body")

  setMessages(prev => [...prev, { role: "assistant", content: "" }])
  const hasContent = await consumeStream(response.body, setMessages)
  if (!hasContent) {
    setMessages(prev => replaceLastAssistant(prev, { role: "assistant", content: EMPTY_RESPONSE_MESSAGE, error: true }))
  }
}

async function consumeStream(
  body: ReadableStream<Uint8Array>,
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>,
) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let hasContent = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    for (const rawLine of chunk.split("\n")) {
      const delta = parseStreamLine(rawLine)
      if (!delta) continue
      if (delta.error) {
        setMessages(prev => replaceLastAssistant(prev, { role: "assistant", content: `❌ ${delta.error}`, error: true }))
        return true
      }
      if (delta.content || delta.reasoning) {
        hasContent = true
        setMessages(prev => appendAssistantDelta(prev, delta))
      }
    }
  }

  return hasContent
}
