import { Button } from "@/components/ui/button"
import type { EditorLayerState } from "@/hooks/use-leafer-engine"
import { PanelCard } from "./panel-card"

type LayersColumnProps = {
  layers: EditorLayerState[]
  activeLayerId: string
  onSetActiveLayerId: (layerId: string) => void
  onAddLayer: () => void
  onRemoveLayer: (layerId: string) => void
  onMoveLayerUp: (layerId: string) => void
  onMoveLayerDown: (layerId: string) => void
  onRenameLayer: (layerId: string, name: string) => void
  onToggleLayerVisibility: (layerId: string) => void
}

export function LayersColumn(props: LayersColumnProps) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PanelCard
        title="Layers"
        description="当前绘制只会落到高亮活动层。图层顺序、显隐和名称都会参与导出。"
        action={
          <Button
            onClick={props.onAddLayer}
            className="rounded-full bg-cyan-300 px-4 text-slate-950 hover:bg-cyan-200"
          >
            新建图层
          </Button>
        }
      >
        <div className="space-y-3">
          {props.layers.map((layer, index) => {
            const isActive = layer.id === props.activeLayerId
            const isTopLayer = index === props.layers.length - 1
            const isBottomLayer = index === 0

            return (
              <div
                key={layer.id}
                className={`rounded-2xl border px-3 py-3 transition ${
                  isActive
                    ? "border-cyan-300/60 bg-cyan-300/10"
                    : "border-white/10 bg-slate-950/45"
                }`}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => props.onSetActiveLayerId(layer.id)}
                    className={`flex flex-1 items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                      isActive
                        ? "bg-cyan-300/15 text-white"
                        : "bg-white/5 text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    <span>{layer.name}</span>
                    <span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                      #{index + 1}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onMoveLayerUp(layer.id)}
                    disabled={isTopLayer}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    上移
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onMoveLayerDown(layer.id)}
                    disabled={isBottomLayer}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    下移
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => props.onToggleLayerVisibility(layer.id)}
                    className={`rounded-xl border px-3 py-2 text-xs transition ${
                      layer.visible
                        ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
                        : "border-white/10 bg-white/5 text-slate-400"
                    }`}
                  >
                    {layer.visible ? "可见" : "隐藏"}
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onRemoveLayer(layer.id)}
                    disabled={props.layers.length <= 1}
                    className="rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs text-rose-100 transition hover:bg-rose-300/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    删除
                  </button>
                </div>
                <input
                  type="text"
                  value={layer.name}
                  onChange={(event) => props.onRenameLayer(layer.id, event.target.value)}
                  className="mt-3 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-300/50"
                />
              </div>
            )
          })}
        </div>
      </PanelCard>

      <PanelCard
        title="Controls"
        description="连续绘制时，如果本次笔划里的 stamp 足迹发生重叠，预览会变色并阻止重复绘制。"
      >
        <div className="space-y-2 text-xs leading-6 text-slate-400">
          <p>Left Click / Drag: 在当前图层按无重叠规则连续绘制 stamp</p>
          <p>Right Click / Drag: 按同样规则擦除 stamp 足迹</p>
          <p>Middle Drag 或 Space + Left Drag: 平移画布</p>
          <p>Mouse Wheel: 以鼠标位置为中心缩放</p>
          <p>Tileset Preview Drag: 框选 tileset 区域并生成 stamp</p>
        </div>
      </PanelCard>
    </div>
  )
}
