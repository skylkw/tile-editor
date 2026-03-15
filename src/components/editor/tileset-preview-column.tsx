import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from "react"
import type { Tileset } from "@/core/tilemap/tileset"
import { PanelCard } from "./panel-card"

type TilesetPreviewColumnProps = {
  activeTileset: Tileset | null
  previewUrl: string
  sourcePath: string
  selectionStyle?: CSSProperties
  selectionLabel: string
  selectionHint: string
  zoom: number
  onZoomChange: (value: number) => void
  imageRef: RefObject<HTMLImageElement | null>
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void
}

export function TilesetPreviewColumn(props: TilesetPreviewColumnProps) {
  const {
    activeTileset,
    previewUrl,
    sourcePath,
    selectionStyle,
    selectionLabel,
    selectionHint,
    zoom,
    onZoomChange,
    imageRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  } = props

  return (
    <PanelCard
      title="Tileset Preview"
      description="拖动框选图集区域来生成 stamp。缩放只影响预览，不影响实际 tile 尺寸。"
    >
      {activeTileset && previewUrl ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">Selection</p>
                <p className="text-xs text-slate-400">{selectionHint}</p>
              </div>
              <div className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-amber-100">
                {selectionLabel}
              </div>
            </div>
            <label className="space-y-2 text-xs text-slate-300">
              <span>Preview Zoom {zoom}%</span>
              <input
                type="range"
                min={50}
                max={300}
                step={10}
                value={zoom}
                onChange={(event) => onZoomChange(Number(event.target.value))}
                className="w-full accent-cyan-300"
              />
            </label>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70">
            <div className="border-b border-white/10 px-3 py-2 text-[11px] text-slate-400">
              {sourcePath}
            </div>
            <div className="max-h-[440px] overflow-auto p-3">
              <div
                className="relative inline-block touch-none rounded-xl"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
              >
                <img
                  ref={imageRef}
                  src={previewUrl}
                  alt="Current tileset"
                  className="block rounded-xl bg-[linear-gradient(135deg,#0b1220,#10192d)] [image-rendering:pixelated]"
                  style={{ width: `${zoom}%`, maxWidth: "none" }}
                />
                {selectionStyle ? (
                  <div
                    className="pointer-events-none absolute rounded-md border border-amber-300 bg-amber-300/15 shadow-[0_0_0_1px_rgba(252,211,77,0.35)]"
                    style={selectionStyle}
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs text-slate-400">
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2">
              Tile Count: {activeTileset.tileCount}
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2">
              Atlas: {activeTileset.columns} x {activeTileset.rows}
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2">
              GID Range: {activeTileset.firstGid}-{activeTileset.lastGid}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/45 px-4 py-8 text-center text-sm text-slate-500">
          先导入并选择一个 tileset
        </div>
      )}
    </PanelCard>
  )
}
