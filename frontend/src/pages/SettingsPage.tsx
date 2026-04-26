import { Settings2, RefreshCw, ServerCrash, Code, ShieldCheck } from "lucide-react"
import { Button } from "../components/ui/button"
import { toast } from "sonner"
import { useAdminSettings } from "../features/admin/useAdminSettings"

export default function SettingsPage() {
  const {
    settings,
    maxInflight,
    globalMaxInflight,
    poolTarget,
    poolTtlMin,
    modelAliases,
    baseUrl,
    curlExample,
    setMaxInflight,
    setGlobalMaxInflight,
    setPoolTarget,
    setPoolTtlMin,
    setModelAliases,
    refreshSettings,
    saveConcurrency,
    savePool,
    saveAliases,
  } = useAdminSettings()

  return (
    <div className="w-full max-w-5xl mx-auto min-w-0 overflow-x-hidden space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight">系统设置</h2>
          <p className="text-muted-foreground">管理控制台认证与网关运行时配置。</p>
        </div>
        <Button variant="outline" onClick={() => { refreshSettings(); toast.success("配置已刷新") }}>
          <RefreshCw className="mr-2 h-4 w-4" /> 刷新配置
        </Button>
      </div>

      <div className="grid gap-6 min-w-0">
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm min-w-0">
          <div className="flex flex-col space-y-1.5 p-6 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h3 className="font-semibold leading-none tracking-tight">当前登录方式</h3>
            </div>
            <p className="text-sm text-muted-foreground">管理台已切换为登录页 + HttpOnly Cookie 会话，浏览器本地不再保存管理员密钥。</p>
          </div>
          <div className="p-6 text-sm text-muted-foreground">
            当前页面以及账号管理、接口测试、图片生成等功能，都会自动复用已登录会话。
          </div>
        </div>

        {/* Connection Info */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm min-w-0">
          <div className="flex flex-col space-y-1.5 p-6 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <ServerCrash className="h-5 w-5 text-primary" />
              <h3 className="font-semibold leading-none tracking-tight">连接信息</h3>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-1 min-w-0">
              <label className="text-sm font-medium">API 基础地址 (Base URL)</label>
              <input type="text" readOnly value={baseUrl} className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm font-mono text-muted-foreground" />
            </div>
          </div>
        </div>

        {/* Core Settings */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm min-w-0">
          <div className="flex flex-col space-y-1.5 p-6 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              <h3 className="font-semibold leading-none tracking-tight">核心并发参数</h3>
            </div>
            <p className="text-sm text-muted-foreground">运行时并发槽位与排队阈值（需要在后端 config.json 中修改后重启生效）。</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex justify-between items-center py-2 border-b flex-wrap gap-2">
              <div className="space-y-1 min-w-0">
                <span className="text-sm font-medium">当前系统版本</span>
              </div>
              <span className="font-mono text-sm">{settings?.version || "..."}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b flex-wrap gap-4">
              <div className="space-y-1 min-w-0 flex-1">
                <span className="text-sm font-medium">单账号最大并发 (max_inflight_per_account)</span>
                <p className="text-xs text-muted-foreground">每个上游账号同时处理的请求数。太大易被封，太小不充分利用。</p>
              </div>
              <input
                type="number"
                min="1"
                max="10"
                value={maxInflight}
                onChange={e => setMaxInflight(Number(e.target.value))}
                className="flex h-8 w-20 rounded-md border border-input bg-background px-3 py-1 text-sm text-center"
              />
            </div>
            <div className="flex justify-between items-center py-2 border-b flex-wrap gap-4">
              <div className="space-y-1 min-w-0 flex-1">
                <span className="text-sm font-medium">全局并发上限 (global_max_inflight)</span>
                <p className="text-xs text-muted-foreground">所有账号合计同时在途请求的硬上限。0 = 不限。对应 Dashboard 的"异步任务"峰值。</p>
              </div>
              <input
                type="number"
                min="0"
                max="200"
                value={globalMaxInflight}
                onChange={e => setGlobalMaxInflight(Number(e.target.value))}
                className="flex h-8 w-20 rounded-md border border-input bg-background px-3 py-1 text-sm text-center"
              />
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={saveConcurrency}>保存并发设置</Button>
            </div>
          </div>
        </div>

        {/* Chat ID Pool */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm min-w-0">
          <div className="flex flex-col space-y-1.5 p-6 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-rose-500" />
              <h3 className="font-semibold leading-none tracking-tight">Chat_ID 预热池</h3>
            </div>
            <p className="text-sm text-muted-foreground">预建 chat_id 规避上游 /chats/new 握手 (0.5~6s)。运行时修改立即生效。</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex justify-between items-center py-2 border-b flex-wrap gap-4">
              <div className="space-y-1 min-w-0 flex-1">
                <span className="text-sm font-medium">每账号目标数 (target)</span>
                <p className="text-xs text-muted-foreground">每个账号预先挂多少个 chat_id 等着。默认 5。</p>
              </div>
              <input
                type="number"
                min="0"
                max="20"
                value={poolTarget}
                onChange={e => setPoolTarget(Number(e.target.value))}
                className="flex h-8 w-20 rounded-md border border-input bg-background px-3 py-1 text-sm text-center"
              />
            </div>
            <div className="flex justify-between items-center py-2 border-b flex-wrap gap-4">
              <div className="space-y-1 min-w-0 flex-1">
                <span className="text-sm font-medium">TTL (分钟)</span>
                <p className="text-xs text-muted-foreground">chat_id 超过此时长则丢弃重建，避免被上游静默回收。默认 10。</p>
              </div>
              <input
                type="number"
                min="1"
                max="120"
                value={poolTtlMin}
                onChange={e => setPoolTtlMin(Number(e.target.value))}
                className="flex h-8 w-20 rounded-md border border-input bg-background px-3 py-1 text-sm text-center"
              />
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={savePool}>保存预热池设置</Button>
            </div>
          </div>
        </div>

        {/* Model Mapping */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm min-w-0">
          <div className="flex flex-col space-y-1.5 p-6 border-b bg-muted/30">
            <h3 className="font-semibold leading-none tracking-tight">自动模型映射规则 (Model Aliases)</h3>
            <p className="text-sm text-muted-foreground">下游传入的模型名称将被网关自动路由至以下千问实际模型。请使用标准 JSON 格式编辑。</p>
          </div>
          <div className="p-6">
            <textarea
              rows={8}
              value={modelAliases}
              onChange={e => setModelAliases(e.target.value)}
              className="flex min-h-[160px] w-full rounded-md border border-input bg-slate-950 text-slate-300 px-3 py-2 text-sm font-mono"
              style={{ whiteSpace: "pre", overflowX: "auto" }}
            />
            <div className="mt-4 flex justify-end">
              <Button onClick={saveAliases}>保存映射</Button>
            </div>
          </div>
        </div>

        {/* Usage Example */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm min-w-0">
          <div className="flex flex-col space-y-1.5 p-6 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Code className="h-5 w-5 text-primary" />
              <h3 className="font-semibold leading-none tracking-tight">使用示例</h3>
            </div>
          </div>
          <div className="p-6 min-w-0">
            <pre className="bg-slate-950 rounded-lg p-4 text-xs font-mono text-slate-300 whitespace-pre-wrap break-all max-h-[400px] overflow-y-auto overflow-x-hidden">
              {curlExample}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
