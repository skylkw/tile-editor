export type DocumentSettings = {
  cols: number
  rows: number
  cellSize: number
  majorLineEvery: number
  backgroundColor: string
  minorColor: string
  majorColor: string
  borderColor: string
  lineThickness: number
  majorLineThickness: number
  borderThickness: number
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

export type ThemeSettings = {
  hoverOutline: {
    fill: string
    stroke: string
    strokeWidth: number
    cornerRadius: number
  }
  stampPreviewTint: {
    fill: string
    cornerRadius: number
  }
}

export type LayerSettings = {
  defaultNamePrefix: string
}

export type ShortcutSettings = {
  paintButton: number
  eraseButton: number
  panButton: number
  panKey: string
  cancelSelectionKey: string
}

export type AppConfig = {
  camera: { x: number; y: number; scale: number }
  viewport: any // Will import ViewportOptions where used or define broadly
  document: DocumentSettings
  theme: ThemeSettings
  layer: LayerSettings
  shortcuts: ShortcutSettings
}
