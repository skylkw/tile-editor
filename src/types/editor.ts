import type {
  GridConfig,
  CameraState,
  ViewportConfig,
} from "./engine"

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

export type ThemeConfig = {
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

export type LayerConfig = {
  defaultNamePrefix: string
}

export type ShortcutConfig = {
  paintButton: number
  eraseButton: number
  panButton: number
  panKey: string
  cancelSelectionKey: string
}

export type AppConfig = {
  camera: CameraState
  viewport: ViewportConfig
  document: GridConfig
  theme: ThemeConfig
  layer: LayerConfig
  shortcuts: ShortcutConfig
}
