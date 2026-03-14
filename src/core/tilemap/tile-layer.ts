import type { LeaferEngine } from "@/core/engine/leafer-engine"
import type { GridMetrics } from "@/types/engine"
import { readTileLayerCells } from "@/core/io/tiled-map"
import { Group, Image, Rect } from "leafer-ui"
import { decodeTiledGid, encodeTiledGid } from "./tiled-gid"
import type { TiledTileLayer } from "@/types/tiled"
import type { Tileset } from "./tileset"

type TileNode = Image | Rect

export interface TileLayerOptions {
  id?: string
  name?: string
  visible?: boolean
  order?: number
}

/**
 * 有限尺寸 tile 图层：
 * - 使用定长数组保存地图数据
 * - 将非空格子渲染为节点，支持切换引擎后保留数据
 */
export class TileLayer {
  private readonly id: string
  private engine: LeaferEngine
  private tilesets: Tileset[] = []
  private layerGroup: Group
  private metrics: GridMetrics
  private tileData: Uint32Array
  private name: string
  private visible: boolean
  private order: number
  private readonly tiles = new Map<number, TileNode>()

  constructor(engine: LeaferEngine, options: TileLayerOptions = {}) {
    this.id = options.id ?? `layer-${Date.now()}`
    this.engine = engine
    this.metrics = engine.getGrid()
    this.tileData = new Uint32Array(this.metrics.cols * this.metrics.rows)
    this.name = options.name ?? "Tile Layer"
    this.visible = options.visible ?? true
    this.order = options.order ?? 0
    this.layerGroup = new Group({ visible: this.visible, zIndex: this.order })
    this.engine.getContentLayer().add(this.layerGroup)
  }

  public getId() {
    return this.id
  }

  public getName() {
    return this.name
  }

  public setName(name: string) {
    this.name = name.trim() || "Tile Layer"
  }

  public isVisible() {
    return this.visible
  }

  public getOrder() {
    return this.order
  }

  public setVisible(visible: boolean) {
    this.visible = visible
    this.layerGroup.set({ visible })
  }

  public setOrder(order: number) {
    this.order = order
    this.layerGroup.set({ zIndex: order })
  }

  public isAttachedTo(engine: LeaferEngine) {
    return this.engine === engine
  }

  public attachEngine(engine: LeaferEngine) {
    this.engine = engine
    this.layerGroup = new Group({
      visible: this.visible,
      zIndex: this.order,
    })
    this.engine.getContentLayer().add(this.layerGroup)
    this.resizeToMatchEngine()
    this.refresh()
  }

  public resizeToMatchEngine() {
    const nextMetrics = this.engine.getGrid()

    if (
      this.metrics.cols === nextMetrics.cols &&
      this.metrics.rows === nextMetrics.rows &&
      this.metrics.cellSize === nextMetrics.cellSize &&
      this.metrics.width === nextMetrics.width &&
      this.metrics.height === nextMetrics.height
    ) {
      return
    }

    const nextData = new Uint32Array(nextMetrics.cols * nextMetrics.rows)
    const copyCols = Math.min(this.metrics.cols, nextMetrics.cols)
    const copyRows = Math.min(this.metrics.rows, nextMetrics.rows)

    for (let row = 0; row < copyRows; row += 1) {
      const prevStart = row * this.metrics.cols
      const nextStart = row * nextMetrics.cols
      const slice = this.tileData.subarray(prevStart, prevStart + copyCols)
      nextData.set(slice, nextStart)
    }

    this.metrics = nextMetrics
    this.tileData = nextData
    this.clearNodesOnly()
    this.refresh()
  }

  public setTileset(tileset: Tileset | null) {
    this.setTilesets(tileset ? [tileset] : [])
  }

  public setTilesets(tilesets: Tileset[]) {
    this.tilesets = tilesets
    this.refresh()
  }

  public setTile(cellX: number, cellY: number, gid: number) {
    this.setTileGid(cellX, cellY, gid)
  }

  public setTileGid(cellX: number, cellY: number, rawGid: number) {
    if (!this.isInside(cellX, cellY)) return

    if (rawGid === 0) {
      this.removeTile(cellX, cellY)
      return
    }

    const index = this.getIndex(cellX, cellY)
    this.tileData[index] = rawGid
    this.renderTileAt(index, rawGid)
  }

