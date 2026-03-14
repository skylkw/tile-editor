import { Button } from "@/components/ui/button"
import type { ChangeEvent } from "react"
import type { GridConfig } from "@/types/engine"
import { PanelCard } from "./panel-card"

type WorkspaceColumnProps = {
  mapPath: string
  isDirty: boolean
  revision: number
  loadingMapIO: boolean
  draftConfig: GridConfig
  mapMetrics: {
    cols: number
    rows: number
  }
  onImportMap: () => void
  onExportMap: () => void
  onApplyDocument: () => void
  onDraftChange: (key: keyof GridConfig, value: number) => void
}

function NumberField(props: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="space-y-2 text-xs text-slate-300">
      <span>{props.label}</span>
      <input
        type="number"
        min={1}
        value={props.value}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          props.onChange(Number(event.target.value))
        }
        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-300/60"
      />
    </label>
  )
}

export function WorkspaceColumn(props: WorkspaceColumnProps) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PanelCard
        title="File"
        description="导入导出 Tiled JSON，并显示当前工程的未保存状态。"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div
            className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${
              props.isDirty
                ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
                : "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
            }`}
          >
            {props.isDirty ? "Unsaved" : "Saved"}
          </div>
          <div className="flex gap-2">
            <Button
              onClick={props.onImportMap}
              disabled={props.loadingMapIO}
              variant="outline"
              className="rounded-full border-white/15 bg-transparent text-slate-200 hover:bg-white/10"
            >
              {props.loadingMapIO ? "处理中..." : "导入地图"}
            </Button>
            <Button
              onClick={props.onExportMap}
              disabled={props.loadingMapIO}
              className="rounded-full bg-emerald-300 px-4 text-slate-950 hover:bg-emerald-200 disabled:opacity-60"
            >
              导出地图
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
          {props.mapPath || "还没有打开地图文件"} · Revision {props.revision}
        </div>
      </PanelCard>

      <PanelCard
        title="Canvas"
        description="固定画布与有限网格。修改后会保留重叠区域内的数据。"
        action={
          <Button
            onClick={props.onApplyDocument}
            className="rounded-full bg-amber-400 px-4 text-slate-950 hover:bg-amber-300"
          >
            应用尺寸
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Cols"
            value={props.draftConfig.cols}
            onChange={(value) => props.onDraftChange("cols", value)}
          />
          <NumberField
            label="Rows"
            value={props.draftConfig.rows}
            onChange={(value) => props.onDraftChange("rows", value)}
          />
          <NumberField
            label="Cell Size"
            value={props.draftConfig.cellSize}
            onChange={(value) => props.onDraftChange("cellSize", value)}
          />
          <NumberField
            label="Major Every"
            value={props.draftConfig.majorLineEvery}
            onChange={(value) => props.onDraftChange("majorLineEvery", value)}
          />
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
          当前网格: {props.mapMetrics.cols} x {props.mapMetrics.rows} cells
        </div>
      </PanelCard>
    </div>
  )
}
