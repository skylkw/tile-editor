/**
 * Tiled GID (Global Identifier) 处理工具
 * 
 * Tiled 使用 32 位整型存储 GID，其中高 4 位用于存储翻转和旋转标志位：
 * - 第 31 位：水平翻转 (Horizontal Flip)
 * - 第 30 位：垂直翻转 (Vertical Flip)
 * - 第 29 位：反角翻转 (Diagonal Flip，用于 90 度旋转)
 * - 第 28 位：十六进制地图旋转 (Hexagonal Rotate 120)
 */
import type { TiledTilesetRef } from "@/types/tiled"
import type { TiledGidFlags, DecodedTiledGid } from "@/types/tilemap"

// Tiled 定义的标志位掩码
export const GID_FLIP_HORIZONTAL = 0x80000000
export const GID_FLIP_VERTICAL = 0x40000000
export const GID_FLIP_DIAGONAL = 0x20000000
export const GID_ROTATE_HEX_120 = 0x10000000

// 所有标志位的合集掩码，用于清理标记位获取原始 GID
const GID_ALL_FLAGS =
  GID_FLIP_HORIZONTAL |
  GID_FLIP_VERTICAL |
  GID_FLIP_DIAGONAL |
  GID_ROTATE_HEX_120

/**
 * 清除 GID 中的所有变换标记位，返回纯粹的 ID。
 */
export function clearTiledGidFlags(rawGid: number): number {
  return rawGid & ~GID_ALL_FLAGS
}

/**
 * 解码原始 GID，提取出 ID 和翻转/旋转状态。
 */
export function decodeTiledGid(rawGid: number): DecodedTiledGid {
  return {
    raw: rawGid,
    gid: clearTiledGidFlags(rawGid),
    flipH: (rawGid & GID_FLIP_HORIZONTAL) !== 0,
    flipV: (rawGid & GID_FLIP_VERTICAL) !== 0,
    flipD: (rawGid & GID_FLIP_DIAGONAL) !== 0,
    rotateHex120: (rawGid & GID_ROTATE_HEX_120) !== 0,
  }
}

/**
 * 将原始 ID 和变换标记组合成一个 32 位的 Tiled GID 数值。
 */
export function encodeTiledGid(
  gid: number,
  flags?: Partial<TiledGidFlags>
): number {
  let rawGid = gid

  if (flags?.flipH) rawGid |= GID_FLIP_HORIZONTAL
  if (flags?.flipV) rawGid |= GID_FLIP_VERTICAL
  if (flags?.flipD) rawGid |= GID_FLIP_DIAGONAL
  if (flags?.rotateHex120) rawGid |= GID_ROTATE_HEX_120

  return rawGid
}

/**
 * 根据 GID 从图集列表中查找所属的图集引用。
 */
export function resolveTilesetByGid(
  tilesets: TiledTilesetRef[],
  gid: number
): TiledTilesetRef | null {
  if (gid <= 0) return null

  let resolved: TiledTilesetRef | null = null

  for (const tileset of tilesets) {
    // Tiled 中 GID 是全地图唯一的，图集按 firstgid 从小到大排列
    if (tileset.firstgid <= gid) {
      if (!resolved || tileset.firstgid > resolved.firstgid) {
        resolved = tileset
      }
    }
  }

  return resolved
}

/**
 * 将全局 GID 转换为图集内的局部 ID (从 0 开始)。
 */
export function toLocalTileId(gid: number, tilesetFirstGid: number): number {
  return gid - tilesetFirstGid
}
