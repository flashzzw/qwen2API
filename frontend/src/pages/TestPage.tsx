import { ChatInput, MessageList, TestToolbar } from "../features/test/components"
import { useChatTester } from "../features/test/useChatTester"

export default function TestPage() {
  const chatTester = useChatTester()

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] space-y-4 max-w-5xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">接口测试</h2>
          <p className="text-muted-foreground">在此测试您的 API 分发是否正常工作。</p>
        </div>
        <TestToolbar
          model={chatTester.model}
          models={chatTester.availableModels}
          stream={chatTester.stream}
          onModelChange={chatTester.setModel}
          onToggleStream={chatTester.toggleStream}
          onClear={chatTester.clearMessages}
        />
      </div>

      <div className="flex-1 rounded-xl border bg-card overflow-hidden flex flex-col shadow-sm">
        <MessageList messages={chatTester.messages} loading={chatTester.loading} bottomRef={chatTester.bottomRef} />
        <ChatInput
          value={chatTester.input}
          loading={chatTester.loading}
          onChange={chatTester.setInput}
          onSend={chatTester.sendMessage}
        />
      </div>
    </div>
  )
}
