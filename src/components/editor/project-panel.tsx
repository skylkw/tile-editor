import { Button } from "@/components/ui/button"
import type { ChangeEvent } from "react"
import type { GridConfig } from "@/types/engine"
import { PanelCard } from "./panel-card"
import { LayersColumn } from "./layers-column"
import type { EditorLayerState } from "@/hooks/use-leafer-engine"

type ProjectPanelProps = {
  // Canvas Config
  draftConfig: GridConfig
  mapMetrics: {
    cols: number
    rows: number
  }
  onApplyDocument: () => void
  onDraftChange: (key: keyof GridConfig, value: number) => void

  // Layers Config
  layers: EditorLayerState[]
  activeLayerId: string
  onSetActiveLayerId: (id: string) => void
  onAddLayer: () => void
  onRemoveLayer: (id: string) => void
  onDuplicateLayer: (id: string) => void
  onReorderLayers: (ids: string[]) => void
  onRenameLayer: (id: string, name: string) => void
  onToggleLayerVisibility: (id: string) => void
}

function NumberField(props: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="space-y-1.5 text-[10px] text-slate-400">
      <span>{props.label}</span>
      <input
        type="number"
        min={1}
        value={props.value}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          props.onChange(Number(event.target.value))
        }
        className="w-full rounded-xl border border-white/5 bg-slate-950/40 px-2.5 py-1.5 text-xs text-white outline-none transition focus:border-amber-400/50"
      />
    </label>
  )
}

export function ProjectPanel(props: ProjectPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Canvas Section */}
      <PanelCard
        title="Canvas"
        description="管理网格尺寸与基础配置。"
        action={
          <Button
            size="sm"
            onClick={props.onApplyDocument}
            className="h-7 rounded-full bg-amber-400/90 px-3 text-[10px] text-slate-950 hover:bg-amber-300"
          >
            应用
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-x-2 gap-y-3">
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
        <div className="mt-3 text-[10px] text-slate-500 bg-white/5 px-2 py-1 rounded-lg">
          当前: {props.mapMetrics.cols} x {props.mapMetrics.rows}
        </div>
      </PanelCard>

      {/* Layers Section */}
      <LayersColumn
        layers={props.layers}
        activeLayerId={props.activeLayerId}
        onSetActiveLayerId={props.onSetActiveLayerId}
        onAddLayer={props.onAddLayer}
        onRemoveLayer={props.onRemoveLayer}
        onDuplicateLayer={props.onDuplicateLayer}
        onReorderLayers={props.onReorderLayers}
        onRenameLayer={props.onRenameLayer}
        onToggleLayerVisibility={props.onToggleLayerVisibility}
      />
    </div>
  )
}
