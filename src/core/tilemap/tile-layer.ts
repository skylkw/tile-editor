import type { LeaferEngine } from "@/core/engine/leafer-engine"
import { Rect } from "leafer-ui"

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

  constructor(engine: LeaferEngine) {
    this.engine = engine
  }

  /**
   * 在指定格子放置或覆盖一个 tile。
   */
  public setTile(cellX: number, cellY: number, fill = "#4f46e5") {
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
   * 删除指定格子中的 tile。
   */
  public removeTile(cellX: number, cellY: number) {
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
  }

  /**
   * 释放资源。
   */
  public destroy() {
    this.clear()
  }
}
