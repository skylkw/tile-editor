import { useCallback, useEffect, useRef, useState } from "react"
import { Group, Image, Rect, PointerEvent as LP } from "leafer-ui"
import type { Tileset } from "@/core/tilemap/tileset"
import { LeaferEngine } from "@/core/engine/leafer-engine"
import { renderTilesetGrid } from "@/core/engine/grid"
import globalConfig from "@/config.json"

export interface UseTilesetEngineConfig {
  tilesets: Tileset[]
  getTilesetKey: (ts: { sourcePath?: string; name: string }) => string
  onSelectTiles: (gids: number[]) => void
  selectedTileGids: number[]
}

/**
 * useTilesetEngine - 业务逻辑层。
 */
export function useTilesetEngine(config: UseTilesetEngineConfig) {
  const { tilesets, getTilesetKey, onSelectTiles, selectedTileGids } = config
  
  const viewRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<LeaferEngine | null>(null)
  const [zoom, setZoom] = useState(100)
  
  // 1. 所有 Ref 放在最前面
  const posMapRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const syncSelectionRef = useRef<() => void>(() => {})
  const interactionRef = useRef({
    tilesDragging: false,
    tsDragging: false,
    dragKey: null as string | null,
    dragTileset: null as Tileset | null,
    startGid: null as number | null,
    dragGroupStart: { x: 0, y: 0 },
    dragMouseStart: { x: 0, y: 0 },
    altDown: false,
  })

  // 2. 所有 Callback
  const syncSelection = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return
    const sky = engine.getOverlayLayer()
    sky.clear()

    if (!selectedTileGids.length) return

    // 为每个相关的图集绘制一个选区框
    tilesets.forEach(ts => {
      const gids = selectedTileGids.filter(g => ts.containsGid(g))
      if (!gids.length) return

      const key = getTilesetKey(ts)
      const g = engine.getContentLayer().children?.find((c: any) => c.id === key)
      if (!g) return

      // 计算在该图集坐标系下的包围盒
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const gid of gids) {
        const d = ts.getTileDescriptor(gid)
        if (d) { 
          x0 = Math.min(x0, d.x); y0 = Math.min(y0, d.y)
          x1 = Math.max(x1, d.x + d.width); y1 = Math.max(y1, d.y + d.height) 
        }
      }

      if (x0 !== Infinity) {
        // 创建一个选区容器，限制在图集所在的组内坐标
        const sel = new Group({
          x: (g.x as number),
          y: (g.y as number),
          hittable: false
        })

        // 填充层
        sel.add(new Rect({
          x: x0, y: y0, width: x1 - x0, height: y1 - y0,
          fill: globalConfig.theme.stampPreviewTint.fill,
          cornerRadius: 2
        }))

        // 描边层
        sel.add(new Rect({
          x: x0, y: y0, width: x1 - x0, height: y1 - y0,
          stroke: globalConfig.theme.hoverOutline.stroke,
          strokeWidth: 2,
          cornerRadius: 2
        }))

        sky.add(sel)
      }
    })
  }, [tilesets, selectedTileGids, getTilesetKey])

  const syncTilesets = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return

    const content = engine.getContentLayer()
    content.clear()
    
    const GAP = 24
    let autoY = 0

    tilesets.forEach(ts => {
      const key = getTilesetKey(ts)
      if (!posMapRef.current.has(key)) {
        posMapRef.current.set(key, { x: 0, y: autoY })
      }
      const p = posMapRef.current.get(key)!
      autoY += ts.imageHeight + GAP

      const g = new Group({ x: p.x, y: p.y, id: key })
      g.add(new Image({ url: ts.image, width: ts.imageWidth, height: ts.imageHeight }))
      
      if (ts.tileWidth >= 8) {
        renderTilesetGrid(g, ts)
      }

      const il = new Rect({
        x: 0, y: 0, width: ts.imageWidth, height: ts.imageHeight,
        fill: "transparent", cursor: "crosshair",
        id: `interact-${key}`
      })
      g.add(il)

      il.on(LP.DOWN, (e: LP) => {
        const state = interactionRef.current
        if (state.altDown) {
          state.tsDragging = true
          state.dragKey = key
          state.dragGroupStart = { x: g.x as number, y: g.y as number }
          const ne = (e as unknown as { origin?: PointerEvent }).origin
          state.dragMouseStart = { x: ne?.clientX ?? 0, y: ne?.clientY ?? 0 }
          e.stop?.()
          return
        }

        state.tilesDragging = true
        state.dragTileset = ts
        const loc = il.getLocalPoint(e)
        const tile = ts.getTileAtImagePoint(loc.x, loc.y)
        state.startGid = tile ? tile.gid : null
        if (tile) onSelectTiles([tile.gid])
      })

      il.on(LP.MOVE, (e: LP) => {
        const state = interactionRef.current
        if (!state.tilesDragging || state.dragTileset !== ts || state.startGid === null) return
        
        const loc = il.getLocalPoint(e)
        // 限制在图集范围内，并计算行列
        const col = Math.max(0, Math.min(ts.columns - 1, Math.floor((loc.x - ts.margin) / (ts.tileWidth + ts.spacing))))
        const row = Math.max(0, Math.min(ts.rows - 1, Math.floor((loc.y - ts.margin) / (ts.tileHeight + ts.spacing))))
        
        const a = ts.getTileDescriptor(state.startGid)
        
        if (a) {
           const c0 = Math.min(a.column, col), c1 = Math.max(a.column, col)
           const r0 = Math.min(a.row, row), r1 = Math.max(a.row, row)
           const gids: number[] = []
           for (let r = r0; r <= r1; r++)
             for (let c = c0; c <= c1; c++)
               gids.push(ts.firstGid + r * ts.columns + c)
           
           // 只有当 GID 集合真正变化时才同步，减少闪烁
           if (JSON.stringify(gids) !== JSON.stringify(selectedTileGids)) {
             onSelectTiles(gids)
           }
        }
      })
      content.add(g)
    })
  }, [tilesets, getTilesetKey, onSelectTiles])

  // 3. 所有 Effect
  useEffect(() => {
    syncSelectionRef.current = syncSelection
  }, [syncSelection])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const engine = new LeaferEngine({
      view,
      grid: { ...globalConfig.document, cols: 100, rows: 100, cellSize: 32 },
      viewport: { ...globalConfig.viewport, zoomMin: 0.1, zoomMax: 10 } as any,
      smooth: false
    })

    engine.onCameraChange = (state) => setZoom(Math.round(state.scale * 100))
    engineRef.current = engine

    const onUp = () => {
      const state = interactionRef.current
      if (state.tsDragging && state.dragKey) {
         const g = engine.getContentLayer().children?.find((c: any) => c.id === state.dragKey)
         if (g) posMapRef.current.set(state.dragKey, { x: g.x as number, y: g.y as number })
      }
      state.tilesDragging = false
      state.tsDragging = false
      state.dragKey = null
    }

    const onMove = (ev: MouseEvent) => {
      const state = interactionRef.current
      if (!state.tsDragging || !state.dragKey) return
      const g = engine.getContentLayer().children?.find((c: any) => c.id === state.dragKey)
      if (!g) return
      const s = engine.getCameraState().scale
      g.set({
        x: state.dragGroupStart.x + (ev.clientX - state.dragMouseStart.x) / s,
        y: state.dragGroupStart.y + (ev.clientY - state.dragMouseStart.y) / s,
      })
      syncSelectionRef.current()
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.code === "AltLeft" || e.code === "AltRight") {
        interactionRef.current.altDown = e.type === "keydown"
        engine.getContentLayer().children?.forEach((g: any) => {
           const il = (g as Group).children?.find(c => c.id?.startsWith("interact-"))
           if (il) (il as Rect).cursor = interactionRef.current.altDown ? "grab" : "crosshair"
        })
      }
    }

    window.addEventListener("mouseup", onUp)
    window.addEventListener("mousemove", onMove)
    window.addEventListener("keydown", onKey)
    window.addEventListener("keyup", onKey)

    return () => {
      window.removeEventListener("mouseup", onUp)
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("keyup", onKey)
      engine.destroy()
      engineRef.current = null
    }
  }, [])

  useEffect(() => { syncTilesets() }, [syncTilesets])
  useEffect(() => { syncSelection() }, [syncSelection])

  useEffect(() => {
    if (!tilesets.length || !engineRef.current) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    tilesets.forEach(ts => {
      const key = getTilesetKey(ts)
      const p = posMapRef.current.get(key) ?? { x: 0, y: 0 }
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x + ts.imageWidth)
      maxY = Math.max(maxY, p.y + ts.imageHeight)
    })
    engineRef.current.fitToRect(minX, minY, maxX, maxY)
  }, [tilesets, getTilesetKey])

  return { viewRef, zoom }
}
