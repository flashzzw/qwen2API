import { ImageGeneratorForm, ImageLoadingState, ImageResults } from "../features/images/components"
import { useImageGeneration } from "../features/images/useImageGeneration"

export default function ImagePage() {
  const imageGeneration = useImageGeneration()

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">图片生成</h2>
        <p className="text-muted-foreground">通过 Qwen3.6-Plus 生成 AI 图片，支持多种比例。</p>
      </div>

      <ImageGeneratorForm
        prompt={imageGeneration.prompt}
        ratio={imageGeneration.ratio}
        count={imageGeneration.count}
        loading={imageGeneration.loading}
        size={imageGeneration.size}
        error={imageGeneration.error}
        onPromptChange={imageGeneration.setPrompt}
        onRatioChange={imageGeneration.setRatio}
        onCountChange={imageGeneration.setCount}
        onGenerate={imageGeneration.generate}
      />

      {imageGeneration.loading ? <ImageLoadingState /> : null}
      {!imageGeneration.loading ? (
        <ImageResults images={imageGeneration.images} onClear={imageGeneration.clearImages} />
      ) : null}
    </div>
  )
}
