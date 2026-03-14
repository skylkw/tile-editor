import type {
  TiledMap,
  TiledTileLayer,
  TiledTilesetRef,
} from "@/types/tiled"

export type TiledMapBuildOptions = {
  tilewidth: number
  tileheight: number
  orientation?: TiledMap["orientation"]
  infinite?: boolean
  width?: number
  height?: number
  tilesets?: TiledTilesetRef[]
  layers: Array<TiledTileLayer | Record<string, unknown>>
}

export type LayerCell = {
  cellX: number
  cellY: number
  rawGid: number
}

export function buildTiledMap(options: TiledMapBuildOptions): TiledMap {
  return {
    type: "map",
    version: "1.10",
    tiledversion: "1.10",
    orientation: options.orientation ?? "orthogonal",
    renderorder: "right-down",
    infinite: options.infinite ?? false,
    width: options.width,
    height: options.height,
    tilewidth: options.tilewidth,
    tileheight: options.tileheight,
    layers: options.layers,
    tilesets: options.tilesets ?? [],
  }
}

export function getFirstTileLayer(map: TiledMap): TiledTileLayer | null {
  for (const layer of map.layers) {
    if (isTileLayer(layer)) return layer
  }

  return null
}

export function readTileLayerCells(
  layer: TiledTileLayer,
  mapWidth?: number,
  mapHeight?: number
): LayerCell[] {
  if (layer.chunks?.length) {
    return readChunkCells(layer)
  }

  return readFlatLayerCells(layer, mapWidth, mapHeight)
}

function readChunkCells(layer: TiledTileLayer): LayerCell[] {
  const cells: LayerCell[] = []

  for (const chunk of layer.chunks ?? []) {
    for (let index = 0; index < chunk.data.length; index += 1) {
      const rawGid = chunk.data[index]
      if (!rawGid) continue

      const localX = index % chunk.width
      const localY = Math.floor(index / chunk.width)

      cells.push({
        cellX: chunk.x + localX,
        cellY: chunk.y + localY,
        rawGid,
      })
    }
  }

  return cells
}

function readFlatLayerCells(
  layer: TiledTileLayer,
  mapWidth?: number,
  mapHeight?: number
): LayerCell[] {
  const width = layer.width ?? mapWidth
  const height = layer.height ?? mapHeight

  if (!width || !height) {
    throw new Error("Tiled tilelayer 缺少 width/height，无法解析 data")
  }

  const rawData = decodeLayerData(layer)
  const xOffset = layer.x ?? 0
  const yOffset = layer.y ?? 0
  const cells: LayerCell[] = []

  for (let index = 0; index < rawData.length; index += 1) {
    const rawGid = rawData[index]
    if (!rawGid) continue

    cells.push({
      cellX: xOffset + (index % width),
      cellY: yOffset + Math.floor(index / width),
      rawGid,
    })
  }

  return cells
}

function decodeLayerData(layer: TiledTileLayer): number[] {
  if (!layer.data) return []

  if (Array.isArray(layer.data)) {
    return layer.data
  }

  if (layer.encoding === "csv") {
    return parseCsvData(layer.data)
  }

  if (layer.encoding === "base64") {
    return parseBase64Data(layer.data, layer.compression)
  }

  throw new Error("暂不支持的 tilelayer 编码格式")
}

function parseCsvData(data: string): number[] {
  return data
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
}

function parseBase64Data(data: string, compression?: string): number[] {
  if (compression) {
    throw new Error(`暂不支持压缩 base64 图层数据: ${compression}`)
  }

  const binary = atob(data.trim())
  const byteLength = binary.length

  if (byteLength % 4 !== 0) {
    throw new Error("base64 图层数据长度非法，无法按 32 位 GID 解析")
  }

  const values = new Array<number>(byteLength / 4)

  for (let i = 0; i < values.length; i += 1) {
    const byteIndex = i * 4
    values[i] =
      binary.charCodeAt(byteIndex) |
      (binary.charCodeAt(byteIndex + 1) << 8) |
      (binary.charCodeAt(byteIndex + 2) << 16) |
      (binary.charCodeAt(byteIndex + 3) << 24)
  }

  return values
}

function isTileLayer(layer: TiledMap["layers"][number]): layer is TiledTileLayer {
  return (
    typeof layer === "object" &&
    layer !== null &&
    "type" in layer &&
    layer.type === "tilelayer"
  )
}
