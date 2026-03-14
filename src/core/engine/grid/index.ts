import { Group, Rect } from "leafer-ui"
import type {
  Grid,
  GridCell,
  GridOptions,
  WorldPoint,
} from "../types"

export const DEFAULT_GRID_OPTIONS: Grid = {
  width: 4096,
  height: 4096,
  cellSize: 32,
  cols: 128,
  rows: 128,
  majorLineEvery: 8,
  backgroundColor: "#0b1220",
  minorColor: "#1e293b",
  majorColor: "#334155",
  borderColor: "#f59e0b",
  lineThickness: 1,
  majorLineThickness: 1.4,
  borderThickness: 2,
}

function requirePositiveInteger(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new Error(`${name} 必须是正整数`)
  }

  return value
}

/**
 * 合并并校验网格配置，得到统一的有限画布尺寸。
 */
export function resolveGridOptions(options?: GridOptions): Grid {
  const cellSize = requirePositiveInteger(
    "cellSize",
    options?.cellSize ?? DEFAULT_GRID_OPTIONS.cellSize
  )

  const cols = requirePositiveInteger(
    "cols",
    options?.cols ?? DEFAULT_GRID_OPTIONS.cols
  )
  const rows = requirePositiveInteger(
    "rows",
    options?.rows ?? DEFAULT_GRID_OPTIONS.rows
  )

  const width = cols * cellSize
  const height = rows * cellSize

  return {
    width,
    height,
    cellSize,
    cols,
    rows,
    majorLineEvery: requirePositiveInteger(
      "majorLineEvery",
      options?.majorLineEvery ?? DEFAULT_GRID_OPTIONS.majorLineEvery
    ),
    backgroundColor:
      options?.backgroundColor ?? DEFAULT_GRID_OPTIONS.backgroundColor,
    minorColor: options?.minorColor ?? DEFAULT_GRID_OPTIONS.minorColor,
    majorColor: options?.majorColor ?? DEFAULT_GRID_OPTIONS.majorColor,
    borderColor: options?.borderColor ?? DEFAULT_GRID_OPTIONS.borderColor,
    lineThickness: options?.lineThickness ?? DEFAULT_GRID_OPTIONS.lineThickness,
    majorLineThickness:
      options?.majorLineThickness ?? DEFAULT_GRID_OPTIONS.majorLineThickness,
    borderThickness:
      options?.borderThickness ?? DEFAULT_GRID_OPTIONS.borderThickness,
  }
}

export function keyByCell(cellX: number, cellY: number) {
  return `${cellX},${cellY}`
}

export function worldToCell(x: number, y: number, cellSize: number): GridCell {
  return {
    cellX: Math.floor(x / cellSize),
    cellY: Math.floor(y / cellSize),
  }
}

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

export function snapWorldPosition(
  x: number,
  y: number,
  cellSize: number
): WorldPoint {
  const { cellX, cellY } = worldToCell(x, y, cellSize)
  return cellToWorld(cellX, cellY, cellSize)
}

/**
 * 网格线渲染器：负责固定画布背景、网格线和边框的创建/销毁。
 */
export class GridRenderer {
  private readonly parent: Group
  private gridNodes: Rect[] = []

  constructor(parent: Group) {
    this.parent = parent
  }

  public render(options: Grid) {
    this.clear()

    const {
      width,
      height,
      cellSize,
      cols,
      rows,
      majorLineEvery,
      backgroundColor,
      minorColor,
      majorColor,
      borderColor,
      lineThickness,
      majorLineThickness,
      borderThickness,
    } = options

    const background = new Rect({
      x: 0,
      y: 0,
      width,
      height,
      fill: backgroundColor,
      hitChildren: false,
    })
    this.parent.add(background)
    this.gridNodes.push(background)

    const shouldRenderMinorLines = cols <= 1024 && rows <= 1024

    for (let column = 0; column <= cols; column += 1) {
      const isBorder = column === 0 || column === cols
      const isMajor = column % majorLineEvery === 0

      if (!isBorder && !isMajor && !shouldRenderMinorLines) continue

      const thickness = isBorder
        ? borderThickness
        : isMajor
          ? majorLineThickness
          : lineThickness
      const color = isBorder ? borderColor : isMajor ? majorColor : minorColor
      const x = column * cellSize

      this.appendLineRect({
        x: x - thickness / 2,
        y: 0,
        width: thickness,
        height,
        color,
      })
    }

    for (let row = 0; row <= rows; row += 1) {
      const isBorder = row === 0 || row === rows
      const isMajor = row % majorLineEvery === 0

      if (!isBorder && !isMajor && !shouldRenderMinorLines) continue

      const thickness = isBorder
        ? borderThickness
        : isMajor
          ? majorLineThickness
          : lineThickness
      const color = isBorder ? borderColor : isMajor ? majorColor : minorColor
      const y = row * cellSize

      this.appendLineRect({
        x: 0,
        y: y - thickness / 2,
        width,
        height: thickness,
        color,
      })
    }
  }

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
      hitChildren: false,
    })

    this.parent.add(line)
    this.gridNodes.push(line)
  }
}
