import {
  createLeaferEngine,
  type LeaferEngine,
} from "@/core/engine/leafer-engine"
import { useEffect, useRef } from "react"
import { useTileLayer } from "./use-tile-layer"

export function useLeaferEngine() {
  const viewRef = useRef<HTMLDivElement | null>(null)
  const engineRef = useRef<LeaferEngine | null>(null)

  const { setTile, removeTile, clearTiles } = useTileLayer(engineRef)

  useEffect(() => {
    if (!viewRef.current) return

    const engine = createLeaferEngine({
      view: viewRef.current,
      grid: {
        cellSize: 32,
        majorLineEvery: 8,
        halfCellCount: 1200,
      },
    })
    engineRef.current = engine

    return () => {
      engine.destroy()
      engineRef.current = null
    }
  }, [])

  return {
    viewRef,
    engineRef,
    setTile,
    removeTile,
    clearTiles,
  }
}
