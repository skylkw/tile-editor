export type DocumentSettings = {
  cols: number
  rows: number
  cellSize: number
  majorLineEvery: number
}

export type ImageBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type TilesetLoadSource = {
  name: string
  path: string
  firstGid?: number
  tileWidth: number
  tileHeight: number
  spacing?: number
  margin?: number
}

export type BrushTransformState = {
  flipH: boolean
  flipV: boolean
  flipD: boolean
}
