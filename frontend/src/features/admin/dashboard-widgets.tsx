import type { ReactNode } from "react"
import { Activity, ActivityIcon, Cpu, Database, FileJson, Flame, Globe, ImageIcon, Paperclip, Server, Shield, ShieldAlert } from "lucide-react"
import type { AdminStatus } from "./api"

type DashboardWidgetsProps = {
  status: AdminStatus | null
  accounts: NonNullable<AdminStatus["accounts"]>
  pool: AdminStatus["chat_id_pool"]
  rows: NonNullable<AdminStatus["per_account"]>
}

export function DashboardWidgets({ status, accounts, pool, rows }: DashboardWidgetsProps) {
  return (
    <>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 relative z-10">
        <StatCard icon={<Server className="h-5 w-5 text-primary" />} title="可用账号" value={String(accounts.valid ?? 0)} accent="primary" sub={`共 ${accounts.total ?? 0} 个`} />
        <StatCard icon={<Activity className="h-5 w-5 text-blue-400" />} title="当前并发" value={String(accounts.in_use ?? 0)} accent="blue" sub={`全局上限 ${accounts.global_in_use ?? 0}`} />
        <StatCard icon={<ShieldAlert className="h-5 w-5 text-destructive" />} title="排队请求" value={String(accounts.waiting ?? 0)} accent="destructive" sub={`队列上限 ${accounts.max_queue_size ?? 0}`} />
        <StatCard icon={<ActivityIcon className="h-5 w-5 text-orange-400" />} title="限流号/失效号" value={`${accounts.rate_limited ?? 0} / ${accounts.invalid ?? 0}`} accent="orange" />
      </div>

      <div className="grid gap-6 md:grid-cols-2 relative z-10">
        <StatCard icon={<Flame className="h-5 w-5 text-rose-400" />} title="Chat_ID 预热池" value={String(pool?.total_cached ?? 0)} accent="rose" sub={pool ? `每账号目标 ${pool.target_per_account} · TTL ${Math.round((pool.ttl_seconds || 0) / 60)} 分钟` : "未启用"} />
        <StatCard icon={<Database className="h-5 w-5 text-cyan-400" />} title="异步任务" value={String(status?.runtime?.asyncio_running_tasks ?? 0)} accent="cyan" sub="asyncio active task count" />
      </div>

      {rows.length > 0 ? <AccountConcurrencyTable rows={rows} pool={pool} /> : null}
      <EndpointPanel />
    </>
  )
}

