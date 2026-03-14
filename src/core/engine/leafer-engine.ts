import { App, MoveEvent, ZoomEvent } from "leafer-ui"
import "@leafer-in/viewport"
import {
  GridRenderer,
  cellToWorld,
  worldToCell,
} from "./grid"
import type {
  CameraState,
  LeaferEngineConfig,
  GridMetrics,
  GridConfig,
  GridCell,
  ViewportConfig,
  WorldPoint,
} from "./types"

/**
 * LeaferEngine - 基于 LeaferJS 的核心编辑器渲染引擎。
 */
export class LeaferEngine {

  /** Leafer App 实例引用 */
  private readonly app: App
  /** 底层网格线渲染器 */
  private readonly gridRenderer: GridRenderer
  /** 网格配置 */
  private gridConfig: GridConfig
  /** 视口限制与边距控制配置 */
  private readonly viewportConfig: Required<ViewportConfig>
  /** DOM 容器缩放尺寸监控，保证画布分辨率匹配物理窗口大小 */
  private resizeObserver: ResizeObserver | null = null

  /**
   * 通知外部（如 React 组件）视野摄像机变换状态发生变更。
   */
  public onCameraChange?: (state: CameraState) => void

  /**
   * 初始化引擎
   * 
   * @param config 创建配置，必须传入对应的 DOM 渲染容器 `#view`
   */
  constructor(config: LeaferEngineConfig) {
    this.gridConfig = config.grid
    this.viewportConfig = config.viewport as Required<ViewportConfig>

    // 1. 初始化 Leafer App
    this.app = new App({
      view: config.view,
      ground: { type: 'design', hittable: false },
      tree: { type: 'custom' },
      sky: { type: 'design', hittable: false },
      zoom: {
        min: this.viewportConfig.zoomMin,
        max: this.viewportConfig.zoomMax,
      },
      smooth: true
    })

    // 视口平移监听
    this.app.tree.on(MoveEvent.BEFORE_MOVE, (e: MoveEvent) => {
      const { x, y } = this.app.tree.getValidMove(e.moveX, e.moveY)
      this.app.tree.zoomLayer.move(x, y)
      this.syncAndClamp()
    })

    this.app.tree.on(MoveEvent.MOVE, () => this.notifyCameraChange())

    // 视口缩放监听
    this.app.tree.on(ZoomEvent.BEFORE_ZOOM, (e: ZoomEvent) => {
      const scale = this.app.tree.getValidScale(e.scale)
      this.app.tree.zoomLayer.scaleOfWorld(e, scale)
      this.syncAndClamp()
    })

    this.app.tree.on(ZoomEvent.ZOOM, () => this.notifyCameraChange())

    // 3. 构建地基网络层
    this.gridRenderer = new GridRenderer(this.app.ground)
    this.gridRenderer.render(this.gridConfig)

    // 4. 重置一次视口将网格内容居中铺满
    this.fitToViewport()

    // 5. 绑定 ResizeObserver
    this.bindResizeObserver(config.view)
  }

  /**
   * 动态计算属性：内容宽度
   */
  public get width(): number {
    return this.gridConfig.cols * this.gridConfig.cellSize
  }

  /**
   * 动态计算属性：内容高度
   */
  public get height(): number {
    return this.gridConfig.rows * this.gridConfig.cellSize
  }

  /**
   * 内部辅助：获取当前视口容器的物理尺寸
   */
  private getViewportSize() {
    const rect = (this.app.view as HTMLDivElement).getBoundingClientRect()
    return {
      width: Math.max(rect.width, 1),
      height: Math.max(rect.height, 1)
    }
  }

