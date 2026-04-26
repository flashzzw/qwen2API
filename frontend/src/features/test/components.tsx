import { Bot, RefreshCw, Send } from "lucide-react"
import type { RefObject } from "react"
import { Button } from "../../components/ui/button"
import { MessageContent } from "./message-content"
import type { ChatMessage } from "./types"

type TestToolbarProps = {
  model: string
  models: string[]
  stream: boolean
  onModelChange: (value: string) => void
  onToggleStream: () => void
  onClear: () => void
}

export function TestToolbar(props: TestToolbarProps) {
  return (
    <div className="flex gap-4 items-center">
      <div className="flex items-center gap-2 text-sm bg-card border px-3 py-1.5 rounded-md">
        <span className="font-medium text-muted-foreground">模型:</span>
        <select value={props.model} onChange={event => props.onModelChange(event.target.value)} className="bg-transparent font-mono outline-none">
          {props.models.map(id => <option key={id} value={id}>{id}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2 text-sm bg-card border px-3 py-1.5 rounded-md cursor-pointer" onClick={props.onToggleStream}>
        <input type="checkbox" checked={props.stream} onChange={() => {}} className="cursor-pointer" />
        <span className="font-medium">流式传输 (Stream)</span>
      </div>
      <Button variant="outline" onClick={props.onClear}>
        <RefreshCw className="mr-2 h-4 w-4" /> 清空对话
      </Button>
    </div>
  )
}

export function MessageList({ messages, loading, bottomRef }: { messages: ChatMessage[]; loading: boolean; bottomRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 flex flex-col">
      {messages.length === 0 ? <EmptyConversation /> : null}
      {messages.map((message, index) => <MessageBubble key={index} message={message} loading={loading} />)}
      <div ref={bottomRef} />
    </div>
  )
}

export function ChatInput({ value, loading, onChange, onSend }: { value: string; loading: boolean; onChange: (value: string) => void; onSend: () => void }) {
  return (
    <div className="p-4 border-t bg-muted/30 flex gap-3 items-center">
      <input
        type="text"
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === "Enter") onSend()
        }}
        className="flex h-12 w-full rounded-md border border-input bg-background px-4 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        placeholder="输入测试消息..."
        disabled={loading}
      />
      <Button onClick={onSend} disabled={loading || !value.trim()} className="h-12 px-6">
        {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </Button>
    </div>
  )
}

function EmptyConversation() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
      <Bot className="h-12 w-12 text-muted-foreground/30" />
      <p className="text-sm">发送一条消息以开始测试，系统将通过 /v1/chat/completions 进行调用。</p>
    </div>
  )
}

function MessageBubble({ message, loading }: { message: ChatMessage; loading: boolean }) {
  return (
    <div className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm shadow-sm ${bubbleStyle(message)}`}>
        {renderMessageBody(message, loading)}
      </div>
    </div>
  )
}

function renderMessageBody(message: ChatMessage, loading: boolean) {
  if (message.role === "assistant" && !message.content && !message.reasoning && loading) {
    return (
      <span className="animate-pulse flex items-center gap-2 text-muted-foreground">
        <Bot className="h-4 w-4" /> 思考中...
      </span>
    )
  }
  if (message.role === "assistant" && !message.error) {
    return <AssistantMessage message={message} />
  }
  return <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="space-y-2">
      {message.reasoning ? (
        <details open className="rounded-md border border-dashed border-border/50 bg-muted/20 p-2 text-xs">
          <summary className="cursor-pointer select-none text-muted-foreground font-mono">
            思考过程 ({message.reasoning.length} 字)
          </summary>
          <div className="whitespace-pre-wrap leading-relaxed text-muted-foreground mt-2 pl-2 border-l-2 border-border/30">
            {message.reasoning}
          </div>
        </details>
      ) : null}
      {message.content ? <MessageContent content={message.content} /> : null}
    </div>
  )
}

function bubbleStyle(message: ChatMessage) {
  if (message.role === "user") return "bg-primary text-primary-foreground"
  if (message.error) return "bg-red-500/10 border border-red-500/30 text-red-400"
  return "bg-muted/30 border text-foreground"
}
