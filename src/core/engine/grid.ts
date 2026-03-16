import { Rect, Path, Group } from "leafer-ui"
import type { ILeafer, IGroup } from "leafer-ui"
import type {
  GridConfig,
  GridCell,
  WorldPoint,
} from "@/types/engine"

/**
 * 世界坐标 (连续值) 转换为网格坐标 (离散单元索引)。
 * 使用 Math.floor 确保负数坐标也能正确映射到网格空间。
 */
export function worldToCell(x: number, y: number, cellSize: number): GridCell {
  return {
    cellX: Math.floor(x / cellSize),
    cellY: Math.floor(y / cellSize),
  }
}

/**
 * 网格坐标转换为该单元格左上角的世界坐标。
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
 * GridRenderer - 网格背景与线条绘制器。
 */
export class GridRenderer {
  private readonly parent: ILeafer | IGroup
  private background: Rect | null = null
  private paths: Path[] = []

  constructor(parent: ILeafer | IGroup) {
    this.parent = parent
  }

  /**
   * 执行渲染逻辑
   */
  public render(config: GridConfig) {
    this.clear()

    const {
      cellSize,
      cols,
      rows,
      majorLineEvery,
      backgroundColor,
      minorColor,
      majorColor,
      borderColor,
      lineThickness,
    } = config

    const width = cols * cellSize
    const height = rows * cellSize

    // 1. 绘制底色背景
    this.background = new Rect({
      x: 0,
      y: 0,
      width,
      height,
      fill: backgroundColor,
      hitChildren: false,
    })
    this.parent.add(this.background)

    // 2. 绘制网格线 (使用 Path 提升性能)
    let minorD = ""
    let majorD = ""
    let borderD = ""

    for (let column = 0; column <= cols; column += 1) {
      const isBorder = column === 0 || column === cols
      const isMajor = column % majorLineEvery === 0
      const x = column * cellSize
      const d = `M ${x} 0 L ${x} ${height} `
      
      if (isBorder) borderD += d
      else if (isMajor) majorD += d
      else minorD += d
    }

    for (let row = 0; row <= rows; row += 1) {
      const isBorder = row === 0 || row === rows
      const isMajor = row % majorLineEvery === 0
      const y = row * cellSize
      const d = `M 0 ${y} L ${width} ${y} `

      if (isBorder) borderD += d
      else if (isMajor) majorD += d
      else minorD += d
    }

    if (minorD) {
      const p = new Path({ path: minorD, stroke: minorColor, strokeWidth: lineThickness, hitChildren: false, opacity: 0.5 })
      this.parent.add(p); this.paths.push(p)
    }
    if (majorD) {
      const p = new Path({ path: majorD, stroke: majorColor, strokeWidth: lineThickness, hitChildren: false })
      this.parent.add(p); this.paths.push(p)
    }
    if (borderD) {
      const p = new Path({ path: borderD, stroke: borderColor, strokeWidth: lineThickness, hitChildren: false })
      this.parent.add(p); this.paths.push(p)
    }
  }

  /**
   * 彻底清理
   */
  public clear() {
    if (this.background) {
      this.background.destroy()
      this.background = null
    }
    this.paths.forEach(p => p.destroy())
    this.paths = []
  }
}

/**
 * 专门为 Tileset 设计的轻量级网格渲染逻辑
 */
export function renderTilesetGrid(parent: IGroup, ts: { 
  columns: number, 
  rows: number, 
  tileWidth: number, 
  tileHeight: number, 
  margin: number, 
  spacing: number 
}) {
  const gp = new Path({ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1, hitChildren: false })
  let d = ""
  for (let c = 0; c <= ts.columns; c++) {
    const x = ts.margin + c * (ts.tileWidth + ts.spacing)
    d += `M ${x} ${ts.margin} L ${x} ${ts.margin + ts.rows * (ts.tileHeight + ts.spacing)} `
  }
  for (let r = 0; r <= ts.rows; r++) {
    const y = ts.margin + r * (ts.tileHeight + ts.spacing)
    d += `M ${ts.margin} ${y} L ${ts.margin + ts.columns * (ts.tileWidth + ts.spacing)} ${y} `
  }
  gp.path = d
  const gg = new Group({ opacity: 0.25 })
  gg.add(gp)
  parent.add(gg)
}
