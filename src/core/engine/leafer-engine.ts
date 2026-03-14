import { App, Group } from "leafer-ui"
import { CameraController } from "./camera-controller"
import {
  GridRenderer,
  cellToWorld,
  resolveGridOptions,
  snapWorldPosition,
  worldToCell,
} from "./grid"
import type {
  CameraState,
  CreateLeaferEngineOptions,
  GridCell,
  GridOptions,
  MapMetrics,
  ResolvedGridOptions,
  ViewportOptions,
  WorldPoint,
} from "./types"

export type {
  CameraState,
  CreateLeaferEngineOptions,
  GridCell,
  GridOptions,
  MapMetrics,
  ViewportOptions,
  WorldPoint,
}

const DEFAULT_VIEWPORT_OPTIONS: Required<ViewportOptions> = {
  zoomMin: 0.1,
  zoomMax: 16,
  zoomStep: 1.1,
  fitPadding: 48,
}

/**
 * Leafer 引擎封装：
 * - 管理有限尺寸画布与网格渲染
 * - 用统一 camera 控制缩放/平移
 * - 提供屏幕 / 世界 / 网格坐标换算
 */
export class LeaferEngine {
  private readonly app: App
  private gridOptions: ResolvedGridOptions
  private readonly viewportOptions: Required<ViewportOptions>
  private readonly cameraController: CameraController
  private readonly groundWorldLayer: Group
  private readonly treeWorldLayer: Group
  private readonly skyWorldLayer: Group
  private readonly gridLayer: Group
  private readonly contentLayer: Group
  private readonly overlayLayer: Group
  private readonly gridRenderer: GridRenderer
  private resizeObserver: ResizeObserver | null = null

  constructor(options: CreateLeaferEngineOptions) {
    this.gridOptions = resolveGridOptions(options.grid)
    this.viewportOptions = {
      zoomMin: options.viewport?.zoomMin ?? DEFAULT_VIEWPORT_OPTIONS.zoomMin,
      zoomMax: options.viewport?.zoomMax ?? DEFAULT_VIEWPORT_OPTIONS.zoomMax,
      zoomStep: options.viewport?.zoomStep ?? DEFAULT_VIEWPORT_OPTIONS.zoomStep,
      fitPadding:
        options.viewport?.fitPadding ?? DEFAULT_VIEWPORT_OPTIONS.fitPadding,
    }

    this.app = new App({
      view: options.view,
      fill: "#06101d",
      ground: {},
      tree: {},
      sky: {},
    })

    this.cameraController = new CameraController(
      this.viewportOptions,
      this.gridOptions
    )
    this.groundWorldLayer = new Group({ hitChildren: false })
    this.treeWorldLayer = new Group()
    this.skyWorldLayer = new Group({ hitChildren: false })
    this.gridLayer = new Group({ hitChildren: false })
    this.contentLayer = new Group()
    this.overlayLayer = new Group({ hitChildren: false })

    this.groundWorldLayer.add(this.gridLayer)
    this.treeWorldLayer.add(this.contentLayer)
    this.skyWorldLayer.add(this.overlayLayer)
    this.app.ground.add(this.groundWorldLayer)
    this.app.tree.add(this.treeWorldLayer)
    this.app.sky.add(this.skyWorldLayer)

    this.gridRenderer = new GridRenderer(this.gridLayer)
    this.gridRenderer.render(this.gridOptions)

    this.syncViewportSize(options.view)
    this.fitToViewport()
    this.bindResizeObserver(options.view)
  }

  private bindResizeObserver(view: HTMLDivElement) {
    if (typeof ResizeObserver === "undefined") return

    this.resizeObserver = new ResizeObserver(() => {
      this.syncViewportSize(view)
      this.cameraController.clampToBounds()
      this.applyCamera()
    })

    this.resizeObserver.observe(view)
  }

  private syncViewportSize(view: HTMLDivElement) {
    this.cameraController.setViewportSize(view.clientWidth, view.clientHeight)
  }

  private applyCamera() {
    const camera = this.cameraController.getState()
    const cameraStyle = {
      x: camera.x,
      y: camera.y,
      scaleX: camera.scale,
      scaleY: camera.scale,
    }

    this.groundWorldLayer.set(cameraStyle)
    this.treeWorldLayer.set(cameraStyle)
    this.skyWorldLayer.set(cameraStyle)
  }

  public setupGrid(options?: GridOptions) {
    this.gridOptions = resolveGridOptions(options)
    this.cameraController.setContentMetrics(this.gridOptions)
    this.gridRenderer.render(this.gridOptions)
    this.fitToViewport()
  }

  public fitToViewport() {
    this.cameraController.fitToViewport()
    this.applyCamera()
  }

  public panBy(deltaX: number, deltaY: number) {
    this.cameraController.panBy(deltaX, deltaY)
    this.applyCamera()
  }

  public zoomBy(factor: number, origin: WorldPoint) {
    this.cameraController.zoomBy(factor, origin)
    this.applyCamera()
  }

  public zoomAt(nextScale: number, origin: WorldPoint) {
    this.cameraController.zoomAt(nextScale, origin)
    this.applyCamera()
  }

  public getViewportOptions() {
    return this.viewportOptions
  }

  public getGridOptions() {
    return this.gridOptions
  }

  public getMapMetrics(): MapMetrics {
    const { width, height, cellSize, cols, rows } = this.gridOptions
    return { width, height, cellSize, cols, rows }
  }

  public getCellSize() {
    return this.gridOptions.cellSize
  }

  public getCameraState(): CameraState {
    return this.cameraController.getState()
  }

  public getApp() {
    return this.app
  }

  public getContentLayer() {
    return this.contentLayer
  }

  public getOverlayLayer() {
    return this.overlayLayer
  }

  public screenToWorld(x: number, y: number): WorldPoint {
    return this.cameraController.screenToWorld(x, y)
  }

  public worldToScreen(x: number, y: number): WorldPoint {
    return this.cameraController.worldToScreen(x, y)
  }

  public isInsideWorld(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.gridOptions.width && y < this.gridOptions.height
  }

  public worldToCell(x: number, y: number): GridCell {
    return worldToCell(x, y, this.gridOptions.cellSize)
  }

  public screenToCell(x: number, y: number): GridCell | null {
    const world = this.screenToWorld(x, y)
    if (!this.isInsideWorld(world.x, world.y)) return null
    return this.worldToCell(world.x, world.y)
  }

  public cellToWorld(cellX: number, cellY: number): WorldPoint {
    return cellToWorld(cellX, cellY, this.gridOptions.cellSize)
  }

  public snapWorldPosition(x: number, y: number): WorldPoint {
    return snapWorldPosition(x, y, this.gridOptions.cellSize)
  }

  public destroy() {
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.gridRenderer.clear()
    this.app.destroy()
  }
}

export function createLeaferEngine(options: CreateLeaferEngineOptions) {
  return new LeaferEngine(options)
}
