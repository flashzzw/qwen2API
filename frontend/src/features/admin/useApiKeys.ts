import { useEffect, useState } from "react"
import { toast } from "sonner"
import { createAdminKey, deleteAdminKey, listAdminKeys } from "./api"

export function useApiKeys() {
  const [keys, setKeys] = useState<string[]>([])
  const [copied, setCopied] = useState<string | null>(null)

  const refreshKeys = () => {
    listAdminKeys()
      .then(data => setKeys(data.keys || []))
      .catch(() => toast.error("刷新失败，请检查会话 Key"))
  }

  useEffect(() => {
    refreshKeys()
  }, [])

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(null), 2000)
  }

  const generateKey = () => {
    createAdminKey()
      .then(data => {
        toast.success("已生成新的 API Key")
        if (data.key) copyToClipboard(data.key)
        refreshKeys()
      })
      .catch(error => toast.error(error.message || "生成失败，请检查权限"))
  }

  const deleteKey = (key: string) => {
    deleteAdminKey(key)
      .then(() => {
        toast.success("API Key 已删除")
        refreshKeys()
      })
      .catch(error => toast.error(error.message || "删除失败"))
  }

  return { keys, copied, refreshKeys, generateKey, deleteKey, copyToClipboard }
}
