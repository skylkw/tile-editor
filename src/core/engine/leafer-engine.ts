import { App, MoveEvent, ZoomEvent } from "leafer-ui"
import "@leafer-in/viewport"
import {
  GridRenderer,
  cellToWorld,
  resolveGridOptions,
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

/**
 * LeaferEngine - 基于 LeaferJS 的核心编辑器渲染引擎。
 * 
 * 主要职责与特点：
 * 1. 负责生命周期管理：初始化并持有 `leafer-ui` 的核心 App 对象。
 * 2. 多图层同步架构：
 *    - `ground` 层（地面/背景）：用于渲染网格 (`GridRenderer`)。配置为 `design` 模式，禁止交互探测（`hittable: false`）。
 *    - `tree` 层（内容/活动层）：默认业务图层绘制的载体。配置为 `custom` 视口模式，接管并掌控所有鼠标平移/缩放交互。
 *    - `sky` 层（上层覆盖）：由于渲染悬浮 Stamp预览/选取框/高亮光标 等叠加态 UI。禁止交互探测，随主图层联动。
 * 3. 完美视图联动：内部拦截 `MoveEvent` / `ZoomEvent`，使主层以外的其他层(zoomLayer)执行原子级别的坐标镜像同步。
 * 4. 坐标轴工具：提供完备的 `屏幕坐标 <-> 世界坐标 <-> 网格单元` 的转换和合法性校验。
 */
export class LeaferEngine {

  /** Leafer App 实例引用 */
  private readonly app: App
  /** 底层网格线渲染器 */
  private readonly gridRenderer: GridRenderer
  /** 网格世界配置 (受限的画布规格大小及格子刻度等) */
  private gridOptions: Grid
  /** 视口限制与边距控制配置 */
  private readonly viewportOptions: Required<ViewportOptions>
  /** DOM 容器缩放尺寸监控，保证画布分辨率匹配物理窗口大小 */
  private resizeObserver: ResizeObserver | null = null

  /**
   * 通知外部（如 React 组件）视野摄像机变换状态发生变更。
   * 用于解耦触发 React 端的状态机更新。
   */
  public onCameraChange?: (state: CameraState) => void

  /**
   * 初始化引擎
   * 
   * @param options 创建选项，必须传入对应的 DOM 渲染容器 `#view`
   */
  constructor(options: CreateLeaferEngineOptions) {
    this.gridOptions = resolveGridOptions(options.grid)
    this.viewportOptions = options.viewport

    // 1. 初始化 Leafer App
    // ground 和 sky 均为从属展示层，所以阻止触发 hit 测试提高性能
    // tree 作为主操控层挂载 custom 视口类型接管原生拖动逻辑
    this.app = new App({
      view: options.view,
      ground: { type: 'design', hittable: false },
      tree: { type: 'custom' },
      sky: { type: 'design', hittable: false },
      zoom: {
        min: this.viewportOptions.zoomMin,
        max: this.viewportOptions.zoomMax,
      },
      smooth: true
    })

    // ------------------------------------------
    // 视口平移监听
    // ------------------------------------------
    this.app.tree.on(MoveEvent.BEFORE_MOVE, (e: MoveEvent) => {
      const { x, y } = this.app.tree.getValidMove(e.moveX, e.moveY)
      this.app.tree.zoomLayer.move(x, y)
      this.syncAndClamp()
    })

    this.app.tree.on(MoveEvent.MOVE, () => this.notifyCameraChange())

    // ------------------------------------------
    // 视口缩放监听
    // ------------------------------------------
    this.app.tree.on(ZoomEvent.BEFORE_ZOOM, (e: ZoomEvent) => {
      const scale = this.app.tree.getValidScale(e.scale)
      this.app.tree.zoomLayer.scaleOfWorld(e, scale)
      this.syncAndClamp()
    })

    this.app.tree.on(ZoomEvent.ZOOM, () => this.notifyCameraChange())

    // 3. 构建地基网络层，将实例传递给负责绘制 Grid 的渲染器
    this.gridRenderer = new GridRenderer(this.app.ground)
    this.gridRenderer.render(this.gridOptions)

    // 4. 重置一次视口将网格内容居中铺满
    this.fitToViewport()

    // 5. 将自身响应式绑定给浏览器外壳窗口
    this.bindResizeObserver(options.view)
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
   * 保证缩放后的画布内容矩形至少有一部分留在视口内，
   * 防止用户把画布完全拖出屏幕。
   */
  private clampToViewport() {
    const { width: vw, height: vh } = this.getViewportSize()
    const zl = this.app.tree.zoomLayer
    const scale = (zl.scaleX as number) || 1

    const contentW = this.gridOptions.width * scale
    const contentH = this.gridOptions.height * scale

    // 拖拽边界计算
    let mx = 0, my = 0
    const cm = this.viewportOptions.clampMargin

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
   * 将主层的变换强制同步给从层，并应用边界约束。
   */
  private syncAndClamp() {
    this.clampToViewport()
    const { x, y, scaleX, scaleY } = this.app.tree.zoomLayer
    const zoomStyle = { x, y, scaleX, scaleY }
    this.app.ground.zoomLayer.set(zoomStyle)
    this.app.sky.zoomLayer.set(zoomStyle)
  }

  /**
   * 通知外部（如 React 组件）视野摄像机变换状态发生变更。
   */
  private notifyCameraChange() {
    this.onCameraChange?.(this.getCameraState())
  }

  /**
   * 开始监控父容器 DIV 物理长宽规格的调节
   */
  private bindResizeObserver(view: HTMLDivElement) {
    if (typeof ResizeObserver === "undefined") return
    this.resizeObserver = new ResizeObserver(() => this.fitToViewport())
    this.resizeObserver.observe(view)
  }

  /**
   * 动态重载网格规格 (例如用户修改地图宽高或单元尺寸时调用)。
   */
  public setupGrid(options: GridOptions) {
    this.gridOptions = resolveGridOptions(options)
    this.gridRenderer.render(this.gridOptions)
    this.fitToViewport()
  }

  /**
   * 视口自适应居中算法。
   */
  public fitToViewport() {
    const { width: vw, height: vh } = this.getViewportSize()
    const p = this.viewportOptions.padding

    const availableWidth = Math.max(vw - p.left - p.right, 1)
    const availableHeight = Math.max(vh - p.top - p.bottom, 1)

    // 算出双向适应比，取极小值使得不越界
    let scale = Math.min(
      availableWidth / this.gridOptions.width,
      availableHeight / this.gridOptions.height
    )
    scale = Math.min(
      Math.max(scale, this.viewportOptions.zoomMin),
      this.viewportOptions.zoomMax
    )

    // 计算世界原点的偏移
    const x = p.left + (availableWidth - this.gridOptions.width * scale) / 2
    const y = p.top + (availableHeight - this.gridOptions.height * scale) / 2

    this.app.tree.zoomLayer.set({ x, y, scaleX: scale, scaleY: scale })
    this.syncAndClamp()
    this.notifyCameraChange()
  }

  /**
   * 获取当前引擎挂载的网格配置参数
   */
  public getGrid(): Grid {
    return this.gridOptions
  }

  /**
   * 辅助方法：快捷提取当前网格每一格单位的物理尺寸大小
   */
  public getCellSize() {
    return this.gridOptions.cellSize
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
   * 局部容器坐标系 (基于 React Div) 转换为底层画布的世界坐标系。
   */
  public screenToWorld(x: number, y: number): WorldPoint {
    const { x: cx, y: cy, scale } = this.getCameraState()
    return {
      x: (x - cx) / scale,
      y: (y - cy) / scale,
    }
  }

  /**
   * 检测所给的世界坐标位置是否还存在于有效的安全网格系统定义区域内
   */
  public isInsideWorld(x: number, y: number) {
    return (
      x >= 0 &&
      y >= 0 &&
      x < this.gridOptions.width &&
      y < this.gridOptions.height
    )
  }

  /**
   * 将无规律的浮点世界坐标规范划入它从属的最近的一块整数网格块 (格子索引)
   */
  public worldToCell(x: number, y: number): GridCell {
    return worldToCell(x, y, this.gridOptions.cellSize)
  }

  /**
   * 直接从外部提供的屏幕空间映射找到用户鼠标底下究竟悬停着哪一块物理网格块。
   */
  public screenToCell(x: number, y: number): GridCell | null {
    const world = this.screenToWorld(x, y)
    if (!this.isInsideWorld(world.x, world.y)) return null
    return this.worldToCell(world.x, world.y)
  }

  /**
   * 通过给定的 X / Y 网格整数下标索引解算出对应的世界级偏移量坐标
   */
  public cellToWorld(cellX: number, cellY: number): WorldPoint {
    return cellToWorld(cellX, cellY, this.gridOptions.cellSize)
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
export function createLeaferEngine(options: CreateLeaferEngineOptions) {
  return new LeaferEngine(options)
}

