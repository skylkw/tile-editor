/**
 * Tileset (图集) 管理模块
 * 
 * 负责解析 Tileset 图片、处理切片逻辑、并生成缩略图 URL。
 */
import type { TiledTilesetRef } from "@/types/tiled"
import type {
  TilesetConfig,
  TilesetTileDescriptor,
  TilesetStamp,
} from "@/types/tilemap"
import { clearTiledGidFlags, decodeTiledGid } from "./tiled-gid"
import { getRelativePath, normalizePath } from "@/components/editor/utils"
import { convertFileSrc } from "@tauri-apps/api/core"

/** 异步加载图片 */
function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new globalThis.Image()
    image.crossOrigin = "anonymous" // 关键：允许画布读取跨域资源（如 asset:// 协议图片）

    // 检查是否已经是网络/Blob/Data/Asset URL，如果不是则视为本地路径进行转换
    const isUrl = /^(http|https|blob|data|asset):/i.test(source)
    const url = isUrl ? source : convertFileSrc(source)

    image.onload = () => resolve(image)
    image.onerror = (e) => {
      console.error("loadImage error for source:", source, "transformed url:", url, e)
      reject(new Error("图集加载失败"))
    }
    image.src = url
  })
}

/**
 * Tileset 管理类：
 * - 维护图集元数据
 * - 缓存单 Tile 的图片 URL
 * - 提供根据坐标或 ID 查找 Tile 的方法
 */
export class Tileset {
  public readonly config: TilesetConfig
  public readonly imageWidth: number
  public readonly imageHeight: number
  public readonly columns: number
  public readonly rows: number
  public readonly tileCount: number
  public readonly lastGid: number

  private readonly imageElement: HTMLImageElement
  private readonly tiles: TilesetTileDescriptor[]
  // 缓存切割后的单 Tile 图片 DataURL，避免重复创建 Canvas 性能损耗
  private readonly tileUrlCache = new Map<number, string>()

  // 快捷访问配置项的 Getters
  get name() { return this.config.name }
  get image() { return this.imageElement.src } // 确保返回的是经过 convertFileSrc 处理后的、可供浏览器显示的 URL
  get sourcePath() { return this.config.sourcePath }
  get tileWidth() { return this.config.tileWidth }
  get tileHeight() { return this.config.tileHeight }
  get margin() { return this.config.margin }
  get spacing() { return this.config.spacing }
  get firstGid() { return this.config.firstGid }

