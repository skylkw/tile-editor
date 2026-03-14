import { Button } from "@/components/ui/button"
import type { Tileset } from "@/core/tilemap/tileset"
import { PanelCard } from "./panel-card"

type TilesetLibraryColumnProps = {
  tilesets: Tileset[]
  activeTileset: Tileset | null
  loadingTileset: boolean
  filter: string
  onLoadTileset: () => void
  onSelectTileset: (key: string) => void
  onFilterChange: (value: string) => void
  getTilesetKey: (tileset: { sourcePath?: string; name: string }) => string
}

export function TilesetLibraryColumn(props: TilesetLibraryColumnProps) {
  return (
    <PanelCard
      title="Tilesets"
      description="管理当前工程里可用的图集资源，切换后右侧预览和 palette 会一起更新。"
      action={
        <Button
          onClick={props.onLoadTileset}
          disabled={props.loadingTileset}
          className="rounded-full bg-teal-300 px-4 text-slate-950 hover:bg-teal-200 disabled:opacity-60"
        >
          {props.loadingTileset ? "加载中..." : "导入图集"}
        </Button>
      }
    >
      <div className="mb-4 rounded-2xl border border-white/10 bg-slate-950/60 p-3">
        <label className="space-y-2 text-xs text-slate-300">
          <span>Palette Filter</span>
          <input
            type="text"
            value={props.filter}
            onChange={(event) => props.onFilterChange(event.target.value)}
            placeholder="按 gid / local / row / col 过滤"
            className="w-full rounded-2xl border border-white/10 bg-slate-950/90 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-300/60"
          />
        </label>
      </div>

      <div className="space-y-3">
        {props.tilesets.length ? (
          props.tilesets.map((entry, index) => {
            const entryKey = props.getTilesetKey(entry)
            const isActive =
              props.activeTileset &&
              entryKey === props.getTilesetKey(props.activeTileset)

            return (
              <button
                key={entryKey}
                type="button"
                onClick={() => props.onSelectTileset(entryKey)}
                className={`w-full rounded-2xl border p-3 text-left transition ${
                  isActive
                    ? "border-cyan-300/60 bg-cyan-300/10"
                    : "border-white/10 bg-slate-950/50 hover:bg-white/10"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {entry.name || `Tileset ${index + 1}`}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {entry.columns} x {entry.rows} · {entry.tileCount} tiles
                    </p>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    GID {entry.firstGid}-{entry.lastGid}
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                  {entry.sourcePath ?? "内存图集"}
                </p>
              </button>
            )
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/45 px-4 py-8 text-center text-sm text-slate-500">
            还没有导入 tileset
          </div>
        )}
      </div>
    </PanelCard>
  )
}
