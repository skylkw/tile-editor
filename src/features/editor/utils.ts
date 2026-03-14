import {
  clearTiledGidFlags,
  encodeTiledGid,
  type TiledGidFlags,
} from "@/core/tilemap/tiled-gid"
import type { TiledMap, TiledTilesetRef } from "@/core/tilemap/tiled-types"
import type { TilesetStamp, TilesetTileDescriptor } from "@/core/tilemap/tileset"
import type {
  BrushTransformState,
  DocumentSettings,
  ImageBounds,
} from "./types"

export const DEFAULT_DOCUMENT: DocumentSettings = {
  cols: 128,
  rows: 128,
  cellSize: 32,
  majorLineEvery: 8,
}

export const DEFAULT_BRUSH_TRANSFORM: BrushTransformState = {
  flipH: false,
  flipV: false,
  flipD: false,
}

export const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
}

type Matrix2 = [number, number, number, number]

const FLAG_VARIANTS: BrushTransformState[] = [
  { flipH: false, flipV: false, flipD: false },
  { flipH: true, flipV: false, flipD: false },
  { flipH: false, flipV: true, flipD: false },
  { flipH: true, flipV: true, flipD: false },
  { flipH: false, flipV: false, flipD: true },
  { flipH: true, flipV: false, flipD: true },
  { flipH: false, flipV: true, flipD: true },
  { flipH: true, flipV: true, flipD: true },
]

const HORIZONTAL_FLIP: Matrix2 = [-1, 0, 0, 1]
const VERTICAL_FLIP: Matrix2 = [1, 0, 0, -1]
const DIAGONAL_FLIP: Matrix2 = [0, 1, 1, 0]
const ROTATE_CW: Matrix2 = [0, -1, 1, 0]
const ROTATE_CCW: Matrix2 = [0, 1, -1, 0]

function multiplyMatrix(left: Matrix2, right: Matrix2): Matrix2 {
  return [
    left[0] * right[0] + left[1] * right[2],
    left[0] * right[1] + left[1] * right[3],
    left[2] * right[0] + left[3] * right[2],
    left[2] * right[1] + left[3] * right[3],
  ]
}

function matrixKey(matrix: Matrix2) {
  return matrix.join(",")
}

function transformFlagsToMatrix(flags: BrushTransformState): Matrix2 {
  let matrix: Matrix2 = [1, 0, 0, 1]

  if (flags.flipD) {
    matrix = multiplyMatrix(DIAGONAL_FLIP, matrix)
  }

  if (flags.flipH) {
    matrix = multiplyMatrix(HORIZONTAL_FLIP, matrix)
  }

  if (flags.flipV) {
    matrix = multiplyMatrix(VERTICAL_FLIP, matrix)
  }

  return matrix
}

function matrixToTransformFlags(matrix: Matrix2): BrushTransformState {
  const variant = FLAG_VARIANTS.find(
    (candidate) => matrixKey(transformFlagsToMatrix(candidate)) === matrixKey(matrix)
  )

  if (!variant) {
    return DEFAULT_BRUSH_TRANSFORM
  }

  return variant
}

function composeTransform(
  source: BrushTransformState,
  operation: Matrix2
): BrushTransformState {
  const nextMatrix = multiplyMatrix(operation, transformFlagsToMatrix(source))
  return matrixToTransformFlags(nextMatrix)
}

function transformPoint(matrix: Matrix2, x: number, y: number) {
  return {
    x: matrix[0] * x + matrix[1] * y,
    y: matrix[2] * x + matrix[3] * y,
  }
}

