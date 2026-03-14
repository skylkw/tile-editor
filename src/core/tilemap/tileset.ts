import type { TiledTilesetRef } from "./tiled-types"

export interface TilesetOptions {
  name: string
  image: string
  sourcePath?: string
  tileWidth: number
  tileHeight: number
  margin?: number
  spacing?: number
  firstGid?: number
}

export interface TilesetTileDescriptor {
  gid: number
  localId: number
  column: number
  row: number
  x: number
  y: number
  width: number
  height: number
}

export interface TilesetStampCell {
  offsetX: number
  offsetY: number
  gid: number
}

export interface TilesetStamp {
  width: number
  height: number
  primaryGid: number
  cells: TilesetStampCell[]
}

function requirePositiveInteger(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new Error(`${name} 必须是正整数`)
  }

  return value
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new globalThis.Image()

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("图集加载失败"))
    image.src = url
  })
}

/**
 * Tileset 管理器：
 * - 异步加载图集并解析切片信息
 * - 按需缓存单 tile 图片，用于画布内渲染和面板预览
 */
export class Tileset {
  public readonly name: string
  public readonly image: string
  public readonly sourcePath?: string
  public readonly tileWidth: number
  public readonly tileHeight: number
  public readonly margin: number
  public readonly spacing: number
  public readonly firstGid: number
  public readonly imageWidth: number
  public readonly imageHeight: number
  public readonly columns: number
  public readonly rows: number
  public readonly tileCount: number
  public readonly lastGid: number

  private readonly imageElement: HTMLImageElement
  private readonly tiles: TilesetTileDescriptor[]
  private readonly tileUrlCache = new Map<number, string>()

  private constructor(options: TilesetOptions, imageElement: HTMLImageElement) {
    this.name = options.name
    this.image = options.image
    this.sourcePath = options.sourcePath
    this.tileWidth = requirePositiveInteger("tileWidth", options.tileWidth)
    this.tileHeight = requirePositiveInteger("tileHeight", options.tileHeight)
    this.margin = options.margin ?? 0
    this.spacing = options.spacing ?? 0
    this.firstGid = options.firstGid ?? 1
    this.imageElement = imageElement
    this.imageWidth = imageElement.width
    this.imageHeight = imageElement.height

    this.columns = Math.max(
      0,
      Math.floor(
        (this.imageWidth - this.margin * 2 + this.spacing) /
          (this.tileWidth + this.spacing)
      )
    )
    this.rows = Math.max(
      0,
      Math.floor(
        (this.imageHeight - this.margin * 2 + this.spacing) /
          (this.tileHeight + this.spacing)
      )
    )
    this.tileCount = this.columns * this.rows
    this.lastGid = this.firstGid + this.tileCount - 1

    if (!this.tileCount) {
      throw new Error("图集尺寸与 tile 大小不匹配，无法切片")
    }

    this.tiles = Array.from({ length: this.tileCount }, (_, index) => {
      const localId = index + 1
      const column = index % this.columns
      const row = Math.floor(index / this.columns)

      return {
        gid: this.firstGid + index,
        localId,
        column,
        row,
        x: this.margin + column * (this.tileWidth + this.spacing),
        y: this.margin + row * (this.tileHeight + this.spacing),
        width: this.tileWidth,
        height: this.tileHeight,
      }
    })
  }

  public static async fromUrl(options: TilesetOptions) {
    const imageElement = await loadImage(options.image)
    return new Tileset(options, imageElement)
  }

  public listTiles() {
    return this.tiles
  }

  public listTileGids() {
    return this.tiles.map((tile) => tile.gid)
  }

  public containsGid(gid: number) {
    return gid >= this.firstGid && gid <= this.lastGid
  }

  public getTileDescriptors(gids: number[]) {
    const gidSet = new Set(gids)
    return this.tiles.filter((tile) => gidSet.has(tile.gid))
  }

  public getTileDescriptor(gid: number) {
    return this.tiles.find((tile) => tile.gid === gid) ?? null
  }

  public createStamp(gids: number[]): TilesetStamp | null {
    const descriptors = this.getTileDescriptors(gids)
    if (!descriptors.length) return null

    const sorted = [...descriptors].sort((left, right) => {
      if (left.row !== right.row) return left.row - right.row
      return left.column - right.column
    })

    const minColumn = Math.min(...sorted.map((tile) => tile.column))
    const maxColumn = Math.max(...sorted.map((tile) => tile.column))
    const minRow = Math.min(...sorted.map((tile) => tile.row))
    const maxRow = Math.max(...sorted.map((tile) => tile.row))

    return {
      width: maxColumn - minColumn + 1,
      height: maxRow - minRow + 1,
      primaryGid: sorted[0].gid,
      cells: sorted.map((tile) => ({
        offsetX: tile.column - minColumn,
        offsetY: tile.row - minRow,
        gid: tile.gid,
      })),
    }
  }

  public getTileRect(gid: number) {
    const tile = this.getTileDescriptor(gid)
    if (!tile) return null

    return {
      x: tile.x,
      y: tile.y,
      width: tile.width,
      height: tile.height,
    }
  }

  public getTileAtImagePoint(imageX: number, imageY: number) {
    return (
      this.tiles.find(
        (tile) =>
          imageX >= tile.x &&
          imageX < tile.x + tile.width &&
          imageY >= tile.y &&
          imageY < tile.y + tile.height
      ) ?? null
    )
  }

  public getTilesInImageBounds(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ) {
    const minX = Math.min(startX, endX)
    const minY = Math.min(startY, endY)
    const maxX = Math.max(startX, endX)
    const maxY = Math.max(startY, endY)

    return this.tiles.filter((tile) => {
      const tileMaxX = tile.x + tile.width
      const tileMaxY = tile.y + tile.height

      return (
        tileMaxX > minX &&
        tile.x < maxX &&
        tileMaxY > minY &&
        tile.y < maxY
      )
    })
  }

  public getTileImageUrl(gid: number) {
    const cached = this.tileUrlCache.get(gid)
    if (cached) return cached

    const rect = this.getTileRect(gid)
    if (!rect) return null

    const canvas = document.createElement("canvas")
    canvas.width = this.tileWidth
    canvas.height = this.tileHeight

    const context = canvas.getContext("2d")
    if (!context) return null

    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(
      this.imageElement,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      canvas.width,
      canvas.height
    )

    const dataUrl = canvas.toDataURL()
    this.tileUrlCache.set(gid, dataUrl)
    return dataUrl
  }

  public toTiledTilesetRef(): TiledTilesetRef {
    return {
      firstgid: this.firstGid,
      name: this.name,
      image: this.sourcePath ?? this.image,
      tilewidth: this.tileWidth,
      tileheight: this.tileHeight,
      tilecount: this.tileCount,
      columns: this.columns,
      spacing: this.spacing,
      margin: this.margin,
    }
  }
}
