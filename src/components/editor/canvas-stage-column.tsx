import type { GridMetrics, GridCell } from "@/types/engine"
import type { RefObject } from "react"

type CanvasStageColumnProps = {
  viewRef: RefObject<HTMLDivElement | null>
  mapMetrics: GridMetrics
  cameraScale: number
  hoverCell: GridCell | null
  activeLayerName: string
  stampLabel: string
}

export function CanvasStageColumn(props: CanvasStageColumnProps) {
  const {
    viewRef,
    mapMetrics,
    cameraScale,
    hoverCell,
    activeLayerName,
    stampLabel,
  } = props

  return (
    <main className="relative h-full min-h-[640px] min-w-0 overflow-hidden rounded-[34px] border border-white/10 bg-slate-950/65 shadow-[0_40px_120px_rgba(0,0,0,0.45)] backdrop-blur-sm">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(21,41,66,0.65),rgba(4,8,15,0.95))]" />
      <div
        ref={viewRef}
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{ cursor: "crosshair" }}
      />

      <div className="pointer-events-none absolute left-6 top-6 flex flex-wrap gap-3">
        <div className="rounded-full border border-white/10 bg-black/35 px-4 py-2 text-xs text-slate-200 backdrop-blur-md">
          Canvas {mapMetrics.width} x {mapMetrics.height}px
        </div>
        <div className="rounded-full border border-white/10 bg-black/35 px-4 py-2 text-xs text-slate-200 backdrop-blur-md">
          Grid {mapMetrics.cols} x {mapMetrics.rows}
        </div>
        <div className="rounded-full border border-white/10 bg-black/35 px-4 py-2 text-xs text-slate-200 backdrop-blur-md">
          Zoom {(cameraScale * 100).toFixed(0)}%
        </div>
        <div className="rounded-full border border-white/10 bg-black/35 px-4 py-2 text-xs text-slate-200 backdrop-blur-md">
          Hover {hoverCell ? `${hoverCell.cellX}, ${hoverCell.cellY}` : "-"}
        </div>
        <div className="rounded-full border border-white/10 bg-black/35 px-4 py-2 text-xs text-slate-200 backdrop-blur-md">
          Layer {activeLayerName}
        </div>
        <div className="rounded-full border border-white/10 bg-black/35 px-4 py-2 text-xs text-slate-200 backdrop-blur-md">
          Stamp {stampLabel}
        </div>
      </div>
    </main>
  )
}
