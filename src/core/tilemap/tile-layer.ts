/**
 * 有限尺寸图层管理模块 (TileLayer)
 * 
 * 该模块负责存储单层地图的 GID 数据，并将其与 Leafer 渲染引擎同步。
 * 它支持在不同引擎实例间切换 (Engine Attachment)，并处理视口 resize 时的数组对齐。
 */
import type { LeaferEngine } from "@/core/engine/leafer-engine"
import type { GridMetrics } from "@/types/engine"
import { readTileLayerCells } from "@/core/io/tiled-map"
import { Group, Image, Rect } from "leafer-ui"
import { decodeTiledGid, encodeTiledGid } from "./tiled-gid"
import type { TiledTileLayer } from "@/types/tiled"
import type { TileLayerConfig } from "@/types/tilemap"
import type { Tileset } from "./tileset"

/** 渲染节点类型：带有纹理的 Image 或无图时的占位 Rect */
type TileNode = Image | Rect

/**
 * TileLayer 类：
 * - 维护一个 Uint32Array 存储全图 GID。
 * - 维护一个 Map<index, TileNode> 存储当前在场景树中的渲染节点。
 */
export class TileLayer {
  private readonly id: string               // 唯一 ID
  private engine: LeaferEngine              // 关联的渲染引擎
  private tilesets: Tileset[] = []          // 可用的图集资源列表
  private layerGroup: Group                 // 该图层在 Leafer 中的容器组
  private metrics: GridMetrics              // 缓存的地图尺寸信息
  private tileData: Uint32Array             // 核心数据：一维数组存二维地图
  private name: string                      // 图层名称
  private visible: boolean                  // 可见性
  private order: number                     // 层级顺序 (zIndex)
  private readonly tiles = new Map<number, TileNode>() // 索引到渲染节点的映射

  constructor(engine: LeaferEngine, config: TileLayerConfig = {}) {
    this.id = config.id ?? `layer-${Date.now()}`
    this.engine = engine
    this.metrics = engine.getGrid()
    this.tileData = new Uint32Array(this.metrics.cols * this.metrics.rows)
    this.name = config.name ?? "Tile Layer"
    this.visible = config.visible ?? true
    this.order = config.order ?? 0
    
    // 初始化渲染组，并挂载到引擎的内容层
    this.layerGroup = new Group({ visible: this.visible, zIndex: this.order })
    this.engine.getContentLayer().add(this.layerGroup)
  }

  // --- 基础属性访问 ---

  public getId() { return this.id }
  public getName() { return this.name }
  public setName(name: string) { this.name = name.trim() || "Tile Layer" }
  public isVisible() { return this.visible }
  public getOrder() { return this.order }

  public setVisible(visible: boolean) {
    this.visible = visible
    this.layerGroup.set({ visible })
  }

  public setOrder(order: number) {
    this.order = order
    this.layerGroup.set({ zIndex: order })
  }

  // --- 引擎关联逻辑 ---

  /** 检查是否已挂载到指定引擎 */
  public isAttachedTo(engine: LeaferEngine) {
    return this.engine === engine
  }

  /** 
   * 将图层迁移到新引擎。
   * 当重新初始化画布或编辑器状态重组时使用。
   */
  public attachEngine(engine: LeaferEngine) {
    this.engine = engine
    this.layerGroup = new Group({
      visible: this.visible,
      zIndex: this.order,
    })
    this.engine.getContentLayer().add(this.layerGroup)
    this.resizeToMatchEngine() // 确保数据数组尺寸与新引擎一致
    this.refresh()             // 重绘所有节点
  }

  /**
   * 响应地图尺寸变更。
   * 会尝试保留旧数据中重合区域的内容，多退少补。
   */
  public resizeToMatchEngine() {
    const nextMetrics = this.engine.getGrid()

    // 如果尺寸没变，无需处理
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

    // 逐行拷贝旧数据到新数组的左上角
    for (let row = 0; row < copyRows; row += 1) {
      const prevStart = row * this.metrics.cols
      const nextStart = row * nextMetrics.cols
      const slice = this.tileData.subarray(prevStart, prevStart + copyCols)
      nextData.set(slice, nextStart)
    }

    this.metrics = nextMetrics
    this.tileData = nextData
    this.clearNodesOnly() // 清理旧渲染节点 (坐标已失效)
    this.refresh()        // 全量重绘
  }

  // --- 资源管理 ---

  public setTileset(tileset: Tileset | null) {
    this.setTilesets(tileset ? [tileset] : [])
  }

