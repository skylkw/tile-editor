import type { LeaferEngine } from "@/core/engine/leafer-engine"
import { buildTiledMap, getFirstTileLayer } from "@/core/io/tiled-map"
import { TileLayer } from "@/core/tilemap/tile-layer"
import type {
  TiledMap,
  TiledTileLayer,
  TiledTilesetRef,
} from "@/core/tilemap/tiled-types"
import { useCallback, useEffect, useRef, type RefObject } from "react"

/**
 * React 适配层：
 * - 将 TileLayer（业务层）挂接到 React 生命周期
 * - 对外暴露稳定的 set/remove/clear 接口
 */
export function useTileLayer(engineRef: RefObject<LeaferEngine | null>) {
  const layerRef = useRef<TileLayer | null>(null)

  const getLayer = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return null

    if (!layerRef.current) {
      layerRef.current = new TileLayer(engine)
    }
    return layerRef.current
  }, [engineRef])

  const setTile = useCallback(
    (cellX: number, cellY: number, fill = "#4f46e5") => {
      const layer = getLayer()
      if (!layer) return
      layer.setTile(cellX, cellY, fill)
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
    (cellX: number, cellY: number, rawGid: number, fill = "#4f46e5") => {
      const layer = getLayer()
      if (!layer) return
      layer.setTileGid(cellX, cellY, rawGid, fill)
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
      width?: number
      height?: number
      layerName?: string
      tilesets?: TiledTilesetRef[]
      infinite?: boolean
      orientation?: TiledMap["orientation"]
    }): TiledMap | null => {
      const layer = getLayer()
      const engine = engineRef.current
      if (!layer || !engine) return null

      const tileLayer = layer.exportTiledTileLayer(options?.layerName)
      const cellSize = engine.getCellSize()

      return buildTiledMap({
        tilewidth: cellSize,
        tileheight: cellSize,
        infinite: options?.infinite ?? true,
        width: options?.width,
        height: options?.height,
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
    layerRef.current?.clear()
  }, [])

  useEffect(() => {
    return () => {
      layerRef.current?.destroy()
      layerRef.current = null
    }
  }, [])

  return {
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