  /**
   * 视口边界约束。
   */
  private clampToViewport() {
    const { width: vw, height: vh } = this.getViewportSize()
    const zl = this.app.tree.zoomLayer
    const scale = (zl.scaleX as number) || 1

    const contentW = this.width * scale
    const contentH = this.height * scale

    // 拖拽边界计算
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

  /**
   * 同步变换
   */
  private syncAndClamp() {
    this.clampToViewport()
    const { x, y, scaleX, scaleY } = this.app.tree.zoomLayer
    const zoomStyle = { x, y, scaleX, scaleY }
    this.app.ground.zoomLayer.set(zoomStyle)
    this.app.sky.zoomLayer.set(zoomStyle)
  }

  /**
   * 通知变更
   */
  private notifyCameraChange() {
    this.onCameraChange?.(this.getCameraState())
  }

  /**
   * 监控尺寸
   */
  private bindResizeObserver(view: HTMLDivElement) {
    if (typeof ResizeObserver === "undefined") return
    this.resizeObserver = new ResizeObserver(() => this.fitToViewport())
    this.resizeObserver.observe(view)
  }

  /**
   * 重新配置网格
   */
  public setupGrid(config: GridConfig) {
    this.gridConfig = config
    this.gridRenderer.render(this.gridConfig)
    this.fitToViewport()
  }

  /**
   * 居中自适应
   */
  public fitToViewport() {
    const { width: vw, height: vh } = this.getViewportSize()
    const p = this.viewportConfig.padding

    const availableWidth = Math.max(vw - p.left - p.right, 1)
    const availableHeight = Math.max(vh - p.top - p.bottom, 1)

    // 算出双向适应比，取极小值使得不越界
    let scale = Math.min(
      availableWidth / this.width,
      availableHeight / this.height
    )
    scale = Math.min(
      Math.max(scale, this.viewportConfig.zoomMin),
      this.viewportConfig.zoomMax
    )

    // 计算世界原点的偏移
    const x = p.left + (availableWidth - this.width * scale) / 2
    const y = p.top + (availableHeight - this.height * scale) / 2

    this.app.tree.zoomLayer.set({ x, y, scaleX: scale, scaleY: scale })
    this.syncAndClamp()
    this.notifyCameraChange()
  }

  /**
   * 获取当前引擎挂载的网格配置参数（带计算属性指标）
   */
  public getGrid(): GridMetrics {
    return {
      ...this.gridConfig,
      width: this.width,
      height: this.height,
    }
  }

  /**
   * 辅助方法：快捷提取当前网格每一格单位的物理尺寸大小
   */
  public getCellSize() {
    return this.gridConfig.cellSize
  }

  /**
   * 获取相机的具体物理位置与缩放系数。
   */
  public getCameraState(): CameraState {
    const zl = this.app.tree.zoomLayer
    return {
      x: (zl.x as number) || 0,
      y: (zl.y as number) || 0,
      scale: (zl.scaleX as number) || 1,
    }
  }

  /**
   * 获取内容图层 (`tree`) 的引用。
   */
  public getContentLayer() {
    return this.app.tree
  }

  /**
   * 获取覆盖图层 (`sky`) 的引用。
   */
  public getOverlayLayer() {
    return this.app.sky
  }

  /**
   * 坐标转换：屏幕 -> 世界
   */
  public screenToWorld(x: number, y: number): WorldPoint {
    const { x: cx, y: cy, scale } = this.getCameraState()
    return {
      x: (x - cx) / scale,
      y: (y - cy) / scale,
    }
  }

  /**
   * 检测是否在世界内
   */
  public isInsideWorld(x: number, y: number) {
    return (
      x >= 0 &&
      y >= 0 &&
      x < this.width &&
      y < this.height
    )
  }

  /**
   * 坐标转换：世界 -> 格子
   */
  public worldToCell(x: number, y: number): GridCell {
    return worldToCell(x, y, this.gridConfig.cellSize)
  }

  /**
   * 坐标转换：屏幕 -> 格子
   */
  public screenToCell(x: number, y: number): GridCell | null {
    const world = this.screenToWorld(x, y)
    if (!this.isInsideWorld(world.x, world.y)) return null
    return this.worldToCell(world.x, world.y)
  }

  /**
   * 坐标转换：格子 -> 世界
   */
  public cellToWorld(cellX: number, cellY: number): WorldPoint {
    return cellToWorld(cellX, cellY, this.gridConfig.cellSize)
  }

  /**
   * 释放引擎资源。
   */
  public destroy() {
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.gridRenderer.clear()
    this.app.destroy()
  }
}

/**
 * 快捷创建并初始化 LeaferEngine 渲染引擎类工厂工具函数。
 */
export function createLeaferEngine(config: LeaferEngineConfig) {
  return new LeaferEngine(config)
}

