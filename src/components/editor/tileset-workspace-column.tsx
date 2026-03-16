import type { Tileset } from "@/core/tilemap/tileset"
import { Button } from "@/components/ui/button"
import { useTilesetEngine } from "@/hooks/use-tileset-engine"

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

  const { viewRef, zoom } = useTilesetEngine({
    tilesets,
    getTilesetKey,
    onSelectTiles,
    selectedTileGids
  })

  const stamp = selectedTileGids.length > 1 ? `${selectedTileGids.length} Tiles` : ""

  return (
    <div className="flex min-w-0 flex-col gap-3 h-full overflow-y-auto p-2 select-none">
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
