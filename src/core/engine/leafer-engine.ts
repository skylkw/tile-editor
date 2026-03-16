import { App, MoveEvent, ZoomEvent } from "leafer-ui"
import "@leafer-in/viewport"
import { GridRenderer, cellToWorld, worldToCell } from "./grid"
import type {
  CameraState,
  GridMetrics,
  GridConfig,
  GridCell,
  ViewportConfig,
  WorldPoint,
  LeaferEngineConfig
} from "@/types/engine"

/**
 * LeaferEngine - 统一的渲染引擎基类，支持地图编辑和图集预览。
 */
export class LeaferEngine {
  private readonly app: App
  private readonly gridRenderer: GridRenderer
  private gridConfig: GridConfig
  private readonly viewportConfig: Required<ViewportConfig>
  private readonly useClamp: boolean
  private resizeObserver: ResizeObserver | null = null

  public onCameraChange?: (state: CameraState) => void

  constructor(config: LeaferEngineConfig) {
    this.gridConfig = config.grid
    this.viewportConfig = config.viewport as Required<ViewportConfig>
    this.useClamp = config.useClamp ?? false

    this.app = new App({
      view: config.view,
      ground: { type: 'design', hittable: false },
      tree: { type: 'custom' },
      sky: { type: 'design', hittable: false },
      zoom: {
        min: this.viewportConfig.zoomMin,
        max: this.viewportConfig.zoomMax,
      },
      smooth: config.smooth ?? true
    })

    this.setupEvents()

    this.gridRenderer = new GridRenderer(this.app.ground)
    this.gridRenderer.render(this.gridConfig)

    if (config.useResizeObserver) {
      this.bindResizeObserver(config.view)
    }
  }

  private setupEvents() {
    const sync = () => {
      if (this.useClamp) {
        this.clampToViewport()
      }
      const zoomStyle = {
        x: this.app.tree.zoomLayer.x,
        y: this.app.tree.zoomLayer.y,
        scaleX: this.app.tree.zoomLayer.scaleX,
        scaleY: this.app.tree.zoomLayer.scaleY,
      }
      this.app.ground.zoomLayer.set(zoomStyle)
      this.app.sky.zoomLayer.set(zoomStyle)
      this.onCameraChange?.(this.getCameraState())
    }

    this.app.tree.on(MoveEvent.BEFORE_MOVE, (e: MoveEvent) => {
      const { x, y } = this.app.tree.getValidMove(e.moveX, e.moveY)
      this.app.tree.zoomLayer.move(x, y)
      sync()
    })

    this.app.tree.on(ZoomEvent.BEFORE_ZOOM, (e: ZoomEvent) => {
      const scale = this.app.tree.getValidScale(e.scale)
      this.app.tree.zoomLayer.scaleOfWorld(e, scale)
      sync()
    })
  }

  private getViewportSize() {
    const view = this.app.view as HTMLDivElement
    if (!view) return { width: 1, height: 1 }
    const rect = view.getBoundingClientRect()
    return {
      width: Math.max(rect.width, 1),
      height: Math.max(rect.height, 1)
    }
  }

  private clampToViewport() {
    const { width: vw, height: vh } = this.getViewportSize()
    const zl = this.app.tree.zoomLayer
    const scale = (zl.scaleX as number) || 1

    const contentW = this.width * scale
    const contentH = this.height * scale

    let mx = 0, my = 0
    const cm = this.viewportConfig.clampMargin

    if (typeof cm === 'string' && cm.endsWith('%')) {
      const ratio = parseFloat(cm) / 100
      mx = vw * ratio
      my = vh * ratio
    } else {
      mx = my = Number(cm) || 0
    }

    const x = Math.max(mx - contentW, Math.min(vw - mx, (zl.x as number) || 0))
    const y = Math.max(my - contentH, Math.min(vh - my, (zl.y as number) || 0))

    zl.set({ x, y })
  }

