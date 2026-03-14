import type { TiledChunk } from "@/types/tiled"

type TileChunk = {
  x: number
  y: number
  width: number
  height: number
  data: Uint32Array
}

function keyByChunk(chunkX: number, chunkY: number) {
  return `${chunkX},${chunkY}`
}

function floorDiv(value: number, divisor: number) {
  return Math.floor(value / divisor)
}

export class ChunkedTileGrid {
  private readonly chunkWidth: number
  private readonly chunkHeight: number
  private chunks = new Map<string, TileChunk>()

  constructor(chunkWidth = 16, chunkHeight = 16) {
    this.chunkWidth = chunkWidth
    this.chunkHeight = chunkHeight
  }

  public get(cellX: number, cellY: number): number {
    const chunk = this.getChunk(cellX, cellY)
    if (!chunk) return 0

    const index = this.getIndexInChunk(chunk, cellX, cellY)
    return chunk.data[index]
  }

  public set(cellX: number, cellY: number, rawGid: number) {
    const chunk = this.getOrCreateChunk(cellX, cellY)
    const index = this.getIndexInChunk(chunk, cellX, cellY)
    chunk.data[index] = rawGid
  }

  public clear() {
    this.chunks.clear()
  }

  public exportChunks(): TiledChunk[] {
    const chunks: TiledChunk[] = []

    this.chunks.forEach((chunk) => {
      chunks.push({
        x: chunk.x,
        y: chunk.y,
        width: chunk.width,
        height: chunk.height,
        data: Array.from(chunk.data),
      })
    })

    return chunks
  }

  private getChunk(cellX: number, cellY: number): TileChunk | null {
    const chunkX = floorDiv(cellX, this.chunkWidth)
    const chunkY = floorDiv(cellY, this.chunkHeight)
    return this.chunks.get(keyByChunk(chunkX, chunkY)) ?? null
  }

  private getOrCreateChunk(cellX: number, cellY: number): TileChunk {
    const chunkX = floorDiv(cellX, this.chunkWidth)
    const chunkY = floorDiv(cellY, this.chunkHeight)
    const key = keyByChunk(chunkX, chunkY)

    const existed = this.chunks.get(key)
    if (existed) return existed

    const created: TileChunk = {
      x: chunkX * this.chunkWidth,
      y: chunkY * this.chunkHeight,
      width: this.chunkWidth,
      height: this.chunkHeight,
      data: new Uint32Array(this.chunkWidth * this.chunkHeight),
    }

    this.chunks.set(key, created)
    return created
  }

  private getIndexInChunk(chunk: TileChunk, cellX: number, cellY: number) {
    const localX = cellX - chunk.x
    const localY = cellY - chunk.y
    return localY * chunk.width + localX
  }
}
