import { Button } from "@/components/ui/button"
import type { TilesetTileDescriptor } from "@/core/tilemap/tileset"
import { PanelCard } from "./panel-card"

type StampPreviewGrid = {
  width: number
  height: number
  cells: Array<{
    key: string
    gid: number
    url: string | null
  } | null>
}

type BrushWorkspaceColumnProps = {
  selectedTile: TilesetTileDescriptor | null
  selectedTileGids: number[]
  transformedStampSize: string
  brushSummary: string
  tileButtons: TilesetTileDescriptor[]
  selectedTileSet: Set<number>
  activeGid: number
  stampPreviewGrid: StampPreviewGrid | null
  getTilePreviewUrl: (gid: number) => string | null
  onSelectTile: (gid: number) => void
  onClearActiveLayer: () => void
  onRotateCW: () => void
  onRotateCCW: () => void
  onFlipX: () => void
  onFlipY: () => void
  onResetTransform: () => void
}

export function BrushWorkspaceColumn(props: BrushWorkspaceColumnProps) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PanelCard
        title="Brush"
        description="翻转和旋转会同时作用到 tile 图像与 stamp 布局，画布预览会与实际落点保持一致。"
        action={
          <Button
            onClick={props.onClearActiveLayer}
            variant="outline"
            className="rounded-full border-white/15 bg-transparent text-slate-200 hover:bg-white/10"
          >
            清空当前层
          </Button>
        }
      >
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={props.onRotateCCW}
            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          >
            逆时针 90
          </button>
          <button
            type="button"
            onClick={props.onRotateCW}
            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          >
            顺时针 90
          </button>
          <button
            type="button"
            onClick={props.onFlipX}
            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          >
            Flip X
          </button>
          <button
            type="button"
            onClick={props.onFlipY}
            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          >
            Flip Y
          </button>
        </div>

        <div className="mb-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-100/90">
            Active Transform
          </p>
          <p className="mt-2 text-sm text-white">{props.brushSummary}</p>
          <p className="mt-1 text-xs text-slate-300">
            Stamp {props.transformedStampSize}
          </p>
          <button
            type="button"
            onClick={props.onResetTransform}
            className="mt-3 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
          >
            重置变换
          </button>
        </div>

        {props.stampPreviewGrid ? (
          <div className="mb-4 rounded-2xl border border-white/10 bg-slate-950/50 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">Stamp Preview</p>
                <p className="text-xs text-slate-400">
                  当前会按这个布局连续绘制，避免旋转后位置判断不直观。
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                {props.stampPreviewGrid.width} x {props.stampPreviewGrid.height}
              </div>
            </div>
            <div className="overflow-auto rounded-2xl border border-white/10 bg-slate-950/80 p-3">
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(${props.stampPreviewGrid.width}, minmax(0, 48px))`,
                }}
              >
                {props.stampPreviewGrid.cells.map((cell, index) => (
                  <div
                    key={cell?.key ?? `empty-${index}`}
                    className="flex size-12 items-center justify-center rounded-xl border border-white/5 bg-slate-900/80"
                  >
                    {cell ? (
                      <span
                        className="size-10 rounded-lg bg-slate-950 bg-center bg-no-repeat [image-rendering:pixelated]"
                        style={{
                          backgroundImage: cell.url ? `url(${cell.url})` : undefined,
                          backgroundSize: "contain",
                        }}
                        title={`Tile ${cell.gid}`}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {props.selectedTile ? (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-3">
            <div
              className="size-16 rounded-xl border border-white/15 bg-slate-950 bg-center bg-no-repeat [image-rendering:pixelated]"
              style={{
                backgroundImage: props.getTilePreviewUrl(props.selectedTile.gid)
                  ? `url(${props.getTilePreviewUrl(props.selectedTile.gid)})`
                  : undefined,
                backgroundSize: "contain",
              }}
            />
            <div>
              <p className="text-sm font-medium text-white">
                Tile #{props.selectedTile.gid}
                {props.selectedTileGids.length > 1
                  ? ` +${props.selectedTileGids.length - 1}`
                  : ""}
              </p>
              <p className="text-xs text-slate-300">
                Local ID {props.selectedTile.localId} · Column {props.selectedTile.column + 1} · Row {props.selectedTile.row + 1}
              </p>
              <p className="text-xs text-slate-400">{props.brushSummary}</p>
            </div>
          </div>
        ) : (
          <div className="mb-4 rounded-2xl border border-dashed border-white/15 bg-slate-950/45 px-4 py-5 text-sm text-slate-500">
            先导入 tileset，再选择要绘制的 tile 或框选一个 stamp。
          </div>
        )}

        <div className="grid max-h-[420px] grid-cols-5 gap-2 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/45 p-2">
          {props.tileButtons.length ? (
            props.tileButtons.map((tile) => {
              const isActive = tile.gid === props.activeGid
              const isSelected = props.selectedTileSet.has(tile.gid)
              const previewUrl = props.getTilePreviewUrl(tile.gid)

              return (
                <button
                  key={tile.gid}
                  type="button"
                  onClick={() => props.onSelectTile(tile.gid)}
                  className={`group flex aspect-square items-center justify-center rounded-2xl border transition ${
                    isActive
                      ? "border-cyan-300 bg-cyan-300/15 shadow-[0_0_0_1px_rgba(103,232,249,0.35)]"
                      : isSelected
                        ? "border-amber-300 bg-amber-300/15 shadow-[0_0_0_1px_rgba(252,211,77,0.3)]"
                        : "border-white/8 bg-slate-900/80 hover:border-teal-300/50 hover:bg-slate-800/80"
                  }`}
                  title={`Tile ${tile.gid}`}
                >
                  <span
                    className="size-10 rounded-lg bg-slate-950 bg-center bg-no-repeat [image-rendering:pixelated]"
                    style={{
                      backgroundImage: previewUrl ? `url(${previewUrl})` : undefined,
                      backgroundSize: "contain",
                    }}
                  />
                </button>
              )
            })
          ) : (
            <div className="col-span-5 flex min-h-28 items-center justify-center text-sm text-slate-500">
              这里会显示当前 tileset 过滤后的 tile 列表
            </div>
          )}
        </div>
      </PanelCard>
    </div>
  )
}