  public setTilesets(tilesets: Tileset[]) {
    this.tilesets = tilesets
    this.refresh()
  }

  // --- 数据操作 ---

  /** 设置指定坐标的 Tile ID (别名方法) */
  public setTile(cellX: number, cellY: number, gid: number) {
    this.setTileGid(cellX, cellY, gid)
  }

  /** 
   * 核心写入方法：更新数据并立即触发重绘该格子。
   */
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

  /** 获取指定位置的原始 GID (带变换标记) */
  public getTileGid(cellX: number, cellY: number) {
    if (!this.isInside(cellX, cellY)) return 0
    return this.tileData[this.getIndex(cellX, cellY)]
  }

  /** 批量更新某个位置的翻转/旋转标记 */
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

  /** 擦除指定位置的 Tile */
  public removeTile(cellX: number, cellY: number) {
    if (!this.isInside(cellX, cellY)) return

    const index = this.getIndex(cellX, cellY)
    this.tileData[index] = 0

    const node = this.tiles.get(index)
    if (!node) return

    node.destroy() // 销毁并移除渲染节点
    this.tiles.delete(index)
  }

  /** 全量重绘：遍历所有数据并生成节点 */
  public refresh() {
    this.clearNodesOnly()

    for (let index = 0; index < this.tileData.length; index += 1) {
      const rawGid = this.tileData[index]
      if (!rawGid) continue
      this.renderTileAt(index, rawGid)
    }
  }

  /** 
   * 从 Tiled 对象导入数据。
   */
  public importTiledTileLayer(
    layer: TiledTileLayer,
    config?: {
      mapWidth?: number
      mapHeight?: number
    }
  ) {
    this.clear()

    const cells = readTileLayerCells(
      layer,
      config?.mapWidth,
      config?.mapHeight
    )

    for (const cell of cells) {
      this.setTileGid(cell.cellX, cell.cellY, cell.rawGid)
    }
  }

  /** 清空图层所有数据 and 渲染节点 */
  public clear() {
    this.tileData.fill(0)
    this.clearNodesOnly()
  }

  /** 转换为 Tiled 兼容的图层对象 */
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

  /** 彻底销毁该图层 */
  public destroy() {
    this.clear()
    this.layerGroup.destroy()
  }

  // --- 内部辅助及渲染逻辑 ---

  /**
   * 具体的单元格渲染逻辑。
   * 会尝试从图集获取 DataURL 填充到 Image 节点。
   */
  private renderTileAt(index: number, rawGid: number) {
    // 如果该位置已有节点，先销毁
    const existed = this.tiles.get(index)
    if (existed) {
      existed.destroy()
      this.tiles.delete(index)
    }

    const cellX = index % this.metrics.cols
    const cellY = Math.floor(index / this.metrics.cols)
    // 获取世界坐标
    const world = this.engine.cellToWorld(cellX, cellY)
    const size = this.engine.getCellSize()
    const decoded = decodeTiledGid(rawGid)

    // 查找图集并获取对应的 DataURL (该 URL 内部已经包含了翻转变换)
    const tileImageUrl = this.getTilesetForGid(decoded.gid)?.getTileImageUrl(rawGid)
    
    const node: TileNode = tileImageUrl
      ? new Image({
          x: world.x,
          y: world.y,
          width: size,
          height: size,
          url: tileImageUrl,
          // 可以在此处添加样式设置，例如边缘平滑等
        })
      : this.createFallbackRect(world.x, world.y, size, decoded.gid) // 找不到资源时用色块占位

    this.tiles.set(index, node)
    this.layerGroup.add(node)
  }

  /** 创建占位色块，颜色由 GID 决定 */
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

  /** 仅清理渲染节点映射，不修改 tileData */
  private clearNodesOnly() {
    this.tiles.forEach((node) => node.destroy())
    this.tiles.clear()
  }

  /** 根据 GID 查找所属图集 */
  private getTilesetForGid(gid: number) {
    return this.tilesets.find((tileset) => tileset.containsGid(gid)) ?? null
  }

  /** 坐标溢出逻辑检查 */
  private isInside(cellX: number, cellY: number) {
    return (
      cellX >= 0 &&
      cellY >= 0 &&
      cellX < this.metrics.cols &&
      cellY < this.metrics.rows
    )
  }

  /** 二维转一维索引 */
  private getIndex(cellX: number, cellY: number) {
    return cellY * this.metrics.cols + cellX
  }
}
