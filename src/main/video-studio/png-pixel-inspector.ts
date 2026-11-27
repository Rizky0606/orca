import { readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'

export type DecodedPng = {
  width: number
  height: number
  channels: 3 | 4
  data: Uint8Array
}

export type PixelRect = {
  x: number
  y: number
  width: number
  height: number
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) {
    return a
  }
  if (pb <= pc) {
    return b
  }
  return c
}

export function decodePngPixels(buffer: Buffer): DecodedPng {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Invalid PNG signature')
  }
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idatChunks: Buffer[] = []

  let offset = 8
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > buffer.length) {
      break
    }
    const payload = buffer.subarray(dataStart, dataEnd)
    if (type === 'IHDR') {
      width = payload.readUInt32BE(0)
      height = payload.readUInt32BE(4)
      bitDepth = payload[8] ?? 0
      colorType = payload[9] ?? 0
    } else if (type === 'IDAT') {
      idatChunks.push(payload)
    } else if (type === 'IEND') {
      break
    }
    offset = dataEnd + 4
  }

  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`)
  }
  const channels: 3 | 4 = colorType === 6 ? 4 : 3
  const stride = width * channels
  const inflated = inflateSync(Buffer.concat(idatChunks))
  const pixels = new Uint8Array(width * height * channels)

  for (let y = 0; y < height; y++) {
    const srcRowStart = y * (stride + 1)
    const filter = inflated[srcRowStart] ?? 0
    const dstRowStart = y * stride
    for (let x = 0; x < stride; x++) {
      const raw = inflated[srcRowStart + 1 + x] ?? 0
      const a = x >= channels ? pixels[dstRowStart + x - channels]! : 0
      const b = y > 0 ? pixels[dstRowStart - stride + x]! : 0
      const c = y > 0 && x >= channels ? pixels[dstRowStart - stride + x - channels]! : 0
      let recon = raw
      if (filter === 1) {
        recon = (raw + a) & 0xff
      } else if (filter === 2) {
        recon = (raw + b) & 0xff
      } else if (filter === 3) {
        recon = (raw + ((a + b) >> 1)) & 0xff
      } else if (filter === 4) {
        recon = (raw + paethPredictor(a, b, c)) & 0xff
      }
      pixels[dstRowStart + x] = recon
    }
  }
  return { width, height, channels, data: pixels }
}

export async function readDecodedPng(filePath: string): Promise<DecodedPng> {
  return decodePngPixels(await readFile(filePath))
}

export function sampleAverageRgb(
  png: DecodedPng,
  rect: PixelRect
): { r: number; g: number; b: number } {
  let r = 0
  let g = 0
  let b = 0
  let count = 0
  const maxX = Math.min(png.width, rect.x + rect.width)
  const maxY = Math.min(png.height, rect.y + rect.height)
  for (let y = Math.max(0, rect.y); y < maxY; y++) {
    for (let x = Math.max(0, rect.x); x < maxX; x++) {
      const idx = (y * png.width + x) * png.channels
      r += png.data[idx]!
      g += png.data[idx + 1]!
      b += png.data[idx + 2]!
      count += 1
    }
  }
  return count === 0 ? { r: 0, g: 0, b: 0 } : { r: r / count, g: g / count, b: b / count }
}

export function computeRegionDiffFraction(
  pngA: DecodedPng,
  pngB: DecodedPng,
  rect: PixelRect,
  channelDeltaThreshold = 18
): number {
  const maxX = Math.min(pngA.width, pngB.width, rect.x + rect.width)
  const maxY = Math.min(pngA.height, pngB.height, rect.y + rect.height)
  let total = 0
  let diff = 0
  for (let y = Math.max(0, rect.y); y < maxY; y++) {
    for (let x = Math.max(0, rect.x); x < maxX; x++) {
      const idxA = (y * pngA.width + x) * pngA.channels
      const idxB = (y * pngB.width + x) * pngB.channels
      const delta =
        Math.abs(pngA.data[idxA]! - pngB.data[idxB]!) +
        Math.abs(pngA.data[idxA + 1]! - pngB.data[idxB + 1]!) +
        Math.abs(pngA.data[idxA + 2]! - pngB.data[idxB + 2]!)
      if (delta >= channelDeltaThreshold) {
        diff += 1
      }
      total += 1
    }
  }
  return total === 0 ? 0 : diff / total
}
