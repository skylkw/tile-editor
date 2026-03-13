import { Rect, type App } from "leafer-ui"
import type {
  GridCell,
  GridOptions,
  ResolvedGridOptions,
  WorldPoint,
} from "../types"

/**
 * 网格系统默认参数：
 * - cellSize: 单格像素大小
 * - majorLineEvery: 每 N 条细线绘制一条主线
 * - halfCellCount: 以原点向四周扩展的半格数（超大有限网格）
 */
export const DEFAULT_GRID_OPTIONS: ResolvedGridOptions = {
  cellSize: 32,
  majorLineEvery: 8,
  halfCellCount: 500,
  minorColor: "#2b3442",
  majorColor: "#3b4758",
  axisColor: "#59667a",
  lineThickness: 1,
  majorLineThickness: 1.2,
  axisLineThickness: 1.6,
}

/**
 * 合并网格配置：外部传入可选字段，内部得到完整配置。
 */
export function resolveGridOptions(options?: GridOptions): ResolvedGridOptions {
  return {
    cellSize: options?.cellSize ?? DEFAULT_GRID_OPTIONS.cellSize,
    majorLineEvery:
      options?.majorLineEvery ?? DEFAULT_GRID_OPTIONS.majorLineEvery,
    halfCellCount: options?.halfCellCount ?? DEFAULT_GRID_OPTIONS.halfCellCount,
    minorColor: options?.minorColor ?? DEFAULT_GRID_OPTIONS.minorColor,
    majorColor: options?.majorColor ?? DEFAULT_GRID_OPTIONS.majorColor,
    axisColor: options?.axisColor ?? DEFAULT_GRID_OPTIONS.axisColor,
    lineThickness: options?.lineThickness ?? DEFAULT_GRID_OPTIONS.lineThickness,
    majorLineThickness:
      options?.majorLineThickness ?? DEFAULT_GRID_OPTIONS.majorLineThickness,
    axisLineThickness:
      options?.axisLineThickness ?? DEFAULT_GRID_OPTIONS.axisLineThickness,
  }
}

/**
 * 网格坐标 key（用于 Map/Record 索引）。
 */
export function keyByCell(cellX: number, cellY: number) {
  return `${cellX},${cellY}`
}

/**
 * 世界坐标 -> 网格坐标（向下取整）。
 */
export function worldToCell(x: number, y: number, cellSize: number): GridCell {
  return {
    cellX: Math.floor(x / cellSize),
    cellY: Math.floor(y / cellSize),
  }
}

/**
 * 网格坐标 -> 世界坐标（单元左上角）。
 */
export function cellToWorld(
  cellX: number,
  cellY: number,
  cellSize: number
): WorldPoint {
  return {
    x: cellX * cellSize,
    y: cellY * cellSize,
  }
}

/**
 * 将世界坐标吸附到网格单元左上角。
 */
export function snapWorldPosition(
  x: number,
  y: number,
  cellSize: number
): WorldPoint {
  const { cellX, cellY } = worldToCell(x, y, cellSize)
  return cellToWorld(cellX, cellY, cellSize)
}

/**
 * 网格线渲染器：只负责网格线节点创建/销毁。
 */
export class GridRenderer {
  private app: App
  private gridNodes: Rect[] = []

  constructor(app: App) {
    this.app = app
  }

  /**
   * 按配置重建网格（超大有限网格策略）。
   */
  public render(options: ResolvedGridOptions) {
    this.clear()

    const {
      cellSize,
      majorLineEvery,
      halfCellCount,
      minorColor,
      majorColor,
      axisColor,
      lineThickness,
      majorLineThickness,
      axisLineThickness,
    } = options

    const min = -halfCellCount * cellSize
    const span = halfCellCount * 2 * cellSize

    for (let i = -halfCellCount; i <= halfCellCount; i += 1) {
      const position = i * cellSize
      const isAxis = i === 0
      const isMajor = i % majorLineEvery === 0

      const thickness = isAxis
        ? axisLineThickness
        : isMajor
          ? majorLineThickness
          : lineThickness

      const color = isAxis ? axisColor : isMajor ? majorColor : minorColor

      this.appendLineRect({
        x: position - thickness / 2,
        y: min,
        width: thickness,
        height: span,
        color,
      })

      this.appendLineRect({
        x: min,
        y: position - thickness / 2,
        width: span,
        height: thickness,
        color,
      })
    }
  }

  /**
   * 清理网格线节点。
   */
  public clear() {
    this.gridNodes.forEach((node) => node.destroy())
    this.gridNodes = []
  }

  private appendLineRect(config: {
    x: number
    y: number
    width: number
    height: number
    color: string
  }) {
    const line = new Rect({
      x: config.x,
      y: config.y,
      width: config.width,
      height: config.height,
      fill: config.color,
    })

    this.app.ground.add(line)
    this.gridNodes.push(line)
  }
}
