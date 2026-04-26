import type { AspectRatio } from "./types"

export const ASPECT_RATIOS: AspectRatio[] = [
  { label: "1:1", value: "1:1", w: 1024, h: 1024 },
  { label: "16:9", value: "16:9", w: 1024, h: 576 },
  { label: "9:16", value: "9:16", w: 576, h: 1024 },
  { label: "4:3", value: "4:3", w: 1024, h: 768 },
  { label: "3:4", value: "3:4", w: 768, h: 1024 },
]

export const IMAGE_COUNTS = [1, 2, 4]
