/**
 * 基础网格配置参数（输入）。
 */
export interface GridConfig {
  cellSize: number
  cols: number
  rows: number
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
 * 完整的网格指标（输出/运行时使用）。
 * 包含自动计算出的 width 和 height。
 */
export interface GridMetrics extends GridConfig {
  width: number
  height: number
}

export type Padding = {
  top: number
  right: number
  bottom: number
  left: number
}

export interface ViewportConfig {
  zoomMin: number
  zoomMax: number
  zoomStep: number
  /** 初始居中时的四周留白 */
  padding: Padding
  /** 拖拽时画布必须保留在视口内的最小像素数或百分比 (如 64 或 "50%") */
  clampMargin: number | string
}

/**
 * 引擎创建配置。
 */
export interface LeaferEngineConfig {
  view: HTMLDivElement
  grid: GridConfig
  viewport: ViewportConfig
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
