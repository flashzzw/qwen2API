import { Button } from "../components/ui/button"
import { Trash2, Plus, RefreshCw, Bot, ShieldCheck, MailWarning } from "lucide-react"
import { toast } from "sonner"
import { statusNote, statusStyle, statusText } from "../features/admin/account-status"
import { useAccounts } from "../features/admin/useAccounts"

export default function AccountsPage() {
  const accountsState = useAccounts()
  const { accounts, stats, form, setEmail, setPassword, setToken } = accountsState

  return (
    <div className="space-y-6 relative">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight">{"\u8d26\u53f7\u7ba1\u7406"}</h2>
          <p className="text-muted-foreground mt-1">{"\u7edf\u4e00\u7ba1\u7406\u4e0a\u6e38\u8d26\u53f7\u6c60\uff0c\u5e76\u533a\u5206\u672a\u6fc0\u6d3b\u3001\u9650\u6d41\u3001\u5c01\u7981\u4e0e\u5931\u6548\u72b6\u6001\u3002"}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={accountsState.verifyAllAccounts} disabled={accountsState.verifyingAll}>
            <ShieldCheck className={`mr-2 h-4 w-4 ${accountsState.verifyingAll ? 'animate-pulse' : ''}`} /> {"\u5168\u91cf\u5de1\u68c0"}
          </Button>
          <Button variant="outline" onClick={() => { accountsState.refreshAccounts(); toast.success("\u8d26\u53f7\u5217\u8868\u5df2\u5237\u65b0") }}>
            <RefreshCw className="mr-2 h-4 w-4" /> {"\u5237\u65b0\u72b6\u6001"}
          </Button>
          {accountsState.registerUnlocked && (
            <Button variant="default" onClick={accountsState.registerAccount} disabled={accountsState.registering}>
              {accountsState.registering ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
              {accountsState.registering ? "\u6b63\u5728\u6ce8\u518c..." : "\u4e00\u952e\u83b7\u53d6\u65b0\u53f7"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">{"\u53ef\u7528"}</div><div className="text-2xl font-bold">{stats.valid}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">{"\u672a\u6fc0\u6d3b"}</div><div className="text-2xl font-bold">{stats.pending}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">{"\u9650\u6d41"}</div><div className="text-2xl font-bold">{stats.rateLimited}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">{"\u5c01\u7981"}</div><div className="text-2xl font-bold">{stats.banned}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">{"\u5176\u4ed6\u5931\u6548"}</div><div className="text-2xl font-bold">{stats.invalid}</div></div>
      </div>

      <div className="rounded-2xl border bg-card/40 p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold">{"\u624b\u52a8\u6ce8\u5165\u8d26\u53f7"}</h3>
          <p className="text-sm text-muted-foreground">{"\u8bf7\u5148\u5728 chat.qwen.ai \u767b\u5f55\uff0c\u7136\u540e\u6309 F12 \u6253\u5f00\u5f00\u53d1\u8005\u5de5\u5177\uff0c\u5728 Application / Storage \u91cc\u7684 Local Storage / \u672c\u5730\u5b58\u50a8 \u4e2d\u627e\u5230 token \u5e76\u76f4\u63a5\u590d\u5236\u5b8c\u6574\u539f\u59cb\u503c\u7c98\u8d34\u5230\u4e0b\u65b9\u8f93\u5165\u6846\u3002"}</p>
          <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-3 mt-3">
            <p className="text-sm font-semibold text-orange-700 dark:text-orange-300">{"\u91cd\u8981\uff1a\u8bf7\u53ea\u7c98\u8d34 Local Storage / \u672c\u5730\u5b58\u50a8 \u91cc\u7684 token \u539f\u59cb\u503c\uff0c\u4e0d\u8981\u4ece Network \u8bf7\u6c42\u6216 Authorization \u8bf7\u6c42\u5934\u4e2d\u63d0\u53d6\u3002"}</p>
            <p className="text-xs text-orange-700/80 dark:text-orange-200/80 mt-1">{"\u8bf7\u4e0d\u8981\u5e26 Bearer \u524d\u7f00\uff0c\u4e5f\u4e0d\u8981\u7c98\u8d34\u6574\u6bb5 Authorization \u6587\u672c\u3002\u90ae\u7bb1\u548c\u5bc6\u7801\u53ef\u4ee5\u4e0d\u586b\uff0c\u7cfb\u7edf\u4f1a\u5728\u6ce8\u5165\u524d\u5148\u9a8c\u8bc1 token \u662f\u5426\u6709\u6548\u3002"}</p>
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="text-xs font-semibold mb-1.5 block">{"Token\uff08\u5fc5\u586b\uff09"}</label>
            <input type="text" value={form.token} onChange={e => setToken(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder={"\u7c98\u8d34\u4ece Local Storage / \u672c\u5730\u5b58\u50a8 \u76f4\u63a5\u590d\u5236\u7684 token"} />
          </div>
          <div className="w-full md:w-64">
            <label className="text-xs font-semibold mb-1.5 block">{"\u90ae\u7bb1\uff08\u9009\u586b\uff09"}</label>
            <input type="text" value={form.email} onChange={e => setEmail(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder={"\u90ae\u7bb1\u5730\u5740"} />
          </div>
          <div className="w-full md:w-64">
            <label className="text-xs font-semibold mb-1.5 block">{"\u5bc6\u7801\uff08\u9009\u586b\uff09"}</label>
            <input type="text" value={form.password} onChange={e => setPassword(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder={"\u7528\u4e8e\u81ea\u52a8\u5237\u65b0\u6216\u6fc0\u6d3b"} />
          </div>
          <Button onClick={accountsState.addAccount} variant="secondary" className="h-10 w-full md:w-auto font-semibold">
            <Plus className="mr-2 h-4 w-4" /> {"\u6ce8\u5165\u8d26\u53f7"}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border bg-card/30 overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b bg-muted/10">
          <h3 className="text-xl font-bold">{"\u8d26\u53f7\u5217\u8868"}</h3>
          <span className="inline-flex items-center justify-center bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-bold">{accounts.length}</span>
        </div>
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/30 border-b text-muted-foreground text-xs uppercase tracking-wider font-semibold">
            <tr>
              <th className="h-12 px-6 align-middle">{"\u8d26\u53f7"}</th>
              <th className="h-12 px-6 align-middle">{"\u72b6\u6001"}</th>
              <th className="h-12 px-6 align-middle">{"\u5e76\u53d1\u8d1f\u8f7d"}</th>
              <th className="h-12 px-6 align-middle">{"\u8bf4\u660e"}</th>
              <th className="h-12 px-6 align-middle text-right">{"\u64cd\u4f5c"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {accounts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">{"\u6682\u65e0\u8d26\u53f7\uff0c\u8bf7\u624b\u52a8\u6ce8\u5165\u6216\u4e00\u952e\u83b7\u53d6\u65b0\u53f7\u3002"}</td>
              </tr>
            )}
            {accounts.map(acc => (
              <tr key={acc.email} className="transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                <td className="px-6 py-4 align-middle font-medium font-mono text-foreground/90">{acc.email}</td>
                <td className="px-6 py-4 align-middle">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusStyle(acc.status_code)}`}>
                    {statusText(acc)}
                  </span>
                </td>
                <td className="px-6 py-4 align-middle font-mono">
                  <span className="inline-flex items-center justify-center bg-muted/50 px-2 py-1 rounded text-xs border">
                    {acc.inflight || 0} {"\u7ebf\u7a0b"}
                  </span>
                </td>
                <td className="px-6 py-4 align-middle text-muted-foreground max-w-[420px] truncate" title={statusNote(acc)}>
                  {statusNote(acc) || "-"}
                </td>
                <td className="px-6 py-4 align-middle text-right">
                  <div className="flex items-center justify-end gap-2">
                    {acc.status_code !== "valid" && acc.status_code !== "rate_limited" && acc.status_code !== "banned" && (
                      <Button variant="outline" size="sm" onClick={() => accountsState.activateAccount(acc.email)} className="text-orange-600 dark:text-orange-400 border-orange-500/30 hover:bg-orange-500/10 font-medium">
                        <MailWarning className="h-4 w-4 mr-1" /> {"\u6fc0\u6d3b"}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => accountsState.verifyAccount(acc.email)} disabled={accountsState.verifying === acc.email} title={"\u5355\u72ec\u9a8c\u8bc1"}>
                      {accountsState.verifying === acc.email ? <RefreshCw className="h-4 w-4 animate-spin text-blue-500" /> : <ShieldCheck className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => accountsState.deleteAccount(acc.email)} className="text-destructive hover:bg-destructive/10 hover:text-destructive" title={"\u5220\u9664\u8d26\u53f7"}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
