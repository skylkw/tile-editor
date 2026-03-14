import type { LeaferEngine } from "@/core/engine/leafer-engine"
import { buildTiledMap, getFirstTileLayer } from "@/core/io/tiled-map"
import { TileLayer } from "@/core/tilemap/tile-layer"
import type {
  TiledMap,
  TiledTileLayer,
  TiledTilesetRef,
} from "@/types/tiled"
import { useCallback, useEffect, useRef, type RefObject } from "react"

import type { Tileset } from "@/core/tilemap/tileset"

/**
 * React 适配层：
 * - 复用单个 TileLayer 实例，并在引擎重建时自动重新挂接
 * - 对外暴露稳定的 tile 操作与 Tiled 导入导出接口
 */
export function useTileLayer(engineRef: RefObject<LeaferEngine | null>) {
  const layerRef = useRef<TileLayer | null>(null)

  const getLayer = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return null

    if (!layerRef.current) {
      layerRef.current = new TileLayer(engine)
      return layerRef.current
    }

    if (!layerRef.current.isAttachedTo(engine)) {
      layerRef.current.attachEngine(engine)
    }

    layerRef.current.resizeToMatchEngine()
    return layerRef.current
  }, [engineRef])

  const setTileset = useCallback(
    (tileset: Tileset | null) => {
      const layer = getLayer()
      if (!layer) return
      layer.setTileset(tileset)
    },
    [getLayer]
  )

  const setTile = useCallback(
    (cellX: number, cellY: number, gid: number) => {
      const layer = getLayer()
      if (!layer) return
      layer.setTile(cellX, cellY, gid)
    },
    [getLayer]
  )

  const removeTile = useCallback(
    (cellX: number, cellY: number) => {
      const layer = getLayer()
      if (!layer) return
      layer.removeTile(cellX, cellY)
    },
    [getLayer]
  )

  const setTileGid = useCallback(
    (cellX: number, cellY: number, rawGid: number) => {
      const layer = getLayer()
      if (!layer) return
      layer.setTileGid(cellX, cellY, rawGid)
    },
    [getLayer]
  )

  const getTileGid = useCallback(
    (cellX: number, cellY: number) => {
      const layer = getLayer()
      if (!layer) return 0
      return layer.getTileGid(cellX, cellY)
    },
    [getLayer]
  )

  const exportTiledTileLayer = useCallback(
    (name?: string): TiledTileLayer | null => {
      const layer = getLayer()
      if (!layer) return null
      return layer.exportTiledTileLayer(name)
    },
    [getLayer]
  )

  const exportTiledMap = useCallback(
    (options?: {
      layerName?: string
      tilesets?: TiledTilesetRef[]
      infinite?: boolean
      orientation?: TiledMap["orientation"]
    }): TiledMap | null => {
      const layer = getLayer()
      const engine = engineRef.current
      if (!layer || !engine) return null

      const tileLayer = layer.exportTiledTileLayer(options?.layerName)
      const metrics = engine.getGrid()

      return buildTiledMap({
        tilewidth: metrics.cellSize,
        tileheight: metrics.cellSize,
        infinite: options?.infinite ?? false,
        width: metrics.cols,
        height: metrics.rows,
        orientation: options?.orientation ?? "orthogonal",
        tilesets: options?.tilesets ?? [],
        layers: [tileLayer],
      })
    },
    [engineRef, getLayer]
  )

  const importTiledMap = useCallback(
    (map: TiledMap) => {
      const layer = getLayer()
      if (!layer) return

      const tileLayer = getFirstTileLayer(map)
      if (!tileLayer) {
        layer.clear()
        return
      }

      layer.importTiledTileLayer(tileLayer, {
        mapWidth: map.width,
        mapHeight: map.height,
      })
    },
    [getLayer]
  )

  const clearTiles = useCallback(() => {
    getLayer()?.clear()
  }, [getLayer])

  useEffect(() => {
    return () => {
      layerRef.current?.destroy()
      layerRef.current = null
    }
  }, [])

  return {
    setTileset,
    setTile,
    setTileGid,
    getTileGid,
    removeTile,
    clearTiles,
    exportTiledTileLayer,
    exportTiledMap,
    importTiledMap,
  }
}
