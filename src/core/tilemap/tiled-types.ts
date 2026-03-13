export type TiledMapOrientation =
  | "orthogonal"
  | "isometric"
  | "oblique"
  | "staggered"
  | "hexagonal"

export interface TiledProperty {
  name: string
  type?: string
  propertytype?: string
  value: unknown
}

export interface TiledTilesetRef {
  firstgid: number
  source?: string
  name?: string
  image?: string
  tilewidth?: number
  tileheight?: number
  tilecount?: number
  columns?: number
  spacing?: number
  margin?: number
}

export interface TiledChunk {
  data: number[]
  height: number
  width: number
  x: number
  y: number
}

export interface TiledTileLayer {
  id?: number
  name: string
  type: "tilelayer"
  visible?: boolean
  opacity?: number
  width?: number
  height?: number
  x?: number
  y?: number
  encoding?: "csv" | "base64"
  compression?: "zlib" | "gzip" | "zstd"
  data?: number[] | string
  chunks?: TiledChunk[]
  properties?: TiledProperty[]
}

export interface TiledMap {
  type?: "map"
  version?: string | number
  tiledversion?: string
  orientation: TiledMapOrientation
  renderorder?: "right-down" | "right-up" | "left-down" | "left-up"
  infinite?: boolean
  width?: number
  height?: number
  tilewidth: number
  tileheight: number
  layers: Array<TiledTileLayer | Record<string, unknown>>
  tilesets: TiledTilesetRef[]
  properties?: TiledProperty[]
}
