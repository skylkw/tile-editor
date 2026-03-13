import type { LeaferEngine } from "@/core/engine/leafer-engine"
import { readTileLayerCells } from "@/core/io/tiled-map"
import { Rect } from "leafer-ui"
import { ChunkedTileGrid } from "./chunked-grid"
import { decodeTiledGid, encodeTiledGid } from "./tiled-gid"
import type { TiledTileLayer } from "./tiled-types"

function keyByCell(cellX: number, cellY: number) {
  return `${cellX},${cellY}`
}

/**
 * Tile 图块层（业务层）：
 * - 不属于底层引擎职责
 * - 依赖引擎提供的坐标/画布能力完成图块增删改
 */
export class TileLayer {
  private engine: LeaferEngine
  private tiles: Record<string, Rect> = {}
  private readonly tileData = new ChunkedTileGrid(16, 16)

  constructor(engine: LeaferEngine) {
    this.engine = engine
  }

  /**
   * 在指定格子放置或覆盖一个 tile。
   */
  public setTile(cellX: number, cellY: number, fill = "#4f46e5") {
    this.setTileGid(cellX, cellY, 1, fill)
  }

  /**
   * 在指定格子放置或覆盖一个 tile（Tiled raw GID）。
   */
  public setTileGid(
    cellX: number,
    cellY: number,
    rawGid: number,
    fill = "#4f46e5"
  ) {
    if (rawGid === 0) {
      this.removeTile(cellX, cellY)
      return
    }

    this.tileData.set(cellX, cellY, rawGid)

    const key = keyByCell(cellX, cellY)
    const existed = this.tiles[key]
    if (existed) existed.destroy()

    const world = this.engine.cellToWorld(cellX, cellY)
    const size = this.engine.getCellSize()

    const tileRect = new Rect({
      x: world.x,
      y: world.y,
      width: size,
      height: size,
      fill,
    })

    this.tiles[key] = tileRect
    this.engine.getApp().tree.add(tileRect)
  }

  /**
   * 获取指定格子的 raw GID（0 表示空）。
   */
  public getTileGid(cellX: number, cellY: number) {
    return this.tileData.get(cellX, cellY)
  }

  /**
   * 更新指定格子的翻转位并保持原有 gid。
   */
  public setTileFlipFlags(
    cellX: number,
    cellY: number,
    flags: {
      flipH?: boolean
      flipV?: boolean
      flipD?: boolean
      rotateHex120?: boolean
    }
  ) {
    const raw = this.tileData.get(cellX, cellY)
    if (raw === 0) return

    const decoded = decodeTiledGid(raw)
    const nextRaw = encodeTiledGid(decoded.gid, {
      flipH: flags.flipH ?? decoded.flipH,
      flipV: flags.flipV ?? decoded.flipV,
      flipD: flags.flipD ?? decoded.flipD,
      rotateHex120: flags.rotateHex120 ?? decoded.rotateHex120,
    })

    this.tileData.set(cellX, cellY, nextRaw)
  }

  /**
   * 从 Tiled tilelayer 导入图块（支持 chunks 与 data）。
   */
  public importTiledTileLayer(
    layer: TiledTileLayer,
    options?: {
      mapWidth?: number
      mapHeight?: number
      fillResolver?: (rawGid: number) => string
    }
  ) {
    this.clear()

    const fillResolver = options?.fillResolver ?? this.defaultFillResolver
    const cells = readTileLayerCells(
      layer,
      options?.mapWidth,
      options?.mapHeight
    )

    for (const cell of cells) {
      this.setTileGid(
        cell.cellX,
        cell.cellY,
        cell.rawGid,
        fillResolver(cell.rawGid)
      )
    }
  }

  /**
   * 删除指定格子中的 tile。
   */
  public removeTile(cellX: number, cellY: number) {
    this.tileData.set(cellX, cellY, 0)

    const key = keyByCell(cellX, cellY)
    const node = this.tiles[key]
    if (!node) return

    node.destroy()
    delete this.tiles[key]
  }

  /**
   * 清空所有 tile。
   */
  public clear() {
    Object.values(this.tiles).forEach((node) => node.destroy())
    this.tiles = {}
    this.tileData.clear()
  }

  /**
   * 导出为 Tiled tilelayer 的 chunk 结构（适配 infinite map）。
   */
  public exportTiledTileLayer(name = "Tile Layer 1"): TiledTileLayer {
    return {
      name,
      type: "tilelayer",
      visible: true,
      opacity: 1,
      x: 0,
      y: 0,
      chunks: this.tileData.exportChunks(),
    }
  }

  private defaultFillResolver(rawGid: number) {
    const decoded = decodeTiledGid(rawGid)
    const hue = (decoded.gid * 37) % 360
    return `hsl(${hue}, 68%, 56%)`
  }

  /**
   * 释放资源。
   */
  public destroy() {
    this.clear()
  }
}
