import { API_BASE } from "./api"

export type AdminSession = {
  authenticated: boolean
}

type LoginErrorPayload = {
  detail?: string
}

export function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    credentials: "include",
  })
}

export async function readAdminSession() {
  const response = await authFetch(`${API_BASE}/api/admin/auth/session`)
  if (!response.ok) {
    throw new Error("会话状态获取失败")
  }
  return (await response.json()) as AdminSession
}

export async function loginAdmin(password: string) {
  const response = await authFetch(`${API_BASE}/api/admin/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  })

  if (response.ok) {
    return
  }

  const payload = (await response.json().catch(() => ({}))) as LoginErrorPayload
  throw new Error(payload.detail || "登录失败")
}

export async function logoutAdmin() {
  await authFetch(`${API_BASE}/api/admin/auth/logout`, {
    method: "POST",
  })
}
