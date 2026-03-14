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
 * 外部输入：仅用于创建或局部更新。
 * 注意：输入时不包含计算出的 width/height。
 */
export type GridOptions = Partial<Omit<Grid, "width" | "height">>

export type Padding = {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

export interface ViewportOptions {
  zoomMin: number
  zoomMax: number
  zoomStep: number
  fitPadding: Padding
}

/**
 * 引擎创建参数。
 */
export interface CreateLeaferEngineOptions {
  view: HTMLDivElement
  grid?: GridOptions
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
