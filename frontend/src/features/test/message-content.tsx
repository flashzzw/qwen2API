type Segment = {
  start: number
  end: number
  url: string
}

const IMAGE_URL_PATTERN = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s"<>]+\.(?:jpg|jpeg|png|webp|gif)[^\s"<>]*)/gi

function extractImageSegments(content: string) {
  const segments: Segment[] = []
  let match: RegExpExecArray | null
  IMAGE_URL_PATTERN.lastIndex = 0
  while ((match = IMAGE_URL_PATTERN.exec(content)) !== null) {
    segments.push({ start: match.index, end: match.index + match[0].length, url: (match[1] || match[2]) as string })
  }
  return segments
}

export function MessageContent({ content }: { content: string }) {
  const segments = extractImageSegments(content)
  if (segments.length === 0) {
    return <div className="whitespace-pre-wrap leading-relaxed">{content}</div>
  }

  const nodes: ReactNode[] = []
  let cursor = 0
  segments.forEach((segment, index) => {
    if (segment.start > cursor) {
      nodes.push(<span key={`text-${index}`}>{content.slice(cursor, segment.start)}</span>)
    }
    nodes.push(<ImageSegment key={`image-${index}`} url={segment.url} />)
    cursor = segment.end
  })
  if (cursor < content.length) {
    nodes.push(<span key="tail">{content.slice(cursor)}</span>)
  }
  return <div className="whitespace-pre-wrap leading-relaxed">{nodes}</div>
}

function ImageSegment({ url }: { url: string }) {
  return (
    <div className="my-2">
      <img
        src={url}
        alt="generated"
        className="max-w-full rounded-lg shadow-md border"
        loading="lazy"
        onError={event => { event.currentTarget.style.display = "none" }}
      />
      <div className="text-xs text-muted-foreground mt-1 break-all font-mono">{url}</div>
    </div>
  )
}
import type { ReactNode } from "react"
