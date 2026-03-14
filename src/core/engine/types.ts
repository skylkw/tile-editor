/**
 * 网格配置（外部可传入的可选项）。
 * width / height 使用像素单位，cols / rows 使用单元数量。
 * 两组尺寸只需要提供一组；若同时提供，必须保持一致。
 */
export interface GridOptions {
  width?: number
  height?: number
  cellSize?: number
  cols?: number
  rows?: number
  majorLineEvery?: number
  backgroundColor?: string
  minorColor?: string
  majorColor?: string
  borderColor?: string
  lineThickness?: number
  majorLineThickness?: number
  borderThickness?: number
}

export interface MapMetrics {
  width: number
  height: number
  cellSize: number
  cols: number
  rows: number
}

/**
 * 引擎内部实际使用的完整配置。
 */
export interface ResolvedGridOptions extends MapMetrics {
  majorLineEvery: number
  backgroundColor: string
  minorColor: string
  majorColor: string
  borderColor: string
  lineThickness: number
  majorLineThickness: number
  borderThickness: number
}

export interface ViewportOptions {
  zoomMin?: number
  zoomMax?: number
  zoomStep?: number
  fitPadding?: number
}

/**
 * 引擎创建参数。
 */
export interface CreateLeaferEngineOptions {
  view: HTMLDivElement
  grid?: GridOptions
  viewport?: ViewportOptions
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
