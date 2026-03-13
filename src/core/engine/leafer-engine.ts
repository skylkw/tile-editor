import "@leafer-in/viewport"
import { App } from "leafer-ui"
import {
  GridRenderer,
  cellToWorld,
  resolveGridOptions,
  snapWorldPosition,
  worldToCell,
} from "./grid"
import type {
  CreateLeaferEngineOptions,
  GridCell,
  GridOptions,
  ResolvedGridOptions,
  WorldPoint,
} from "./types"

export type { CreateLeaferEngineOptions, GridCell, GridOptions, WorldPoint }

/**
 * Leafer 引擎封装：
 * - 初始化 App 与视图层
 * - 管理网格配置与网格渲染
 * - 提供网格坐标转换能力
 *
 * 说明：
 * 缩放与平移交互由 viewport 插件接管，
 * 引擎层不再承载 tile 的增删改职责。
 */
export class LeaferEngine {
  private app: App
  private gridOptions: ResolvedGridOptions
  private gridRenderer: GridRenderer

  constructor(options: CreateLeaferEngineOptions) {
    this.app = new App({
      view: options.view,
      fill: "#1f2937",
      // design 类型会自动接入 viewport 的常用编辑交互
      ground: { type: "design" },
      tree: { type: "design" },
      sky: {},
    })

    this.gridRenderer = new GridRenderer(this.app)
    this.gridOptions = resolveGridOptions(options.grid)
    this.gridRenderer.render(this.gridOptions)
  }

  /**
   * 重新设置并重建网格。
   */
  public setupGrid(options?: GridOptions) {
    this.gridOptions = resolveGridOptions(options)
    this.gridRenderer.render(this.gridOptions)
  }

  /**
   * 获取当前网格单元尺寸（像素）。
   */
  public getCellSize() {
    return this.gridOptions.cellSize
  }

  /**
   * 世界坐标 -> 网格坐标
   */
  public worldToCell(x: number, y: number): GridCell {
    return worldToCell(x, y, this.gridOptions.cellSize)
  }

  /**
   * 网格坐标 -> 世界坐标（单元左上角）
   */
  public cellToWorld(cellX: number, cellY: number): WorldPoint {
    return cellToWorld(cellX, cellY, this.gridOptions.cellSize)
  }

  /**
   * 吸附世界坐标到网格
   */
  public snapWorldPosition(x: number, y: number): WorldPoint {
    return snapWorldPosition(x, y, this.gridOptions.cellSize)
  }

  /**
   * 暴露底层 App（给 hooks 或上层工具扩展）。
   */
  public getApp() {
    return this.app
  }

  /**
   * 销毁引擎与全部资源。
   */
  public destroy() {
    this.gridRenderer.clear()
    this.app.destroy()
  }
}

/**
 * 引擎工厂函数。
 */
export function createLeaferEngine(options: CreateLeaferEngineOptions) {
  return new LeaferEngine(options)
}
