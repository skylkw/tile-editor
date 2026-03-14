/**
 * 网格数据类型。
 * width 和 height 是由 cols * cellSize 派生出来的。
 */
export interface Grid {
  cellSize: number
  cols: number
  rows: number
  width: number
  height: number
  majorLineEvery: number
  backgroundColor: string
  minorColor: string
  majorColor: string
  borderColor: string
  lineThickness: number
  majorLineThickness: number
  borderThickness: number
}

/**
 * 创建或配置网格时必须提供的参数。
 * 注意：width 和 height 会自动基于 cols * cellSize 计算得出。
 */
export type GridOptions = Omit<Grid, "width" | "height">

export type Padding = {
  top: number
  right: number
  bottom: number
  left: number
}

export interface ViewportOptions {
  zoomMin: number
  zoomMax: number
  zoomStep: number
  /** 初始居中时的四周留白 */
  padding: Padding
  /** 拖拽时画布必须保留在视口内的最小像素数或百分比 (如 64 或 "50%") */
  clampMargin: number | string
}

/**
 * 引擎创建参数。
 */
export interface CreateLeaferEngineOptions {
  view: HTMLDivElement
  grid: GridOptions
  viewport: ViewportOptions
}

/**
 * 网格坐标（离散单元坐标）。
 */
export type GridCell = {
  cellX: number
  cellY: number
}

/**
 * 世界坐标 / 屏幕坐标（连续坐标）。
 */
export type WorldPoint = {
  x: number
  y: number
}

export type CameraState = {
  x: number
  y: number
  scale: number
}
