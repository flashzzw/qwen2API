import type { AccountItem } from "./api"

export function statusStyle(code?: string) {
  switch (code) {
    case "valid":
      return "bg-green-500/10 text-green-700 dark:text-green-400 ring-green-500/20"
    case "pending_activation":
      return "bg-orange-500/10 text-orange-700 dark:text-orange-400 ring-orange-500/20"
    case "rate_limited":
      return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 ring-yellow-500/20"
    case "banned":
      return "bg-red-500/10 text-red-700 dark:text-red-400 ring-red-500/20"
    case "auth_error":
      return "bg-slate-500/10 text-slate-700 dark:text-slate-300 ring-slate-500/20"
    default:
      return "bg-red-500/10 text-red-700 dark:text-red-400 ring-red-500/20"
  }
}

export function statusText(acc: AccountItem) {
  switch (acc.status_code) {
    case "valid":
      return "可用"
    case "pending_activation":
      return "未激活"
    case "rate_limited":
      return "限流"
    case "banned":
      return "封禁"
    case "auth_error":
      return "认证失效"
    default:
      return acc.valid ? "可用" : "失效"
  }
}

export function statusNote(acc: AccountItem) {
  if ((acc.rate_limited_until || 0) > Date.now() / 1000) {
    const seconds = Math.max(0, Math.ceil((acc.rate_limited_until! - Date.now() / 1000)))
    return `预计 ${seconds} 秒后恢复`
  }
  return acc.last_error || ""
}

export function localizeAccountError(error?: string) {
  if (!error) return "未知错误"
  const lower = error.toLowerCase()
  if (lower.includes("activation already in progress")) return "账号正在激活中，请稍后刷新"
  if (lower.includes("activation link or token not found")) return "激活链接或 Token 获取失败"
  if (lower.includes("token invalid") || lower.includes("token") || lower.includes("auth")) return "Token 无效或认证失败"
  return error
}