  private constructor(config: TilesetConfig, imageElement: HTMLImageElement) {
    this.config = config
    this.imageElement = imageElement
    this.imageWidth = imageElement.width
    this.imageHeight = imageElement.height

    // 计算总列数
    this.columns = Math.max(
      0,
      Math.floor(
        (this.imageWidth - this.margin * 2 + this.spacing) /
          (this.tileWidth + this.spacing)
      )
    )
    // 计算总行数
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

    // 预先生成所有 Tile 的位置描述信息
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

  /**
   * 工厂方法：从 URL 加载图片并初始化 Tileset。
   */
  public static async fromUrl(config: TilesetConfig) {
    const imageElement = await loadImage(config.image)
    return new Tileset(config, imageElement)
  }

  /** 返回所有 Tile 描述 */
  public listTiles() {
    return this.tiles
  }

  /** 返回所有 GID 列表 */
  public listTileGids() {
    return this.tiles.map((tile) => tile.gid)
  }

  /** 检查某个 GID 是否属于此图集 */
  public containsGid(gid: number) {
    return gid >= this.firstGid && gid <= this.lastGid
  }

  /** 批量获取 Tile 描述 */
  public getTileDescriptors(gids: number[]) {
    const gidSet = new Set(gids)
    return this.tiles.filter((tile) => gidSet.has(tile.gid))
  }

  /** 获取单个 Tile 描述 */
  public getTileDescriptor(gid: number) {
    const resolvedGid = clearTiledGidFlags(gid)
    return this.tiles.find((tile) => tile.gid === resolvedGid) ?? null
  }

  /**
   * 根据选中的一组 GID 创建一个 Stamp。
   * 会自动计算包围盒和相对偏移。
   */
  public createStamp(gids: number[]): TilesetStamp | null {
    const descriptors = this.getTileDescriptors(gids)
    if (!descriptors.length) return null

    // 按行、列排序，确保左上角第一个是 Primary Tile
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

  /** 获取索引对应的像素位置信息 */
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

  /** 根据图集图片上的点击位置查找 Tile */
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

  /** 根据矩形区域选择一组 Tile */
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

  /**
   * 获取单个瓷砖的图片 URL (DataURL)。
   * 支持应用 Tiled 变换标记 (翻转/旋转)。
   */
  public getTileImageUrl(gid: number) {
    const decoded = decodeTiledGid(gid)
    const rawGid = decoded.raw
    // 检查缓存，包含变换后的 GID 也是独立缓存的
    const cached = this.tileUrlCache.get(rawGid)
    if (cached) return cached

    const rect = this.getTileRect(decoded.gid)
    if (!rect) return null

    // 创建离屏 Canvas 进行切片绘制和变换
    const canvas = document.createElement("canvas")
    canvas.width = this.tileWidth
    canvas.height = this.tileHeight

    const context = canvas.getContext("2d")
    if (!context) return null

    context.imageSmoothingEnabled = false // 禁用平滑，保持像素锐利
    context.clearRect(0, 0, canvas.width, canvas.height)
    
    // 应用翻转和旋转变换
    this.applyTiledTransform(context, decoded)
    
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
    this.tileUrlCache.set(rawGid, dataUrl)
    return dataUrl
  }

  /**
   * 转换为导出所需的 Tiled 引用对象。
   */
  public toTiledTilesetRef(options?: { mapPath?: string }): TiledTilesetRef {
    let imagePath = this.sourcePath ?? this.image

    if (options?.mapPath && this.sourcePath) {
      imagePath = getRelativePath(options.mapPath, this.sourcePath)
    } else if (this.sourcePath) {
      imagePath = normalizePath(this.sourcePath)
    }

    return {
      firstgid: this.firstGid,
      name: this.name,
      image: imagePath,
      imagewidth: this.imageWidth,
      imageheight: this.imageHeight,
      tilewidth: this.tileWidth,
      tileheight: this.tileHeight,
      tilecount: this.tileCount,
      columns: this.columns,
      spacing: this.spacing,
      margin: this.margin,
    }
  }

  /**
   * 在 Canvas 上应用 Tiled 的变换逻辑 (基于矩阵)。
   */
  private applyTiledTransform(
    context: CanvasRenderingContext2D,
    decoded: ReturnType<typeof decodeTiledGid>
  ) {
    const size = this.tileWidth
    let a = 1
    let b = 0
    let c = 0
    let d = 1
    let e = 0
    let f = 0

    // 矩阵乘法
    const multiply = (
      nextA: number,
      nextB: number,
      nextC: number,
      nextD: number,
      nextE: number,
      nextF: number
    ) => {
      const currentA = a
      const currentB = b
      const currentC = c
      const currentD = d
      const currentE = e
      const currentF = f

      a = nextA * currentA + nextC * currentB
      b = nextB * currentA + nextD * currentB
      c = nextA * currentC + nextC * currentD
      d = nextB * currentC + nextD * currentD
      e = nextA * currentE + nextC * currentF + nextE
      f = nextB * currentE + nextD * currentF + nextF
    }

    // Tiled 变换顺序：Diagonal(对角) -> Horizontal(水平) -> Vertical(垂直)
    if (decoded.flipD) {
      multiply(0, 1, 1, 0, 0, 0)
    }

    if (decoded.flipH) {
      multiply(-1, 0, 0, 1, size, 0)
    }

    if (decoded.flipV) {
      multiply(1, 0, 0, -1, 0, size)
    }

    context.setTransform(a, b, c, d, e, f)
  }
}
