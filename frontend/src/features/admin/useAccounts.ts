import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  activateAdminAccount,
  addAdminAccount,
  deleteAdminAccount,
  listAdminAccounts,
  registerAdminAccount,
  verifyAdminAccount,
  verifyAllAdminAccounts,
  type AccountItem,
} from "./api"
import { localizeAccountError } from "./account-status"

const REGISTER_UNLOCK_HASH = "29bb93e7473e47595a454ea0c7996f659035bc5298faf820039fbf7641906aea"

function buildEmptyStats() {
  return { valid: 0, pending: 0, rateLimited: 0, banned: 0, invalid: 0 }
}

function countAccountStats(accounts: AccountItem[]) {
  const result = buildEmptyStats()
  for (const acc of accounts) {
    switch (acc.status_code) {
      case "valid":
        result.valid += 1
        break
      case "pending_activation":
        result.pending += 1
        break
      case "rate_limited":
        result.rateLimited += 1
        break
      case "banned":
        result.banned += 1
        break
      default:
        result.invalid += 1
        break
    }
  }
  return result
}

export function useAccounts() {
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [token, setToken] = useState("")
  const [registering, setRegistering] = useState(false)
  const [registerUnlocked, setRegisterUnlocked] = useState(false)
  const [verifying, setVerifying] = useState<string | null>(null)
  const [verifyingAll, setVerifyingAll] = useState(false)

  useEffect(() => {
    if (!email || !password) return
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(email + "::" + password))
      .then(buf => {
        const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("")
        if (hex === REGISTER_UNLOCK_HASH) setRegisterUnlocked(true)
      })
  }, [email, password])

  const refreshAccounts = () => {
    listAdminAccounts()
      .then(data => setAccounts(data.accounts || []))
      .catch(() => toast.error("刷新账号列表失败，请重新登录"))
  }

  useEffect(() => {
    refreshAccounts()
  }, [])

  const stats = useMemo(() => countAccountStats(accounts), [accounts])

  const addAccount = () => {
    if (!token.trim()) {
      toast.error("请先填写 Token")
      return
    }
    const id = toast.loading("正在注入账号...")
    addAdminAccount({ email: email || `manual_${Date.now()}@qwen`, password, token })
      .then(data => {
        if (!data.ok) {
          toast.error(localizeAccountError(data.error) || "账号注入失败", { id, duration: 8000 })
          return
        }
        toast.success("账号已加入账号池", { id })
        setEmail("")
        setPassword("")
        setToken("")
        refreshAccounts()
      })
      .catch(error => toast.error(error.message || "账号注入请求失败", { id }))
  }

  const deleteAccount = (targetEmail: string) => {
    const id = toast.loading(`正在删除 ${targetEmail}...`)
    deleteAdminAccount(targetEmail)
      .then(() => {
        toast.success(`已删除 ${targetEmail}`, { id })
        refreshAccounts()
      })
      .catch(error => toast.error(error.message || "删除账号失败", { id }))
  }

  const registerAccount = () => {
    setRegistering(true)
    const id = toast.loading("正在自动注册新账号，请稍候...")
    registerAdminAccount()
      .then(data => {
        if (data.activation_pending) {
          toast.warning(`账号已注册，但仍需激活：${data.email}`, { id, duration: 8000 })
        } else if (data.ok) {
          toast.success(data.message || `注册成功：${data.email}`, { id, duration: 8000 })
        } else {
          toast.error(localizeAccountError(data.error) || "自动注册失败", { id, duration: 8000 })
        }
        if (data.ok || data.email) refreshAccounts()
      })
      .catch(error => toast.error(error.message || "自动注册请求失败", { id }))
      .finally(() => setRegistering(false))
  }

  const verifyAccount = (targetEmail: string) => {
    setVerifying(targetEmail)
    const id = toast.loading(`正在验证 ${targetEmail}...`)
    verifyAdminAccount(targetEmail)
      .then(data => {
        if (data.valid) toast.success(`验证通过：${targetEmail}`, { id })
        else toast.error(`验证失败：${localizeAccountError(data.error || data.message)}`, { id, duration: 8000 })
        refreshAccounts()
      })
      .catch(error => toast.error(error.message || "验证请求失败", { id }))
      .finally(() => setVerifying(null))
  }

  const verifyAllAccounts = () => {
    setVerifyingAll(true)
    const id = toast.loading("正在并发巡检所有账号...")
    verifyAllAdminAccounts()
      .then(data => {
        if (data.ok) toast.success(`全量巡检完成，并发数：${data.concurrency || 1}`, { id })
        else toast.error("全量巡检失败", { id })
        refreshAccounts()
      })
      .catch(error => toast.error(error.message || "全量巡检请求失败", { id }))
      .finally(() => setVerifyingAll(false))
  }

  const activateAccount = (targetEmail: string) => {
    const id = toast.loading(`正在激活 ${targetEmail}...`)
    activateAdminAccount(targetEmail)
      .then(data => {
        if (data.pending) toast.success(`账号正在激活中，请稍后刷新：${targetEmail}`, { id, duration: 6000 })
        else if (data.ok) toast.success(data.message || `激活成功：${targetEmail}`, { id, duration: 6000 })
        else toast.error(`激活失败：${localizeAccountError(data.error || data.message)}`, { id, duration: 8000 })
        refreshAccounts()
      })
      .catch(error => toast.error(error.message || "激活请求失败", { id }))
  }

  return {
    accounts,
    stats,
    form: { email, password, token },
    setEmail,
    setPassword,
    setToken,
    registering,
    registerUnlocked,
    verifying,
    verifyingAll,
    refreshAccounts,
    addAccount,
    deleteAccount,
    registerAccount,
    verifyAccount,
    verifyAllAccounts,
    activateAccount,
  }
}
