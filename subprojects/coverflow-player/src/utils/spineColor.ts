export interface SpineColors {
  top: string
  mid: string
  bottom: string
}

const colorCache = new Map<string, SpineColors>()

function averageRgb(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): string {
  let r = 0
  let g = 0
  let b = 0
  let count = 0
  const xStart = Math.max(0, Math.floor(x0))
  const yStart = Math.max(0, Math.floor(y0))
  const xEnd = Math.min(width, Math.ceil(x1))
  const yEnd = Math.min(height, Math.ceil(y1))

  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const i = (y * width + x) * 4
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
      count++
    }
  }

  if (count === 0) return 'rgb(26, 26, 26)'
  return `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`
}

/** Sample top / mid / bottom colors from the cover center band (once per URL). */
export function sampleImageSpineColors(url: string): Promise<SpineColors> {
  const cached = colorCache.get(url)
  if (cached) return Promise.resolve(cached)

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas 2D unavailable'))
        return
      }
      ctx.drawImage(img, 0, 0)

      const bandW = w * 0.28
      const bandX0 = (w - bandW) / 2
      const bandX1 = bandX0 + bandW
      const rowH = h * 0.18

      const { data } = ctx.getImageData(0, 0, w, h)
      const colors: SpineColors = {
        top: averageRgb(data, w, h, bandX0, 0, bandX1, rowH),
        mid: averageRgb(data, w, h, bandX0, h / 2 - rowH / 2, bandX1, h / 2 + rowH / 2),
        bottom: averageRgb(data, w, h, bandX0, h - rowH, bandX1, h),
      }

      colorCache.set(url, colors)
      resolve(colors)
    }
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

/** @deprecated Use sampleImageSpineColors - kept for single-color fallback */
export function sampleImageCenterColor(url: string): Promise<string> {
  return sampleImageSpineColors(url).then((c) => c.mid)
}