  private bindResizeObserver(view: HTMLDivElement) {
    if (typeof ResizeObserver === "undefined") return
    this.resizeObserver = new ResizeObserver(() => this.fitToViewport())
    this.resizeObserver.observe(view)
  }

  public get width(): number {
    return this.gridConfig.cols * this.gridConfig.cellSize
  }

  public get height(): number {
    return this.gridConfig.rows * this.gridConfig.cellSize
  }

  public setupGrid(config: GridConfig) {
    this.gridConfig = config
    this.gridRenderer.render(this.gridConfig)
  }

  public fitToViewport() {
    const { width: vw, height: vh } = this.getViewportSize()
    const p = this.viewportConfig.padding

    const availableWidth = Math.max(vw - p.left - p.right, 1)
    const availableHeight = Math.max(vh - p.top - p.bottom, 1)

    let scale = Math.min(
      availableWidth / this.width,
      availableHeight / this.height
    )
    scale = Math.min(
      Math.max(scale, this.viewportConfig.zoomMin),
      this.viewportConfig.zoomMax
    )

    const x = p.left + (availableWidth - this.width * scale) / 2
    const y = p.top + (availableHeight - this.height * scale) / 2

    this.app.tree.zoomLayer.set({ x, y, scaleX: scale, scaleY: scale })
    this.app.ground.zoomLayer.set({ x, y, scaleX: scale, scaleY: scale })
    this.app.sky.zoomLayer.set({ x, y, scaleX: scale, scaleY: scale })
    this.onCameraChange?.(this.getCameraState())
  }

  public fitToRect(minX: number, minY: number, maxX: number, maxY: number) {
    const { width: vw, height: vh } = this.getViewportSize()
    const contentW = maxX - minX
    const contentH = maxY - minY
    const padding = 40

    const s = Math.min(
      (vw - padding) / (contentW || 1),
      (vh - padding) / (contentH || 1),
      1
    )

    const zoomStyle = {
      x: (vw - contentW * s) / 2 - minX * s,
      y: (vh - contentH * s) / 2 - minY * s,
      scaleX: s,
      scaleY: s
    }
    this.app.tree.zoomLayer.set(zoomStyle)
    this.app.ground.zoomLayer.set(zoomStyle)
    this.app.sky.zoomLayer.set(zoomStyle)
    this.onCameraChange?.(this.getCameraState())
  }

  public getGrid(): GridMetrics {
    return { ...this.gridConfig, width: this.width, height: this.height }
  }

  public getCellSize() { return this.gridConfig.cellSize }

  public getCameraState(): CameraState {
    const zl = this.app.tree.zoomLayer
    return {
      x: (zl.x as number) || 0,
      y: (zl.y as number) || 0,
      scale: (zl.scaleX as number) || 1,
    }
  }

  public getContentLayer() { return this.app.tree }
  public getOverlayLayer() { return this.app.sky }
  public getGroundLayer() { return this.app.ground }

  public screenToWorld(x: number, y: number): WorldPoint {
    const { x: cx, y: cy, scale } = this.getCameraState()
    return {
      x: (x - cx) / scale,
      y: (y - cy) / scale,
    }
  }

  public isInsideWorld(x: number, y: number) {
    return (
      x >= 0 &&
      y >= 0 &&
      x < this.width &&
      y < this.height
    )
  }

  public worldToCell(x: number, y: number): GridCell {
    return worldToCell(x, y, this.gridConfig.cellSize)
  }

  public screenToCell(x: number, y: number): GridCell | null {
    const world = this.screenToWorld(x, y)
    if (!this.isInsideWorld(world.x, world.y)) return null
    return this.worldToCell(world.x, world.y)
  }

  public cellToWorld(cellX: number, cellY: number): WorldPoint {
    return cellToWorld(cellX, cellY, this.gridConfig.cellSize)
  }

  public destroy() {
    this.resizeObserver?.disconnect()
    this.app.destroy()
  }
}
