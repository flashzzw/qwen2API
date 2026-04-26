import { useMemo, useState } from "react"
import { toast } from "sonner"
import { generateImages } from "./api"
import { ASPECT_RATIOS } from "./constants"
import type { GeneratedImage } from "./types"

export function useImageGeneration() {
  const [prompt, setPrompt] = useState("")
  const [ratio, setRatio] = useState("1:1")
  const [count, setCount] = useState(1)
  const [loading, setLoading] = useState(false)
  const [images, setImages] = useState<GeneratedImage[]>([])
  const [error, setError] = useState<string | null>(null)

  const selectedRatio = useMemo(() => {
    return ASPECT_RATIOS.find(item => item.value === ratio) || ASPECT_RATIOS[0]
  }, [ratio])
  const size = `${selectedRatio.w}x${selectedRatio.h}`

  const generate = async () => {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setError(null)

    try {
      const data = await generateImages({ prompt: prompt.trim(), n: count, size })
      const newImages = (data.data || []).flatMap(item => {
        if (!item.url) return []
        return [{ url: item.url, revised_prompt: item.revised_prompt || prompt, ratio }]
      })

      if (newImages.length === 0) {
        setError("未返回图片，请重试")
        toast.error("未返回图片，请重试")
        return
      }

      setImages(prev => [...newImages, ...prev])
      toast.success(`成功生成 ${newImages.length} 张图片`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "网络错误"
      setError(message)
      toast.error(`生成失败: ${message.slice(0, 80)}`)
    } finally {
      setLoading(false)
    }
  }

  const clearImages = () => setImages([])

  return {
    prompt,
    ratio,
    count,
    loading,
    images,
    error,
    size,
    setPrompt,
    setRatio,
    setCount,
    generate,
    clearImages,
  }
}