  public getTileGid(cellX: number, cellY: number) {
    if (!this.isInside(cellX, cellY)) return 0
    return this.tileData[this.getIndex(cellX, cellY)]
  }

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
    const raw = this.getTileGid(cellX, cellY)
    if (raw === 0) return

    const decoded = decodeTiledGid(raw)
    const nextRaw = encodeTiledGid(decoded.gid, {
      flipH: flags.flipH ?? decoded.flipH,
      flipV: flags.flipV ?? decoded.flipV,
      flipD: flags.flipD ?? decoded.flipD,
      rotateHex120: flags.rotateHex120 ?? decoded.rotateHex120,
    })

    this.setTileGid(cellX, cellY, nextRaw)
  }

  public removeTile(cellX: number, cellY: number) {
    if (!this.isInside(cellX, cellY)) return

    const index = this.getIndex(cellX, cellY)
    this.tileData[index] = 0

    const node = this.tiles.get(index)
    if (!node) return

    node.destroy()
    this.tiles.delete(index)
  }

  public refresh() {
    this.clearNodesOnly()

    for (let index = 0; index < this.tileData.length; index += 1) {
      const rawGid = this.tileData[index]
      if (!rawGid) continue
      this.renderTileAt(index, rawGid)
    }
  }

  public importTiledTileLayer(
    layer: TiledTileLayer,
    options?: {
      mapWidth?: number
      mapHeight?: number
    }
  ) {
    this.clear()

    const cells = readTileLayerCells(
      layer,
      options?.mapWidth,
      options?.mapHeight
    )

    for (const cell of cells) {
      this.setTileGid(cell.cellX, cell.cellY, cell.rawGid)
    }
  }

  public clear() {
    this.tileData.fill(0)
    this.clearNodesOnly()
  }

  public exportTiledTileLayer(name = "Tile Layer 1"): TiledTileLayer {
    return {
      name: name || this.name,
      type: "tilelayer",
      visible: this.visible,
      opacity: 1,
      width: this.metrics.cols,
      height: this.metrics.rows,
      x: 0,
      y: 0,
      data: Array.from(this.tileData),
    }
  }

  public destroy() {
    this.clear()
    this.layerGroup.destroy()
  }

  private renderTileAt(index: number, rawGid: number) {
    const existed = this.tiles.get(index)
    if (existed) {
      existed.destroy()
      this.tiles.delete(index)
    }

    const cellX = index % this.metrics.cols
    const cellY = Math.floor(index / this.metrics.cols)
    const world = this.engine.cellToWorld(cellX, cellY)
    const size = this.engine.getCellSize()
    const decoded = decodeTiledGid(rawGid)

    const tileImageUrl = this.getTilesetForGid(decoded.gid)?.getTileImageUrl(rawGid)
    const node: TileNode = tileImageUrl
      ? new Image({
          x: world.x,
          y: world.y,
          width: size,
          height: size,
          url: tileImageUrl,
        })
      : this.createFallbackRect(world.x, world.y, size, decoded.gid)

    this.tiles.set(index, node)
    this.layerGroup.add(node)
  }

  private createFallbackRect(x: number, y: number, size: number, gid: number) {
    const hue = (gid * 41) % 360

    return new Rect({
      x,
      y,
      width: size,
      height: size,
      fill: `hsl(${hue}, 78%, 58%)`,
      stroke: "#0f172a",
      strokeWidth: 1,
      opacity: 0.92,
    })
  }

  private clearNodesOnly() {
    this.tiles.forEach((node) => node.destroy())
    this.tiles.clear()
  }

  private getTilesetForGid(gid: number) {
    return this.tilesets.find((tileset) => tileset.containsGid(gid)) ?? null
  }

  private isInside(cellX: number, cellY: number) {
    return (
      cellX >= 0 &&
      cellY >= 0 &&
      cellX < this.metrics.cols &&
      cellY < this.metrics.rows
    )
  }

  private getIndex(cellX: number, cellY: number) {
    return cellY * this.metrics.cols + cellX
  }
}
