import { App, Image, Rect, Path, PointerEvent as LeaferPointerEvent, Group, MoveEvent, ZoomEvent } from "leafer-ui"
import "@leafer-in/viewport"
import { useEffect, useRef, useState } from "react"
import type { Tileset } from "@/core/tilemap/tileset"
import { PanelCard } from "./panel-card"
import globalConfig from "@/config.json"
import { Button } from "@/components/ui/button"

type TilesetWorkspaceColumnProps = {
  // Library Props
  tilesets: Tileset[]
  activeTileset: Tileset | null
  loadingTileset: boolean
  onLoadTileset: () => void
  onSelectTileset: (key: string) => void
  getTilesetKey: (tileset: { sourcePath?: string; name: string }) => string
  
  // Preview Props
  sourcePath: string
  selectedTileGids: number[]
  onSelectTiles: (gids: number[]) => void

  // Brush Props
  brushSummary: string
  onClearActiveLayer: () => void
  onRotateCW: () => void
  onRotateCCW: () => void
  onFlipX: () => void
  onFlipY: () => void
  onResetTransform: () => void
}

export function TilesetWorkspaceColumn(props: TilesetWorkspaceColumnProps) {
  const { 
    activeTileset, sourcePath, selectedTileGids, onSelectTiles,
    tilesets, loadingTileset, onLoadTileset, onSelectTileset, getTilesetKey,
    brushSummary, onClearActiveLayer, onRotateCW, onRotateCCW, onFlipX, onFlipY, onResetTransform
  } = props

  const viewRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<App | null>(null)
  const selectionRectRef = useRef<Rect | null>(null)
  
  const [zoom, setZoom] = useState(100)
  
  // Custom drag selection states
  const isDraggingRef = useRef(false)
  const startGidRef = useRef<number | null>(null)

  useEffect(() => {
    if (!viewRef.current || !activeTileset) return

    const app = new App({
      view: viewRef.current,
      tree: { type: "custom" },
      ground: { type: "design", hittable: false },
      zoom: { min: 0.1, max: 10 },
      smooth: false,
    })

    const { tileWidth, tileHeight, margin, spacing, columns, rows, firstGid } = activeTileset

    const img = new Image({
      url: activeTileset.image,
      x: 0,
      y: 0,
      width: activeTileset.imageWidth,
      height: activeTileset.imageHeight,
    })

    const gridGroup = new Group({ x: 0, y: 0, opacity: 0.3 })
    const gridPath = new Path({
      stroke: "rgba(255, 255, 255, 0.4)",
      strokeWidth: 1,
      x: 0,
      y: 0,
    })
    
    let pathData = ""
    for (let c = 0; c <= columns; c++) {
      const x = margin + c * (tileWidth + spacing)
      pathData += `M ${x} ${margin} L ${x} ${margin + rows * (tileHeight + spacing)} `
    }
    for (let r = 0; r <= rows; r++) {
      const y = margin + r * (tileHeight + spacing)
      pathData += `M ${margin} ${y} L ${margin + columns * (tileWidth + spacing)} ${y} `
    }
    gridPath.path = pathData
    gridGroup.add(gridPath)

    const selectionRect = new Rect({
      x: 0, y: 0, width: 0, height: 0,
      fill: globalConfig.theme.stampPreviewTint.fill,
      stroke: globalConfig.theme.hoverOutline.stroke,
      strokeWidth: globalConfig.theme.hoverOutline.strokeWidth,
      cornerRadius: globalConfig.theme.hoverOutline.cornerRadius,
      visible: false,
      hittable: false
    })
    selectionRectRef.current = selectionRect

    const interactionLayer = new Rect({
      x: 0, y: 0, 
      width: activeTileset.imageWidth, 
      height: activeTileset.imageHeight,
      fill: "transparent",
      cursor: "crosshair",
    })

    app.tree.add(img)
    if (tileWidth >= 8) app.tree.add(gridGroup)
    app.tree.add(selectionRect)
    app.tree.add(interactionLayer)
    
    app.tree.on(MoveEvent.BEFORE_MOVE, (e: MoveEvent) => {
      const { x, y } = app.tree.getValidMove(e.moveX, e.moveY)
      app.tree.zoomLayer.move(x, y)
    })
    app.tree.on(ZoomEvent.BEFORE_ZOOM, (e: ZoomEvent) => {
      const scale = app.tree.getValidScale(e.scale)
      app.tree.zoomLayer.scaleOfWorld(e, scale)
    })
    app.tree.on(ZoomEvent.ZOOM, () => {
       setZoom(Math.round(app.tree.zoomLayer.scaleX as number * 100))
    })

    setTimeout(() => {
      const rect = viewRef.current?.getBoundingClientRect()
      if (!rect) return
      const scale = Math.min(
        (rect.width - 32) / (activeTileset.imageWidth || 1),
        (rect.height - 32) / (activeTileset.imageHeight || 1),
        1
      )
      const x = 16 + Math.max(0, (rect.width - 32 - activeTileset.imageWidth * scale) / 2)
      const y = 16 + Math.max(0, (rect.height - 32 - activeTileset.imageHeight * scale) / 2)
      app.tree.zoomLayer.set({ x, y, scaleX: scale, scaleY: scale })
      setZoom(Math.round(scale * 100))
    }, 10)

    let spacePressed = false;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === globalConfig.shortcuts.panKey) spacePressed = e.type === "keydown"
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("keyup", onKey)

    const getGidAt = (localX: number, localY: number) => {
      const tile = activeTileset.getTileAtImagePoint(localX, localY)
      return tile ? tile.gid : null
    }

    const selectTilesBetween = (gidA: number, gidB: number) => {
      const tileA = activeTileset.getTileDescriptor(gidA)
      const tileB = activeTileset.getTileDescriptor(gidB)
      if (!tileA || !tileB) return

      const minCol = Math.min(tileA.column, tileB.column)
      const maxCol = Math.max(tileA.column, tileB.column)
      const minRow = Math.min(tileA.row, tileB.row)
      const maxRow = Math.max(tileA.row, tileB.row)

      const gids: number[] = []
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const index = r * columns + c
          gids.push(firstGid + index)
        }
      }
      onSelectTiles(gids)
    }

    interactionLayer.on(LeaferPointerEvent.DOWN, (e: LeaferPointerEvent) => {
      if (spacePressed) return
      isDraggingRef.current = true
      
      // Use local point relative to interactionLayer (image coordinates)
      const local = interactionLayer.getLocalPoint(e)
      startGidRef.current = getGidAt(local.x, local.y)
      
      if (startGidRef.current !== null) {
        onSelectTiles([startGidRef.current])
      }
    })

    interactionLayer.on(LeaferPointerEvent.MOVE, (e: LeaferPointerEvent) => {
      if (!isDraggingRef.current || spacePressed || startGidRef.current === null) return
      
      const local = interactionLayer.getLocalPoint(e)
      const currentGid = getGidAt(local.x, local.y)
      
      if (currentGid !== null) {
        selectTilesBetween(startGidRef.current, currentGid)
      }
    })

    const onPointerUp = () => {
      isDraggingRef.current = false
      startGidRef.current = null
    }
    app.on(LeaferPointerEvent.UP, onPointerUp)

    appRef.current = app

    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("keyup", onKey)
      app.destroy()
      appRef.current = null
    }
  }, [activeTileset, onSelectTiles])

  // Sync selection rect visually
  useEffect(() => {
    if (!activeTileset || !selectionRectRef.current) return
    const rectNode = selectionRectRef.current
    if (!selectedTileGids.length) {
      rectNode.visible = false
      return
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const gid of selectedTileGids) {
      const r = activeTileset.getTileDescriptor(gid) // Fixed: using getTileDescriptor!
      if (r) {
        minX = Math.min(minX, r.x)
        minY = Math.min(minY, r.y)
        maxX = Math.max(maxX, r.x + r.width)
        maxY = Math.max(maxY, r.y + r.height)
      }
    }

    if (minX !== Infinity) {
      rectNode.set({
        x: minX, y: minY,
        width: maxX - minX,
        height: maxY - minY,
        visible: true
      })
    } else {
      rectNode.visible = false
    }
  }, [activeTileset, selectedTileGids])

  const stampString = selectedTileGids.length > 1 ? `${selectedTileGids.length} Tiles Stamp` : ""

  return (
    <div className="flex w-[320px] shrink-0 flex-col gap-4 pr-1 h-full">
      <PanelCard
        title="Tileset Tools"
        description="选择图集与需要绘制的 Tiles，并可随时调整笔刷的旋转翻转。"
        action={
          <div className="flex gap-2">
            <Button
              onClick={onClearActiveLayer}
              variant="outline"
              size="sm"
              className="h-7 text-[10px] rounded-full px-3 border-white/10 text-slate-300 hover:text-white"
            >
              清空本层
            </Button>
            <Button
              onClick={onLoadTileset}
              disabled={loadingTileset}
              size="sm"
              className="h-7 text-[10px] rounded-full px-3 bg-teal-300 text-slate-950 hover:bg-teal-200"
            >
              导入
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {/* Tileset Selector */}
          {tilesets.length > 0 ? (
            <select
              title="Select Active Tileset"
              value={activeTileset ? getTilesetKey(activeTileset) : ""}
              onChange={(e) => onSelectTileset(e.target.value)}
              className="w-full appearance-none rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none focus:border-teal-300/50"
            >
              <option disabled value="">请选择 Tileset...</option>
              {tilesets.map((ts, i) => (
                <option key={getTilesetKey(ts)} value={getTilesetKey(ts)}>
                  {ts.name || `Tileset ${i + 1}`} ({ts.columns}x{ts.rows})
                </option>
              ))}
            </select>
          ) : (
             <div className="rounded-xl border border-dashed border-white/15 bg-slate-950/45 px-3 py-3 text-center text-xs text-slate-500">
                请先导入图集
             </div>
          )}

          {/* Tileset Leafer Preview */}
          {activeTileset ? (
            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-2 shadow-inner">
               <div className="mb-2 flex items-center justify-between text-[11px] px-1">
                 <span className="text-slate-400 truncate max-w-[150px]" title={sourcePath}>{sourcePath}</span>
                 <span className="text-slate-500 bg-white/5 px-1.5 py-0.5 rounded">Z: {zoom}%</span>
               </div>
               <div className="overflow-hidden rounded-xl bg-slate-900 relative aspect-square w-full">
                  <div ref={viewRef} className="absolute inset-0" />
                  {stampString && (
                     <div className="pointer-events-none absolute bottom-2 right-2 rounded border border-teal-300/30 bg-teal-300/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-100 backdrop-blur shadow-sm">
                       {stampString}
                     </div>
                  )}
               </div>
               <div className="mt-2 text-center text-[10px] text-slate-500">
                  左键拖动选择，空格拖拽平移，滚轮缩放
               </div>
            </div>
          ) : null}

          {/* Brush UI */}
          <div className="rounded-2xl border border-cyan-300/10 bg-cyan-300/5 p-3 mt-1">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-cyan-200">Brush Transform</span>
              <span className="text-[11px] text-cyan-100/70">{brushSummary}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onRotateCCW}
                className="rounded-xl border border-white/10 bg-slate-900/50 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                逆时针 90°
              </button>
              <button
                type="button"
                onClick={onRotateCW}
                className="rounded-xl border border-white/10 bg-slate-900/50 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                顺时针 90°
              </button>
              <button
                type="button"
                onClick={onFlipX}
                className="rounded-xl border border-white/10 bg-slate-900/50 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                左右翻转
              </button>
              <button
                type="button"
                onClick={onFlipY}
                className="rounded-xl border border-white/10 bg-slate-900/50 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                上下翻转
              </button>
            </div>
            
            {brushSummary !== "Identity" && (
              <button
                type="button"
                onClick={onResetTransform}
                className="mt-3 w-full rounded-xl border border-cyan-300/30 bg-cyan-300/10 py-1.5 text-[11px] text-cyan-100/90 transition hover:bg-cyan-300/20"
              >
                重置
              </button>
            )}
          </div>

        </div>
      </PanelCard>
    </div>
  )
}
