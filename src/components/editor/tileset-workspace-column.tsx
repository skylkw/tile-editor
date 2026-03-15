import { App, Image, Rect, Path, PointerEvent as LP, Group, MoveEvent, ZoomEvent } from "leafer-ui"
import "@leafer-in/viewport"
import { useEffect, useRef, useState } from "react"
import type { Tileset } from "@/core/tilemap/tileset"
import globalConfig from "@/config.json"
import { Button } from "@/components/ui/button"

type Props = {
  tilesets: Tileset[]
  selectedTileGids: number[]
  onSelectTiles: (gids: number[]) => void
  getTilesetKey: (ts: { sourcePath?: string; name: string }) => string
  loadingTileset: boolean
  onLoadTileset: () => void
  brushSummary: string
  onClearActiveLayer: () => void
  onRotateCW: () => void
  onRotateCCW: () => void
  onFlipX: () => void
  onFlipY: () => void
  onResetTransform: () => void
}

export function TilesetWorkspaceColumn(props: Props) {
  const {
    tilesets, selectedTileGids, onSelectTiles, getTilesetKey,
    loadingTileset, onLoadTileset,
    brushSummary, onClearActiveLayer, onRotateCW, onRotateCCW, onFlipX, onFlipY, onResetTransform,
  } = props

  const viewRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<App | null>(null)
  const [zoom, setZoom] = useState(100)

  // Persistent positions per tileset key
  const posRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const selRectsRef = useRef<Map<string, Rect>>(new Map())
  const groupsRef = useRef<Map<string, Group>>(new Map())

  // Drag refs
  const tilesDragging = useRef(false)
  const tsDragging = useRef(false)
  const dragKey = useRef<string | null>(null)
  const dragTileset = useRef<Tileset | null>(null)
  const startGid = useRef<number | null>(null)
  const dragGroupStart = useRef({ x: 0, y: 0 })
  const dragMouseStart = useRef({ x: 0, y: 0 })
  const altDown = useRef(false)

  // Stable callback ref
  const cbRef = useRef(onSelectTiles)
  cbRef.current = onSelectTiles

  useEffect(() => {
    if (!viewRef.current) return
    appRef.current?.destroy()
    selRectsRef.current.clear()
    groupsRef.current.clear()
    if (!tilesets.length) { appRef.current = null; return }

    const app = new App({
      view: viewRef.current,
      tree: { type: "custom" },
      ground: { type: "design", hittable: false },
      zoom: { min: 0.05, max: 10 },
      smooth: false,
    })

    const GAP = 24
    let autoY = 0
    const keys = tilesets.map(ts => getTilesetKey(ts))

    // Auto-layout for new tilesets
    for (let i = 0; i < tilesets.length; i++) {
      if (!posRef.current.has(keys[i])) {
        posRef.current.set(keys[i], { x: 0, y: autoY })
      }
      autoY += tilesets[i].imageHeight + GAP
    }

    // Build Leafer nodes per tileset
    for (let i = 0; i < tilesets.length; i++) {
      const ts = tilesets[i], key = keys[i]
      const p = posRef.current.get(key)!
      const g = new Group({ x: p.x, y: p.y })

      // Image
      g.add(new Image({ url: ts.image, width: ts.imageWidth, height: ts.imageHeight }))

      // Grid
      if (ts.tileWidth >= 8) {
        const gp = new Path({ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 })
        let d = ""
        for (let c = 0; c <= ts.columns; c++) {
          const x = ts.margin + c * (ts.tileWidth + ts.spacing)
          d += `M ${x} ${ts.margin} L ${x} ${ts.margin + ts.rows * (ts.tileHeight + ts.spacing)} `
        }
        for (let r = 0; r <= ts.rows; r++) {
          const y = ts.margin + r * (ts.tileHeight + ts.spacing)
          d += `M ${ts.margin} ${y} L ${ts.margin + ts.columns * (ts.tileWidth + ts.spacing)} ${y} `
        }
        gp.path = d
        const gg = new Group({ opacity: 0.25 }); gg.add(gp); g.add(gg)
      }

      // Selection rect
      const sr = new Rect({
        x: 0, y: 0, width: 0, height: 0,
        fill: globalConfig.theme.stampPreviewTint.fill,
        stroke: globalConfig.theme.hoverOutline.stroke,
        strokeWidth: globalConfig.theme.hoverOutline.strokeWidth,
        visible: false, hittable: false,
      })
      g.add(sr)
      selRectsRef.current.set(key, sr)

      // Interaction layer
      const il = new Rect({
        x: 0, y: 0, width: ts.imageWidth, height: ts.imageHeight,
        fill: "transparent", cursor: "crosshair",
      })
      g.add(il)

      // Tile selection helpers
      const selectBetween = (gA: number, gB: number) => {
        const a = ts.getTileDescriptor(gA), b = ts.getTileDescriptor(gB)
        if (!a || !b) return
        const c0 = Math.min(a.column, b.column), c1 = Math.max(a.column, b.column)
        const r0 = Math.min(a.row, b.row), r1 = Math.max(a.row, b.row)
        const gids: number[] = []
        for (let r = r0; r <= r1; r++)
          for (let c = c0; c <= c1; c++)
            gids.push(ts.firstGid + r * ts.columns + c)
        cbRef.current(gids)
      }

      il.on(LP.DOWN, (e: LP) => {
        if (altDown.current) {
          // Start dragging tileset image
          tsDragging.current = true
          dragKey.current = key
          dragGroupStart.current = { x: g.x as number, y: g.y as number }
          // Capture clientX/Y from native event
          const ne = (e as unknown as { origin?: PointerEvent }).origin
          dragMouseStart.current = { x: ne?.clientX ?? 0, y: ne?.clientY ?? 0 }
          e.stop?.()
          return
        }
        // Tile selection
        tilesDragging.current = true
        dragTileset.current = ts
        const loc = il.getLocalPoint(e)
        const tile = ts.getTileAtImagePoint(loc.x, loc.y)
        startGid.current = tile ? tile.gid : null
        if (tile) cbRef.current([tile.gid])
      })

      il.on(LP.MOVE, (e: LP) => {
        if (!tilesDragging.current || dragTileset.current !== ts || startGid.current === null) return
        const loc = il.getLocalPoint(e)
        const tile = ts.getTileAtImagePoint(loc.x, loc.y)
        if (tile) selectBetween(startGid.current, tile.gid)
      })

      app.tree.add(g)
      groupsRef.current.set(key, g)
    }

    // Global pointer up (tile selection)
    app.on(LP.UP, () => {
      tilesDragging.current = false
      startGid.current = null
      dragTileset.current = null
    })

    // Tileset image dragging via window events
    const onWinMove = (ev: MouseEvent) => {
      if (!tsDragging.current || !dragKey.current) return
      const g = groupsRef.current.get(dragKey.current)
      if (!g) return
      const s = (app.tree.zoomLayer.scaleX as number) || 1
      g.set({
        x: dragGroupStart.current.x + (ev.clientX - dragMouseStart.current.x) / s,
        y: dragGroupStart.current.y + (ev.clientY - dragMouseStart.current.y) / s,
      })
    }
    const onWinUp = () => {
      if (tsDragging.current && dragKey.current) {
        const g = groupsRef.current.get(dragKey.current)
        if (g) posRef.current.set(dragKey.current, { x: g.x as number, y: g.y as number })
      }
      tsDragging.current = false
      dragKey.current = null
    }
    window.addEventListener("mousemove", onWinMove)
    window.addEventListener("mouseup", onWinUp)

    // Zoom / Pan
    app.tree.on(MoveEvent.BEFORE_MOVE, (e: MoveEvent) => {
      const { x, y } = app.tree.getValidMove(e.moveX, e.moveY)
      app.tree.zoomLayer.move(x, y)
    })
    app.tree.on(ZoomEvent.BEFORE_ZOOM, (e: ZoomEvent) => {
      const s = app.tree.getValidScale(e.scale)
      app.tree.zoomLayer.scaleOfWorld(e, s)
    })
    app.tree.on(ZoomEvent.ZOOM, () => setZoom(Math.round((app.tree.zoomLayer.scaleX as number) * 100)))

    // Fit to view
    setTimeout(() => {
      const r = viewRef.current?.getBoundingClientRect()
      if (!r) return
      let mw = 0, mh = 0
      for (const ts of tilesets) {
        const p = posRef.current.get(getTilesetKey(ts)) ?? { x: 0, y: 0 }
        mw = Math.max(mw, p.x + ts.imageWidth)
        mh = Math.max(mh, p.y + ts.imageHeight)
      }
      const s = Math.min((r.width - 32) / (mw || 1), (r.height - 32) / (mh || 1), 1)
      app.tree.zoomLayer.set({
        x: 16 + Math.max(0, (r.width - 32 - mw * s) / 2),
        y: 16 + Math.max(0, (r.height - 32 - mh * s) / 2),
        scaleX: s, scaleY: s,
      })
      setZoom(Math.round(s * 100))
    }, 50)

    // Alt key + cursor updates
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "AltLeft" || e.code === "AltRight") {
        altDown.current = e.type === "keydown"
        for (const g of groupsRef.current.values()) {
          const last = g.children?.[g.children.length - 1]
          if (last) (last as Rect).cursor = altDown.current ? "grab" : "crosshair"
        }
      }
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("keyup", onKey)

    appRef.current = app
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("keyup", onKey)
      window.removeEventListener("mousemove", onWinMove)
      window.removeEventListener("mouseup", onWinUp)
      app.destroy()
      appRef.current = null
    }
  }, [tilesets, getTilesetKey])

  // Sync selection highlight per tileset
  useEffect(() => {
    for (const r of selRectsRef.current.values()) r.visible = false
    if (!selectedTileGids.length) return
    for (const ts of tilesets) {
      const k = getTilesetKey(ts), r = selRectsRef.current.get(k)
      if (!r) continue
      const gids = selectedTileGids.filter(g => g >= ts.firstGid && g <= ts.lastGid)
      if (!gids.length) continue
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const gid of gids) {
        const d = ts.getTileDescriptor(gid)
        if (d) { x0 = Math.min(x0, d.x); y0 = Math.min(y0, d.y); x1 = Math.max(x1, d.x + d.width); y1 = Math.max(y1, d.y + d.height) }
      }
      if (x0 !== Infinity) r.set({ x: x0, y: y0, width: x1 - x0, height: y1 - y0, visible: true })
    }
  }, [tilesets, selectedTileGids, getTilesetKey])

  const stamp = selectedTileGids.length > 1 ? `${selectedTileGids.length} Tiles` : ""

  return (
    <div className="flex min-w-0 flex-col gap-3 h-full overflow-y-auto p-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[10px] text-slate-500 px-1">{tilesets.length ? `${tilesets.length} 图集` : "无图集"}</span>
        <Button onClick={onLoadTileset} disabled={loadingTileset} size="sm" className="h-7 text-[10px] rounded-lg px-3 bg-teal-400/90 text-slate-950 hover:bg-teal-300 shrink-0">导入</Button>
        <Button onClick={onClearActiveLayer} variant="outline" size="sm" className="h-7 text-[10px] rounded-lg px-2 border-white/10 text-slate-400 hover:text-white shrink-0">清空</Button>
      </div>

      <div className="flex-1 min-h-0 rounded-xl border border-white/10 bg-slate-950/70 p-1.5 flex flex-col">
        <div className="mb-1.5 flex items-center justify-between text-[10px] px-1">
          <span className="text-slate-500">{tilesets.length ? "Alt+拖移图集 | 左键选区 | 滚轮缩放" : "请导入图集"}</span>
          <span className="text-slate-500 bg-white/5 px-1.5 py-0.5 rounded text-[9px]">Z: {zoom}%</span>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden rounded-lg bg-slate-900 relative">
          <div ref={viewRef} className="absolute inset-0" />
          {stamp && (
            <div className="pointer-events-none absolute bottom-1.5 right-1.5 rounded border border-teal-300/30 bg-teal-300/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-teal-100 backdrop-blur">{stamp}</div>
          )}
        </div>
      </div>

      <div className="shrink-0 rounded-xl border border-cyan-300/10 bg-cyan-300/5 p-2.5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-200/80">Brush</span>
          <span className="text-[10px] text-cyan-100/50">{brushSummary}</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          <button type="button" onClick={onRotateCCW} className="rounded-lg border border-white/10 bg-slate-900/50 py-1 text-[10px] text-slate-300 hover:bg-slate-800" title="逆时针90°">↶</button>
          <button type="button" onClick={onRotateCW} className="rounded-lg border border-white/10 bg-slate-900/50 py-1 text-[10px] text-slate-300 hover:bg-slate-800" title="顺时针90°">↷</button>
          <button type="button" onClick={onFlipX} className="rounded-lg border border-white/10 bg-slate-900/50 py-1 text-[10px] text-slate-300 hover:bg-slate-800" title="左右翻转">⇔</button>
          <button type="button" onClick={onFlipY} className="rounded-lg border border-white/10 bg-slate-900/50 py-1 text-[10px] text-slate-300 hover:bg-slate-800" title="上下翻转">⇕</button>
        </div>
        {brushSummary !== "Identity" && (
          <button type="button" onClick={onResetTransform} className="mt-2 w-full rounded-lg border border-cyan-300/20 bg-cyan-300/10 py-1 text-[10px] text-cyan-100/80 hover:bg-cyan-300/20">重置</button>
        )}
      </div>
    </div>
  )
}
