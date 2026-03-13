import type { TiledTilesetRef } from "./tiled-types"

export const GID_FLIP_HORIZONTAL = 0x80000000
export const GID_FLIP_VERTICAL = 0x40000000
export const GID_FLIP_DIAGONAL = 0x20000000
export const GID_ROTATE_HEX_120 = 0x10000000

const GID_ALL_FLAGS =
  GID_FLIP_HORIZONTAL |
  GID_FLIP_VERTICAL |
  GID_FLIP_DIAGONAL |
  GID_ROTATE_HEX_120

export type TiledGidFlags = {
  flipH: boolean
  flipV: boolean
  flipD: boolean
  rotateHex120: boolean
}

export type DecodedTiledGid = TiledGidFlags & {
  raw: number
  gid: number
}

export function clearTiledGidFlags(rawGid: number): number {
  return rawGid & ~GID_ALL_FLAGS
}

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

export function resolveTilesetByGid(
  tilesets: TiledTilesetRef[],
  gid: number
): TiledTilesetRef | null {
  if (gid <= 0) return null

  let resolved: TiledTilesetRef | null = null

  for (const tileset of tilesets) {
    if (tileset.firstgid <= gid) {
      if (!resolved || tileset.firstgid > resolved.firstgid) {
        resolved = tileset
      }
    }
  }

  return resolved
}

export function toLocalTileId(gid: number, tilesetFirstGid: number): number {
  return gid - tilesetFirstGid
}