function getTransformedBounds(matrix: Matrix2, width: number, height: number) {
  const corners = [
    transformPoint(matrix, 0, 0),
    transformPoint(matrix, width, 0),
    transformPoint(matrix, 0, height),
    transformPoint(matrix, width, height),
  ]

  const minX = Math.min(...corners.map((corner) => corner.x))
  const minY = Math.min(...corners.map((corner) => corner.y))
  const maxX = Math.max(...corners.map((corner) => corner.x))
  const maxY = Math.max(...corners.map((corner) => corner.y))

  return {
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function transformLayoutCell(
  matrix: Matrix2,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number
) {
  const bounds = getTransformedBounds(matrix, width, height)
  const corners = [
    transformPoint(matrix, offsetX, offsetY),
    transformPoint(matrix, offsetX + 1, offsetY),
    transformPoint(matrix, offsetX, offsetY + 1),
    transformPoint(matrix, offsetX + 1, offsetY + 1),
  ]

  return {
    offsetX: Math.min(...corners.map((corner) => corner.x)) - bounds.minX,
    offsetY: Math.min(...corners.map((corner) => corner.y)) - bounds.minY,
  }
}

export function isPositiveInteger(value: number) {
  return Number.isInteger(value) && value > 0
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function getMimeTypeFromPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? ""
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream"
}

export function getBoundsFromTiles(
  tiles: TilesetTileDescriptor[]
): ImageBounds | null {
  if (!tiles.length) return null

  const minX = Math.min(...tiles.map((tile) => tile.x))
  const minY = Math.min(...tiles.map((tile) => tile.y))
  const maxX = Math.max(...tiles.map((tile) => tile.x + tile.width))
  const maxY = Math.max(...tiles.map((tile) => tile.y + tile.height))

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

export function isAbsoluteLocalPath(path: string) {
  return (
    /^[a-zA-Z]:[\\/]/.test(path) ||
    path.startsWith("\\\\") ||
    path.startsWith("/")
  )
}

export function getDirectoryPath(path: string) {
  const normalized = path.replace(/[\\/]+/g, "/")
  const index = normalized.lastIndexOf("/")
  return index >= 0 ? normalized.slice(0, index) : ""
}

export function joinPath(baseDir: string, relativePath: string) {
  if (!baseDir) return relativePath
  const separator = baseDir.includes("\\") ? "\\" : "/"
  const normalizedBase = baseDir.replace(/[\\/]+/g, separator)
  const normalizedRelative = relativePath.replace(/[\\/]+/g, separator)
  return `${normalizedBase}${separator}${normalizedRelative}`
}

export function resolveTilesetSourcePath(
  mapPath: string,
  tilesetRef: TiledTilesetRef | undefined
) {
  const candidate = tilesetRef?.image ?? tilesetRef?.source
  if (!candidate) return ""
  if (isAbsoluteLocalPath(candidate)) return candidate

  const mapDir = getDirectoryPath(mapPath)
  return joinPath(mapDir, candidate)
}

export function getDocumentConfigFromMap(map: TiledMap): DocumentSettings | null {
  if (!map.width || !map.height || !map.tilewidth || !map.tileheight) return null
  if (map.tilewidth !== map.tileheight) return null

  return {
    cols: map.width,
    rows: map.height,
    cellSize: map.tilewidth,
    majorLineEvery: DEFAULT_DOCUMENT.majorLineEvery,
  }
}

export function getTilesetKey(tileset: { sourcePath?: string; name: string }) {
  return tileset.sourcePath ?? tileset.name
}

export function confirmDiscardChanges() {
  return window.confirm("当前有未保存修改，继续操作会覆盖当前状态，是否继续？")
}

export function rotateBrushClockwise(transform: BrushTransformState) {
  return composeTransform(transform, ROTATE_CW)
}

export function rotateBrushCounterClockwise(transform: BrushTransformState) {
  return composeTransform(transform, ROTATE_CCW)
}

export function toggleBrushHorizontalFlip(transform: BrushTransformState) {
  return composeTransform(transform, HORIZONTAL_FLIP)
}

export function toggleBrushVerticalFlip(transform: BrushTransformState) {
  return composeTransform(transform, VERTICAL_FLIP)
}

export function resetBrushTransform() {
  return DEFAULT_BRUSH_TRANSFORM
}

export function transformBrushGid(
  gid: number,
  transform: BrushTransformState
): number {
  return encodeTiledGid(clearTiledGidFlags(gid), transform)
}

export function transformStamp(
  stamp: TilesetStamp | null,
  transform: BrushTransformState
): TilesetStamp | null {
  if (!stamp) return null

  const matrix = transformFlagsToMatrix(transform)
  const transformedBounds = getTransformedBounds(
    matrix,
    stamp.width,
    stamp.height
  )

  return {
    ...stamp,
    width: transformedBounds.width,
    height: transformedBounds.height,
    primaryGid: transformBrushGid(stamp.primaryGid, transform),
    cells: stamp.cells.map((cell) => {
      const transformedCell = transformLayoutCell(
        matrix,
        stamp.width,
        stamp.height,
        cell.offsetX,
        cell.offsetY
      )

      return {
        ...cell,
        offsetX: transformedCell.offsetX,
        offsetY: transformedCell.offsetY,
        gid: transformBrushGid(cell.gid, transform),
      }
    }),
  }
}

export function getBrushTransformSummary(transform: BrushTransformState) {
  const key = matrixKey(transformFlagsToMatrix(transform))
  const labels: Record<string, string> = {
    [matrixKey(transformFlagsToMatrix(DEFAULT_BRUSH_TRANSFORM))]: "Identity",
    [matrixKey(transformFlagsToMatrix({ flipH: true, flipV: false, flipD: false }))]:
      "Flip X",
    [matrixKey(transformFlagsToMatrix({ flipH: false, flipV: true, flipD: false }))]:
      "Flip Y",
    [matrixKey(transformFlagsToMatrix({ flipH: true, flipV: true, flipD: false }))]:
      "Rotate 180",
    [matrixKey(transformFlagsToMatrix({ flipH: false, flipV: false, flipD: true }))]:
      "Diagonal Flip",
    [matrixKey(transformFlagsToMatrix({ flipH: true, flipV: false, flipD: true }))]:
      "Rotate 90",
    [matrixKey(transformFlagsToMatrix({ flipH: false, flipV: true, flipD: true }))]:
      "Rotate 270",
    [matrixKey(transformFlagsToMatrix({ flipH: true, flipV: true, flipD: true }))]:
      "Diagonal + Rotate 180",
  }

  return labels[key] ?? "Identity"
}

export function flagsToTiledFlags(
  transform: BrushTransformState
): Partial<TiledGidFlags> {
  return {
    flipH: transform.flipH,
    flipV: transform.flipV,
    flipD: transform.flipD,
  }
}
