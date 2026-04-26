import { DashboardWidgets } from "../features/admin/dashboard-widgets"
import { useDashboardStatus } from "../features/admin/useDashboardStatus"

export default function Dashboard() {
  const { status, accounts, pool, rows } = useDashboardStatus()

  return (
    <div className="space-y-8 max-w-5xl relative">
      <div className="relative z-10">
        <div className="absolute -top-10 -left-10 w-40 h-40 bg-primary/20 blur-[100px] rounded-full pointer-events-none" />
        <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">运行状态</h2>
        <p className="text-muted-foreground mt-2 text-lg">全局并发监控与千问账号池概览（每 3 秒自动刷新）。</p>
      </div>

      <DashboardWidgets status={status} accounts={accounts} pool={pool} rows={rows} />
    </div>
  )
}
