import { API_BASE } from "../../lib/api"
import { authFetch } from "../../lib/auth"

export type AccountItem = {
  email: string
  password?: string
  token?: string
  username?: string
  valid?: boolean
  inflight?: number
  rate_limited_until?: number
  activation_pending?: boolean
  status_code?: string
  status_text?: string
  last_error?: string
}

export type AdminStatusAccountRow = {
  email: string
  status: string
  inflight: number
  max_inflight: number
  consecutive_failures: number
  rate_limit_strikes: number
  last_request_finished: number
}

export type AdminStatus = {
  accounts?: {
    total?: number
    valid?: number
    rate_limited?: number
    invalid?: number
    in_use?: number
    global_in_use?: number
    waiting?: number
    max_inflight_per_account?: number
    max_queue_size?: number
  }
  per_account?: AdminStatusAccountRow[]
  chat_id_pool?: {
    total_cached?: number
    target_per_account?: number
    ttl_seconds?: number
    per_account?: Record<string, number>
  } | null
  runtime?: { asyncio_running_tasks?: number }
}

export type AdminSettings = {
  version?: string
  max_inflight_per_account?: number
  global_max_inflight?: number
  chat_id_pool_target?: number
  chat_id_pool_ttl_seconds?: number
  model_aliases?: Record<string, string>
}

export type AddAccountPayload = {
  email: string
  password: string
  token: string
}

type ApiResult = {
  ok?: boolean
  error?: string
  detail?: string
  message?: string
  email?: string
  key?: string
  valid?: boolean
  pending?: boolean
  activation_pending?: boolean
  concurrency?: number
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T
}

async function requestJson<T>(path: string, init: RequestInit = {}, errorMessage = "请求失败"): Promise<T> {
  const response = await authFetch(`${API_BASE}${path}`, init)
  const payload = await readJson<T & { detail?: string }>(response)
  if (!response.ok) {
    throw new Error(payload.detail || errorMessage)
  }
  return payload
}

export function readAdminStatus() {
  return requestJson<AdminStatus>("/api/admin/status", {}, "状态获取失败")
}

export function listAdminAccounts() {
  return requestJson<{ accounts?: AccountItem[] }>("/api/admin/accounts", {}, "账号列表获取失败")
}

export function addAdminAccount(payload: AddAccountPayload) {
  return requestJson<ApiResult>(
    "/api/admin/accounts",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "账号注入失败",
  )
}

export function deleteAdminAccount(email: string) {
  return requestJson<ApiResult>(`/api/admin/accounts/${encodeURIComponent(email)}`, { method: "DELETE" }, "删除账号失败")
}

export function registerAdminAccount() {
  return requestJson<ApiResult>("/api/admin/accounts/register", { method: "POST" }, "自动注册失败")
}

export function verifyAdminAccount(email: string) {
  return requestJson<ApiResult>(`/api/admin/accounts/${encodeURIComponent(email)}/verify`, { method: "POST" }, "验证账号失败")
}

export function verifyAllAdminAccounts() {
  return requestJson<ApiResult>("/api/admin/verify", { method: "POST" }, "全量巡检失败")
}

export function activateAdminAccount(email: string) {
  return requestJson<ApiResult>(`/api/admin/accounts/${encodeURIComponent(email)}/activate`, { method: "POST" }, "激活账号失败")
}

export function readAdminSettings() {
  return requestJson<AdminSettings>("/api/admin/settings", {}, "配置获取失败")
}

export function updateAdminSettings(payload: Partial<AdminSettings>) {
  return requestJson<ApiResult>(
    "/api/admin/settings",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "保存配置失败",
  )
}

export function listAdminKeys() {
  return requestJson<{ keys?: string[] }>("/api/admin/keys", {}, "API Key 列表获取失败")
}

export function createAdminKey() {
  return requestJson<ApiResult>("/api/admin/keys", { method: "POST" }, "生成 API Key 失败")
}

export function deleteAdminKey(key: string) {
  return requestJson<ApiResult>(`/api/admin/keys/${encodeURIComponent(key)}`, { method: "DELETE" }, "删除 API Key 失败")
}
