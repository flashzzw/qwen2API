import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { API_BASE } from "../../lib/api"
import { readAdminSettings, updateAdminSettings, type AdminSettings } from "./api"
import { buildCurlExample } from "./curl-example"

function applySettingsState(data: AdminSettings, setters: {
  setSettings: (value: AdminSettings) => void
  setMaxInflight: (value: number) => void
  setGlobalMaxInflight: (value: number) => void
  setPoolTarget: (value: number) => void
  setPoolTtlMin: (value: number) => void
  setModelAliases: (value: string) => void
}) {
  setters.setSettings(data)
  setters.setMaxInflight(data.max_inflight_per_account || 4)
  setters.setGlobalMaxInflight(data.global_max_inflight || 0)
  setters.setPoolTarget(data.chat_id_pool_target || 5)
  setters.setPoolTtlMin(Math.round((data.chat_id_pool_ttl_seconds || 600) / 60))
  setters.setModelAliases(JSON.stringify(data.model_aliases || {}, null, 2))
}

export function useAdminSettings() {
  const [settings, setSettings] = useState<AdminSettings | null>(null)
  const [maxInflight, setMaxInflight] = useState(4)
  const [globalMaxInflight, setGlobalMaxInflight] = useState(0)
  const [poolTarget, setPoolTarget] = useState(5)
  const [poolTtlMin, setPoolTtlMin] = useState(10)
  const [modelAliases, setModelAliases] = useState("")

  const refreshSettings = () => {
    readAdminSettings()
      .then(data => applySettingsState(data, {
        setSettings,
        setMaxInflight,
        setGlobalMaxInflight,
        setPoolTarget,
        setPoolTtlMin,
        setModelAliases,
      }))
      .catch(() => toast.error("配置获取失败，请重新登录后重试"))
  }

  useEffect(() => {
    refreshSettings()
  }, [])

  const saveConcurrency = () => {
    updateAdminSettings({
      max_inflight_per_account: Number(maxInflight),
      global_max_inflight: Number(globalMaxInflight),
    }).then(() => {
      toast.success("并发配置已保存（运行时立即生效）")
      refreshSettings()
    }).catch(error => toast.error(error.message || "保存失败"))
  }

  const savePool = () => {
    updateAdminSettings({
      chat_id_pool_target: Number(poolTarget),
      chat_id_pool_ttl_seconds: Number(poolTtlMin) * 60,
    }).then(() => {
      toast.success("预热池配置已保存（下一轮刷新生效）")
      refreshSettings()
    }).catch(error => toast.error(error.message || "保存失败"))
  }

  const saveAliases = () => {
    try {
      updateAdminSettings({ model_aliases: JSON.parse(modelAliases) })
        .then(() => {
          toast.success("模型映射规则已更新")
          refreshSettings()
        })
        .catch(error => toast.error(error.message || "保存失败"))
    } catch {
      toast.error("JSON 格式错误，请检查语法")
    }
  }

  const baseUrl = API_BASE || `http://${window.location.hostname}:7860`
  const curlExample = useMemo(() => buildCurlExample(baseUrl), [baseUrl])

  return {
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
  }
}
