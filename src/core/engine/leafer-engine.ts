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
      smooth:true     
    })

    // ------------------------------------------
    // 视口平移监听
    // ------------------------------------------
    this.app.tree.on(MoveEvent.BEFORE_MOVE, (e: MoveEvent) => {
      const { x, y } = this.app.tree.getValidMove(e.moveX, e.moveY)
      this.app.tree.zoomLayer.move(x, y)
      this.syncAndClamp()
    })

    this.app.tree.on(MoveEvent.MOVE, () => {
      this.notifyCameraChange()
    })

    // ------------------------------------------
    // 视口缩放监听
    // ------------------------------------------
    this.app.tree.on(ZoomEvent.BEFORE_ZOOM, (e: ZoomEvent) => {
      const scale = this.app.tree.getValidScale(e.scale)
      this.app.tree.zoomLayer.scaleOfWorld(e, scale)
      this.syncAndClamp()
    })

    this.app.tree.on(ZoomEvent.ZOOM, () => {
      this.notifyCameraChange()
    })

    // 3. 构建地基网络层，将实例传递给负责绘制 Grid 的渲染器
    this.gridRenderer = new GridRenderer(this.app.ground)
    this.gridRenderer.render(this.gridOptions)

    // 4. 重置一次视口将网格内容居中铺满
    this.fitToViewport()
    
    // 5. 将自身响应式绑定给浏览器外壳窗口
    this.bindResizeObserver(options.view)
  }

  /**
   * 视口边界约束。
   * 保证缩放后的画布内容矩形至少有一部分留在视口内，
   * 防止用户把画布完全拖出屏幕。
   * 
   * 策略：画布右下角不能超过视口左上角 + margin，
   *        画布左上角不能超过视口右下角 - margin。
   */
  private clampToViewport() {
    const rect = (this.app.view as HTMLDivElement).getBoundingClientRect()
    const viewportWidth = rect.width || 1
    const viewportHeight = rect.height || 1

    const zl = this.app.tree.zoomLayer
    let x = (zl.x as number) || 0
    let y = (zl.y as number) || 0
    const scale = (zl.scaleX as number) || 1

    const contentW = this.gridOptions.width * scale
    const contentH = this.gridOptions.height * scale

    // 拖拽边界：确保画布不会被完全拖出视口
    let mx = 0
    let my = 0
    const cm = this.viewportOptions.clampMargin

    if (typeof cm === 'string' && cm.endsWith('%')) {
      const ratio = parseFloat(cm) / 100
      mx = viewportWidth * ratio
      my = viewportHeight * ratio
    } else {
      mx = my = Number(cm) || 0
    }

    const xMin = mx - contentW
    const xMax = viewportWidth - mx
    const yMin = my - contentH
    const yMax = viewportHeight - my

    x = Math.max(xMin, Math.min(xMax, x))
    y = Math.max(yMin, Math.min(yMax, y))

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
   * 触发抛出摄像机视界状态变更事件
   */
  private notifyCameraChange() {
    if (this.onCameraChange) {
      this.onCameraChange(this.getCameraState())
    }
  }

  /**
   * 开始监控父容器 DIV 物理长宽规格的调节
   * 并利用 callback 回调使得视图跟随居中适配 
   */
  private bindResizeObserver(view: HTMLDivElement) {
    if (typeof ResizeObserver === "undefined") return

    this.resizeObserver = new ResizeObserver(() => {
      this.fitToViewport()
    })

    this.resizeObserver.observe(view)
  }

  /**
   * 动态重载网格规格 (例如用户修改地图宽高或单元尺寸时调用)。
   * 将自动清空重建背景底层线条并重置摄像机位置。
   * 
   * @param options 最新的网格配置
   */
  public setupGrid(options: GridOptions) {
    this.gridOptions = resolveGridOptions(options)
    this.gridRenderer.render(this.gridOptions)
    this.fitToViewport()
  }

  /**
   * 视口自适应居中算法。
   * 运算逻辑：
   * 1. 取得 DOM 包围盒及内部所需 padding 安全区域。
   * 2. 计算将实际世界宽度刚好缩放放入屏幕内的倍率因子。
   * 3. 强制在 [zoomMin, zoomMax] 之间截断缩放因子。
   * 4. 基于缩放结果计算 (X, Y) 使世界坐标原点正好落位居中。
   * 5. 给三层同步施加绝对变换矩阵。
   */
  public fitToViewport() {
    const rect = (this.app.view as HTMLDivElement).getBoundingClientRect()
    const viewportWidth = Math.max(rect.width, 1)
    const viewportHeight = Math.max(rect.height, 1)

    const p = this.viewportOptions.padding
    const contentWidth = this.gridOptions.width
    const contentHeight = this.gridOptions.height

    const availableWidth = Math.max(viewportWidth - p.left - p.right, 1)
    const availableHeight = Math.max(viewportHeight - p.top - p.bottom, 1)

    // 算出双向适应比，取极小值使得不越界
    let scale = Math.min(
      availableWidth / contentWidth,
      availableHeight / contentHeight
    )
    scale = Math.min(
      Math.max(scale, this.viewportOptions.zoomMin),
      this.viewportOptions.zoomMax
    )

    // 计算世界原点的偏移
    const x = p.left + (availableWidth - contentWidth * scale) / 2
    const y = p.top + (availableHeight - contentHeight * scale) / 2

    const zoomStyle = { x, y, scaleX: scale, scaleY: scale }
    
    // 三层独立手动强制赋态
    this.app.tree.zoomLayer.set(zoomStyle)
    this.app.ground.zoomLayer.set(zoomStyle)
    this.app.sky.zoomLayer.set(zoomStyle)
    
    this.notifyCameraChange()
  }

  /**
   * 手动向指定方向平移整个世界视口。
   *  
   * @param deltaX 横向位移 (屏幕像素)
   * @param deltaY 纵向位移 (屏幕像素)
   */
  public panBy(deltaX: number, deltaY: number) {
    this.app.tree.zoomLayer.move(deltaX, deltaY)
    this.syncAndClamp()
    this.notifyCameraChange()
  }

  /**
   * 手动以特定物理中心对世界视口进行连乘缩放系数。
   * 
   * @param factor 欲乘上的缩放因子 (大于 1 放大，小于 1 缩小)
   * @param origin 指向具体要向其缩放锚定的 `世界坐标` 点
   */
  public zoomBy(factor: number, origin: WorldPoint) {
    const scale = this.app.tree.getValidScale(this.getCameraState().scale * factor)
    
    // 主层缩放运算
    this.app.tree.zoomLayer.scaleOfWorld(origin, scale)
    
    // 边界约束 + 同步从层
    this.syncAndClamp()
    
    this.notifyCameraChange()
  }

  /**
   * 获取引擎预设的视口配置
   */
  public getViewportOptions() {
    return this.viewportOptions
  }

  /**
   * 获取当前引擎挂载的网格配置参数
   */
  public getGridOptions() {
    return this.gridOptions
  }

  /**
   * 获取当前引擎挂载的网格配置参数 (别名)
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
   * 这个相机指的是底层画布的绝对定位矩阵反算结果。
   * 
   * @returns CameraState - 包含 x、y 平移分量及 scale 统一缩放系数的快照
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
   * 向外暴露底层的 Leafer App 总容器实例
   */
  public getApp() {
    return this.app
  }

  /**
   * 获取内容图层 (`tree`) 的引用。
   * - 所有的交互业务块/瓦片块都主要向此群组追加。
   */
  public getContentLayer() {
    return this.app.tree
  }

  /**
   * 获取覆盖图层 (`sky`) 的引用。
   * - 适合用于悬浮绘制边界、网格准星提示器等不触碰实体的 UI 层。
   */
  public getOverlayLayer() {
    return this.app.sky
  }

  /**
   * 局部容器坐标系 (基于 React Div 或局部 Element 区域的) 转换为底层画布的世界坐标系。
   * - 这个被用来解析用户的 Local Mouse Position 并找寻到它在广袤画布世界的位置。
   * 
   * @param x 外部组件局部相对 X
   * @param y 外部组件局部相对 Y
   * @returns 逆运算后的绝对世界坐标 (WorldPoint)
   */
  public screenToWorld(x: number, y: number): WorldPoint {
    const { x: cx, y: cy, scale } = this.getCameraState()
    return {
      x: (x - cx) / scale,
      y: (y - cy) / scale,
    }
  }

  /**
   * 画布世界坐标转换回屏幕视口上的坐标表现位置。
   * 
   * @param x 目标世界坐标 X
   * @param y 目标世界坐标 Y
   * @returns 换算后当前应当位于 DOM 组件中的物理位置
   */
  public worldToScreen(x: number, y: number): WorldPoint {
    const { x: cx, y: cy, scale } = this.getCameraState()
    return { 
      x: x * scale + cx, 
      y: y * scale + cy 
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
   * - 鼠标必须进入世界的内部合法值之内否则放弃抛错反馈 null。
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
   * 世界坐标吸附到离他最靠近的整数块级世界坐标体系锚点的位置
   */
  public snapWorldPosition(x: number, y: number): WorldPoint {
    return snapWorldPosition(x, y, this.gridOptions.cellSize)
  }

  /**
   * 释放引擎。清理监听器解绑原生 DOM 以及重置所占用的全部引擎资源和图形处理器缓存。
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
