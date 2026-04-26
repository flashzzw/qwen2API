export type AspectRatio = {
  label: string
  value: string
  w: number
  h: number
}

export type GeneratedImage = {
  url: string
  revised_prompt: string
  ratio: string
}

export type ImageApiResponse = {
  data?: Array<{
    url?: string
    revised_prompt?: string
  }>
  detail?: string
  error?: string
}