function AccountConcurrencyTable({ rows, pool }: { rows: NonNullable<AdminStatus["per_account"]>; pool: AdminStatus["chat_id_pool"] }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/30 backdrop-blur-xl shadow-2xl relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-black/[0.02] dark:from-white/[0.02] to-transparent pointer-events-none" />
      <div className="flex flex-col space-y-2 p-6 border-b border-border/50 bg-muted/10 relative z-10">
        <h3 className="font-extrabold text-xl tracking-tight flex items-center gap-3">
          <span className="bg-primary w-2 h-6 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
          账号并发详情
        </h3>
      </div>
      <div className="overflow-x-auto relative z-10">
        <table className="w-full text-sm">
          <thead className="bg-muted/20 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-6 py-3 font-semibold">邮箱</th>
              <th className="text-left px-4 py-3 font-semibold">状态</th>
              <th className="text-right px-4 py-3 font-semibold">在途</th>
              <th className="text-right px-4 py-3 font-semibold">预热 chat_id</th>
              <th className="text-right px-4 py-3 font-semibold">连失</th>
              <th className="text-right px-4 py-3 font-semibold">限流次</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map(row => <AccountConcurrencyRow key={row.email} row={row} warmSize={pool?.per_account?.[row.email] ?? 0} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AccountConcurrencyRow({ row, warmSize }: { row: NonNullable<AdminStatus["per_account"]>[number]; warmSize: number }) {
  const badge = row.status === "valid"
    ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
    : row.status === "rate_limited"
      ? "bg-orange-500/15 text-orange-300 ring-orange-500/30"
      : "bg-red-500/15 text-red-300 ring-red-500/30"

  return (
    <tr className="hover:bg-muted/10 transition-colors">
      <td className="px-6 py-3 font-mono text-xs text-foreground/80 break-all">{row.email}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${badge}`}>{row.status}</span>
      </td>
      <td className="px-4 py-3 text-right font-mono">
        {row.inflight}<span className="text-muted-foreground">/{row.max_inflight}</span>
      </td>
      <td className="px-4 py-3 text-right font-mono">
        <span className={warmSize === 0 ? "text-muted-foreground" : "text-rose-400 font-semibold"}>{warmSize}</span>
      </td>
      <td className="px-4 py-3 text-right font-mono text-xs">{row.consecutive_failures}</td>
      <td className="px-4 py-3 text-right font-mono text-xs">{row.rate_limit_strikes}</td>
    </tr>
  )
}

function EndpointPanel() {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/30 backdrop-blur-xl shadow-2xl relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-black/[0.02] dark:from-white/[0.02] to-transparent pointer-events-none" />
      <div className="flex flex-col space-y-2 p-8 border-b border-border/50 bg-muted/10 relative z-10">
        <h3 className="font-extrabold text-2xl tracking-tight flex items-center gap-3">
          <span className="bg-primary w-2 h-8 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
          API 接口池
        </h3>
        <p className="text-base text-muted-foreground ml-5">兼容主流 AI 协议的调用入口，默认无需认证，或通过 API Key 访问。</p>
      </div>
      <div className="p-0 relative z-10">
        <div className="divide-y divide-border/50 text-sm">
          <EndpointRow icon={<FileJson className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />} iconBg="bg-emerald-500/10" path="POST /v1/chat/completions" tag="OpenAI" tagClass="bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300 ring-1 ring-emerald-500/20 dark:ring-emerald-500/30" />
          <EndpointRow icon={<Cpu className="h-5 w-5 text-blue-500 dark:text-blue-400" />} iconBg="bg-blue-500/10" path="POST /v1/messages" tag="Anthropic" tagClass="bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300 ring-1 ring-blue-500/20 dark:ring-blue-500/30" />
          <EndpointRow icon={<Globe className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />} iconBg="bg-yellow-500/10" path="POST /v1/models/gemini-pro:generateContent" tag="Gemini" tagClass="bg-yellow-500/10 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-300 ring-1 ring-yellow-500/20 dark:ring-yellow-500/30" />
          <EndpointRow icon={<ImageIcon className="h-5 w-5 text-purple-500 dark:text-purple-400" />} iconBg="bg-purple-500/10" path="POST /v1/images/generations" tag="Image Gen" tagClass="bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300 ring-1 ring-purple-500/20 dark:ring-purple-500/30" />
          <EndpointRow icon={<Paperclip className="h-5 w-5 text-cyan-500 dark:text-cyan-400" />} iconBg="bg-cyan-500/10" path="POST /v1/files" tag="Files" tagClass="bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-300 ring-1 ring-cyan-500/20 dark:ring-cyan-500/30" />
          <EndpointRow icon={<Shield className="h-5 w-5 text-slate-600 dark:text-slate-400" />} iconBg="bg-slate-500/10" path="GET /" tag="健康检查" tagClass="bg-slate-500/10 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300 ring-1 ring-slate-500/20 dark:ring-slate-500/30" />
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, title, value, accent, sub }: { icon: ReactNode; title: string; value: string; accent: string; sub?: string }) {
  const shadowMap: Record<string, string> = {
    primary: "hover:shadow-primary/5",
    blue: "hover:shadow-blue-500/5",
    destructive: "hover:shadow-destructive/10",
    orange: "hover:shadow-orange-500/5",
    rose: "hover:shadow-rose-500/5",
    cyan: "hover:shadow-cyan-500/5",
  }
  const gradMap: Record<string, string> = {
    primary: "from-primary/10",
    blue: "from-blue-500/10",
    destructive: "from-destructive/10",
    orange: "from-orange-500/10",
    rose: "from-rose-500/10",
    cyan: "from-cyan-500/10",
  }

  return (
    <div className={`group rounded-2xl border border-border/50 bg-card/40 backdrop-blur-md shadow-xl ${shadowMap[accent]} transition-all duration-500 overflow-hidden relative`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${gradMap[accent]} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
      <div className="p-6 relative z-10">
        <div className="flex flex-row items-center justify-between space-y-0 pb-4">
          <h3 className="tracking-tight text-sm font-semibold text-foreground/80 uppercase">{title}</h3>
          <div className="p-2 bg-primary/10 rounded-lg">{icon}</div>
        </div>
        <div className="text-4xl font-black bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          {value}
        </div>
        {sub ? <div className="text-xs text-muted-foreground mt-2">{sub}</div> : null}
      </div>
    </div>
  )
}

function EndpointRow({ icon, iconBg, path, tag, tagClass }: { icon: ReactNode; iconBg: string; path: string; tag: string; tagClass: string }) {
  return (
    <div className="flex justify-between items-center px-8 py-5 hover:bg-black/5 dark:hover:bg-white/[0.02] transition-colors">
      <div className="flex items-center gap-4">
        <div className={`p-2 rounded-md ${iconBg}`}>{icon}</div>
        <div className="font-semibold text-foreground/80">{path}</div>
      </div>
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${tagClass}`}>{tag}</span>
    </div>
  )
}
