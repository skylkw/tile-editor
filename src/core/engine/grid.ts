import { Rect } from "leafer-ui"
import type { ILeafer } from "leafer-ui"
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
 * 
 * 主要职责：
 * 1. 在指定的 ILeafer 图层上渲染实色背景。
 * 2. 根据配置渲染次级网格线、主网格线 (Major Lines) 以及地图边界线 (Border)。
 * 3. 维护网格节点的生命周期，支持清空重绘。
 */
export class GridRenderer {
  /** 挂载的图层容器 (通常是 Leafer App 的 ground 层) */
  private readonly parent: ILeafer
  /** 维护当前所有渲染的 Rect 节点引用，用于清理 */
  private gridNodes: Rect[] = []

  constructor(parent: ILeafer) {
    this.parent = parent
  }

  /**
   * 执行渲染逻辑：先清理旧节点，再根据 specifications 循环创建网格线
   * 
   * @param config 网格配置项
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
      majorLineThickness,
      borderThickness,
    } = config

    const width = cols * cellSize
    const height = rows * cellSize

    // 1. 绘制底色背景
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

    // 2. 绘制垂直网格线 (Columns)
    for (let column = 0; column <= cols; column += 1) {
      const isBorder = column === 0 || column === cols
      const isMajor = column % majorLineEvery === 0

      const thickness = isBorder
        ? borderThickness
        : isMajor
          ? majorLineThickness
          : lineThickness
      const color = isBorder ? borderColor : isMajor ? majorColor : minorColor
      const x = column * cellSize

      this.appendLineRect({
        x: x - thickness / 2, // 居中线条，防止视觉偏置
        y: 0,
        width: thickness,
        height,
        color,
      })
    }

    // 3. 绘制水平网格线 (Rows)
    for (let row = 0; row <= rows; row += 1) {
      const isBorder = row === 0 || row === rows
      const isMajor = row % majorLineEvery === 0

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

  /**
   * 彻底清理并销毁所有已渲染的网格节点
   */
  public clear() {
    this.gridNodes.forEach((node) => node.destroy())
    this.gridNodes = []
  }

  /**
   * 内部工厂：创建一个矩形并将其作为线段添加到容器中
   */
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
      hitChildren: false, // 禁用交互，网格不应该响应鼠标
    })

    this.parent.add(line)
    this.gridNodes.push(line)
  }
}
