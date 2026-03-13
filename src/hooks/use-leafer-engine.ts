import {
  createLeaferEngine,
  type LeaferEngine,
} from "@/core/engine/leafer-engine"
import { PointerEvent, type IPointerEvent } from "leafer-ui"
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

    const app = engine.getApp()
    let isPainting = false
    let lastPaintedCellKey = ""

    const paintByPointer = (event: IPointerEvent) => {
      const page = event.getPagePoint()
      const snapped = engine.snapWorldPosition(page.x, page.y)
      const { cellX, cellY } = engine.worldToCell(snapped.x, snapped.y)
      const cellKey = `${cellX},${cellY}`

      if (cellKey === lastPaintedCellKey) return

      setTile(cellX, cellY)
      lastPaintedCellKey = cellKey
    }

    const handlePointerDown = (event: IPointerEvent) => {
      if (!event.left) return
      isPainting = true
      paintByPointer(event)
    }

    const handlePointerMove = (event: IPointerEvent) => {
      if (!isPainting || !event.left) return
      paintByPointer(event)
    }

    const stopPainting = () => {
      isPainting = false
      lastPaintedCellKey = ""
    }

    app.on(PointerEvent.DOWN, handlePointerDown)
    app.on(PointerEvent.MOVE, handlePointerMove)
    app.on(PointerEvent.UP, stopPainting)
    app.on(PointerEvent.LEAVE, stopPainting)

    return () => {
      app.off(PointerEvent.DOWN, handlePointerDown)
      app.off(PointerEvent.MOVE, handlePointerMove)
      app.off(PointerEvent.UP, stopPainting)
      app.off(PointerEvent.LEAVE, stopPainting)

      engine.destroy()
      engineRef.current = null
    }
  }, [setTile])

  return {
    viewRef,
    engineRef,
    setTile,
    removeTile,
    clearTiles,
  }
}
