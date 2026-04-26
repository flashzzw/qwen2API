import { useEffect, useState } from "react"
import { toast } from "sonner"
import { readAdminStatus, type AdminStatus } from "./api"

export function useDashboardStatus() {
  const [status, setStatus] = useState<AdminStatus | null>(null)
  const [hasShownError, setHasShownError] = useState(false)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        setStatus(await readAdminStatus())
      } catch {
        if (!hasShownError) {
          toast.error("状态获取失败，请重新登录后重试。")
          setHasShownError(true)
        }
      }
    }

    fetchStatus()
    const timer = setInterval(fetchStatus, 3000)
    return () => clearInterval(timer)
  }, [hasShownError])

  return {
    status,
    accounts: status?.accounts || {},
    pool: status?.chat_id_pool,
    rows: status?.per_account || [],
  }
}
