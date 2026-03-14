import { App, MoveEvent, ZoomEvent } from "leafer-ui"
import "@leafer-in/viewport"
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
  Grid,
  GridCell,
  GridOptions,
  ViewportOptions,
  WorldPoint,
} from "./types"

const DEFAULT_VIEWPORT_OPTIONS: Required<ViewportOptions> = {
  zoomMin: 0.1,
  zoomMax: 16,
  zoomStep: 1.1,
  fitPadding: { top: 48, right: 48, bottom: 48, left: 48 },
}

/**
 * Leafer 引擎封装：
 * - 去除了多余的 Group 层级，直接使用 App 内置的 ground/tree/sky 层
 * - 使用 Leafer 默认支持的 custom 视口类型，支持自动同步平移缩放
 * - 提供屏幕 / 世界 / 网格坐标换算
 */
export class LeaferEngine {
  private readonly app: App
  private readonly gridRenderer: GridRenderer
  private gridOptions: Grid
  private readonly viewportOptions: Required<ViewportOptions>
  private resizeObserver: ResizeObserver | null = null

  // 暴露给外界感知视口变化的回调，方便 React 层面重新渲染
  public onCameraChange?: (state: CameraState) => void

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
      ground: { type: 'design', hittable: false }, 
      tree: { type: 'custom' }, 
      sky: { type: 'design', hittable: false },
      wheel: { preventDefault: true },
      touch: { preventDefault: true },
      pointer: { preventDefaultMenu: true },
    })

    // 设置视图缩放范围
    this.app.tree.config.zoom = {
      min: this.viewportOptions.zoomMin,
      max: this.viewportOptions.zoomMax,
    }

    const syncSlaveLayers = () => {
      const { x, y, scaleX, scaleY } = this.app.tree.zoomLayer
      const zoomStyle = { x, y, scaleX, scaleY }
      this.app.ground.zoomLayer.set(zoomStyle)
      this.app.sky.zoomLayer.set(zoomStyle)
    }

    // 自定义平移视图逻辑（并同步到三层）
    this.app.tree.on(MoveEvent.BEFORE_MOVE, (e: MoveEvent) => {
      const { x, y } = this.app.tree.getValidMove(e.moveX, e.moveY)
      this.app.tree.zoomLayer.move(x, y)
      syncSlaveLayers()
    })

    // 同步到外部（可选）
    this.app.tree.on(MoveEvent.MOVE, () => {
      this.notifyCameraChange()
    })

    // 自定义缩放视图逻辑（并同步到三层）
    this.app.tree.on(ZoomEvent.BEFORE_ZOOM, (e: ZoomEvent) => {
      const scale = this.app.tree.getValidScale(e.scale)
      this.app.tree.zoomLayer.scaleOfWorld(e, scale)
      syncSlaveLayers()
    })

    this.app.tree.on(ZoomEvent.ZOOM, () => {
      this.notifyCameraChange()
    })

    this.gridRenderer = new GridRenderer(this.app.ground as any)
    this.gridRenderer.render(this.gridOptions)

    this.fitToViewport()
    this.bindResizeObserver(options.view)
  }

  private notifyCameraChange() {
    if (this.onCameraChange) {
      this.onCameraChange(this.getCameraState())
    }
  }

  private bindResizeObserver(view: HTMLDivElement) {
    if (typeof ResizeObserver === "undefined") return

    this.resizeObserver = new ResizeObserver(() => {
      this.fitToViewport()
    })

    this.resizeObserver.observe(view)
  }

  public setupGrid(options?: GridOptions) {
    this.gridOptions = resolveGridOptions(options)
    this.gridRenderer.render(this.gridOptions)
    this.fitToViewport()
  }

  public fitToViewport() {
    const rect = (this.app.view as HTMLDivElement).getBoundingClientRect()
    const viewportWidth = Math.max(rect.width, 1)
    const viewportHeight = Math.max(rect.height, 1)

    const p = this.viewportOptions.fitPadding
    const contentWidth = this.gridOptions.width
    const contentHeight = this.gridOptions.height

    const availableWidth = Math.max(viewportWidth - (p.left ?? 0) - (p.right ?? 0), 1)
    const availableHeight = Math.max(viewportHeight - (p.top ?? 0) - (p.bottom ?? 0), 1)

    let scale = Math.min(
      availableWidth / contentWidth,
      availableHeight / contentHeight
    )
    scale = Math.min(
      Math.max(scale, this.viewportOptions.zoomMin),
      this.viewportOptions.zoomMax
    )

    const x = (p.left ?? 0) + (availableWidth - contentWidth * scale) / 2
    const y = (p.top ?? 0) + (availableHeight - contentHeight * scale) / 2

    const zoomStyle = { x, y, scaleX: scale, scaleY: scale }
    
    this.app.tree.zoomLayer.set(zoomStyle)
    this.app.ground.zoomLayer.set(zoomStyle)
    this.app.sky.zoomLayer.set(zoomStyle)
    
    this.notifyCameraChange()
  }

  public panBy(deltaX: number, deltaY: number) {
    this.app.tree.zoomLayer.move(deltaX, deltaY)
    this.app.ground.zoomLayer.move(deltaX, deltaY)
    this.app.sky.zoomLayer.move(deltaX, deltaY)
    this.notifyCameraChange()
  }

  public zoomBy(factor: number, origin: WorldPoint) {
    const scale = this.app.tree.getValidScale(this.getCameraState().scale * factor)
    this.app.tree.zoomLayer.scaleOfWorld(origin, scale)
    const { x, y, scaleX, scaleY } = this.app.tree.zoomLayer
    const zoomStyle = { x, y, scaleX, scaleY }
    this.app.ground.zoomLayer.set(zoomStyle)
    this.app.sky.zoomLayer.set(zoomStyle)
    this.notifyCameraChange()
  }

  public getViewportOptions() {
    return this.viewportOptions
  }

  public getGridOptions() {
    return this.gridOptions
  }

  public getGrid(): Grid {
    return this.gridOptions
  }

  public getCellSize() {
    return this.gridOptions.cellSize
  }

  public getCameraState(): CameraState {
    const zl = this.app.tree.zoomLayer
    return {
      x: (zl.x as number) || 0,
      y: (zl.y as number) || 0,
      scale: (zl.scaleX as number) || 1,
    }
  }

  public getApp() {
    return this.app
  }

  public getContentLayer() {
    return this.app.tree
  }

  public getOverlayLayer() {
    return this.app.sky
  }

  public screenToWorld(x: number, y: number): WorldPoint {
    const { x: cx, y: cy, scale } = this.getCameraState()
    return {
      x: (x - cx) / scale,
      y: (y - cy) / scale,
    }
  }

  public worldToScreen(x: number, y: number): WorldPoint {
    const { x: cx, y: cy, scale } = this.getCameraState()
    return { 
      x: x * scale + cx, 
      y: y * scale + cy 
    }
  }

  public isInsideWorld(x: number, y: number) {
    return (
      x >= 0 &&
      y >= 0 &&
      x < this.gridOptions.width &&
      y < this.gridOptions.height
    )
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
