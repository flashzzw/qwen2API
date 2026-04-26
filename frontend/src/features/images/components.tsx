import type { ReactNode } from "react"
import { Download, Image as ImageIcon, RefreshCw, Wand2 } from "lucide-react"
import { Button } from "../../components/ui/button"
import { ASPECT_RATIOS, IMAGE_COUNTS } from "./constants"
import type { GeneratedImage } from "./types"

type ImageGeneratorFormProps = {
  prompt: string
  ratio: string
  count: number
  loading: boolean
  size: string
  error: string | null
  onPromptChange: (value: string) => void
  onRatioChange: (value: string) => void
  onCountChange: (value: number) => void
  onGenerate: () => void
}

export function ImageGeneratorForm(props: ImageGeneratorFormProps) {
  return (
    <div className="rounded-xl border bg-card shadow-sm p-6 space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">图片描述 (Prompt)</label>
        <textarea
          rows={3}
          value={props.prompt}
          onChange={event => props.onPromptChange(event.target.value)}
          placeholder="描述你想生成的图片，例如：赛博朋克风格的猫咪，霓虹灯背景，超写实风格"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          disabled={props.loading}
          onKeyDown={event => {
            if (event.key === "Enter" && event.ctrlKey) props.onGenerate()
          }}
        />
        <p className="text-xs text-muted-foreground">Ctrl+Enter 快速生成</p>
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <OptionGroup label="图片比例">
          {ASPECT_RATIOS.map(item => (
            <OptionButton
              key={item.value}
              active={props.ratio === item.value}
              disabled={props.loading}
              onClick={() => props.onRatioChange(item.value)}
            >
              {item.label}
            </OptionButton>
          ))}
        </OptionGroup>

        <OptionGroup label="生成数量">
          {IMAGE_COUNTS.map(value => (
            <OptionButton
              key={value}
              active={props.count === value}
              disabled={props.loading}
              onClick={() => props.onCountChange(value)}
            >
              {value} 张
            </OptionButton>
          ))}
        </OptionGroup>

        <div className="text-xs text-muted-foreground font-mono bg-muted/50 border rounded-md px-2 py-1">
          {props.size}
        </div>

        <Button onClick={props.onGenerate} disabled={props.loading || !props.prompt.trim()} className="ml-auto h-10 px-6 gap-2">
          {props.loading
            ? <><RefreshCw className="h-4 w-4 animate-spin" /> 生成中...</>
            : <><Wand2 className="h-4 w-4" /> 生成图片</>
          }
        </Button>
      </div>

      {props.error ? (
        <div className="rounded-md bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 text-sm">
          {props.error}
        </div>
      ) : null}
    </div>
  )
}

export function ImageLoadingState() {
  return (
    <div className="rounded-xl border bg-card shadow-sm p-8">
      <div className="flex flex-col items-center justify-center gap-4 text-muted-foreground">
        <div className="relative">
          <ImageIcon className="h-16 w-16 text-muted-foreground/20" />
          <RefreshCw className="h-6 w-6 animate-spin absolute -bottom-1 -right-1 text-primary" />
        </div>
        <div className="text-center">
          <p className="font-medium">正在生成图片...</p>
          <p className="text-sm text-muted-foreground/70 mt-1">图片生成通常需要 10-30 秒，请耐心等待</p>
        </div>
      </div>
    </div>
  )
}

export function ImageResults({ images, onClear }: { images: GeneratedImage[]; onClear: () => void }) {
  if (images.length === 0) return <ImageEmptyState />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">生成结果 ({images.length} 张)</h3>
        <Button variant="ghost" size="sm" onClick={onClear}>清空</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {images.map((image, index) => (
          <GeneratedImageCard key={`${image.url}-${index}`} image={image} index={index} />
        ))}
      </div>
    </div>
  )
}

function GeneratedImageCard({ image, index }: { image: GeneratedImage; index: number }) {
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden group">
      <div className="relative bg-muted/30">
        <img
          src={image.url}
          alt={image.revised_prompt}
          className="w-full h-auto object-contain"
          loading="lazy"
          onError={event => {
            event.currentTarget.style.display = "none"
            event.currentTarget.nextElementSibling?.classList.remove("hidden")
          }}
        />
        <div className="hidden items-center justify-center p-8 text-muted-foreground text-sm">
          <ImageIcon className="h-8 w-8 mr-2" /> 图片加载失败
        </div>
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
          <Button size="sm" variant="secondary" onClick={() => downloadImage(image.url, index)} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> 下载
          </Button>
          <Button size="sm" variant="secondary" onClick={() => window.open(image.url, "_blank")}>
            在新窗口打开
          </Button>
        </div>
      </div>
      <div className="p-3 space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="bg-muted rounded px-1.5 py-0.5 font-mono">{image.ratio}</span>
          <span className="truncate">{image.revised_prompt.slice(0, 80)}</span>
        </div>
        <div className="text-xs text-muted-foreground font-mono truncate">{image.url}</div>
      </div>
    </div>
  )
}

function ImageEmptyState() {
  return (
    <div className="rounded-xl border bg-card/50 shadow-sm p-12">
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <ImageIcon className="h-16 w-16 text-muted-foreground/20" />
        <div className="text-center">
          <p className="font-medium">还没有生成图片</p>
          <p className="text-sm text-muted-foreground/70 mt-1">在上方输入描述，点击「生成图片」开始创作</p>
        </div>
      </div>
    </div>
  )
}

function OptionGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex gap-2">{children}</div>
    </div>
  )
}

function OptionButton({ active, disabled, onClick, children }: { active: boolean; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-all ${
        active
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
      }`}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function downloadImage(url: string, index: number) {
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `qwen_image_${Date.now()}_${index}.png`
  anchor.target = "_blank"
  anchor.rel = "noopener noreferrer"
  anchor.click()
}
