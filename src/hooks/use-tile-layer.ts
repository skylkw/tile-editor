import type { LeaferEngine } from "@/core/engine/leafer-engine"
import { TileLayer } from "@/core/tilemap/tile-layer"
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
    removeTile,
    clearTiles,
  }
}
