/**
 * 网格配置（外部可传入的可选项）。
 * - 所有字段都允许按需覆盖默认值
 * - 不传时会使用引擎内置默认配置
 */
export interface GridOptions {
  cellSize?: number
  majorLineEvery?: number
  halfCellCount?: number
  minorColor?: string
  majorColor?: string
  axisColor?: string
  lineThickness?: number
  majorLineThickness?: number
  axisLineThickness?: number
}

/**
 * 网格配置（引擎内部实际使用的完整配置）。
 */
export interface ResolvedGridOptions {
  cellSize: number
  majorLineEvery: number
  halfCellCount: number
  minorColor: string
  majorColor: string
  axisColor: string
  lineThickness: number
  majorLineThickness: number
  axisLineThickness: number
}

/**
 * 引擎创建参数。
 */
export interface CreateLeaferEngineOptions {
  view: HTMLDivElement
  grid?: GridOptions
}

/**
 * 网格坐标（离散单元坐标）。
 */
export type GridCell = {
  cellX: number
  cellY: number
}

/**
 * 世界坐标（连续画布坐标）。
 */
export type WorldPoint = {
  x: number
  y: number
}
