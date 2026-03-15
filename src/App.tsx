import { open } from "@tauri-apps/plugin-dialog"
import { mkdir, readFile, readTextFile, writeTextFile, writeFile } from "@tauri-apps/plugin-fs"
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import config from "./config.json"
import type { GridConfig, ViewportConfig } from "@/types/engine"
import type { TiledMap } from "@/types/tiled"
import type { TilesetStamp } from "@/types/tilemap"
import { Tileset } from "./core/tilemap/tileset"
import {
  CanvasStageColumn,
  LayersColumn,
  WorkspaceColumn,
} from "./components/editor"
import { TilesetWorkspaceColumn } from "./components/editor/tileset-workspace-column"
import type {
  BrushTransformState,
  TilesetLoadSource,
} from "@/types/editor"
import {
  DEFAULT_BRUSH_TRANSFORM,
  getBrushTransformSummary,
  getDocumentConfigFromMap,
  getTilesetKey,
  isPositiveInteger,
  resetBrushTransform,
  resolveTilesetSourcePath,
  rotateBrushClockwise,
  rotateBrushCounterClockwise,
  toggleBrushHorizontalFlip,
  toggleBrushVerticalFlip,
  transformStamp,
  joinPath,
} from "./components/editor/utils"
import { useLeaferEngine } from "./hooks/use-leafer-engine"

// 移除 createObjectUrlFromPath 辅助函数，改为直接使用 convertFileSrc

export default function App() {
  const [documentConfig, setDocumentConfig] =
    useState<GridConfig>(config.document)
  const [draftConfig, setDraftConfig] = useState<GridConfig>(config.document)
  const [mapPath, setMapPath] = useState("")
  const [activeTilesetKey, setActiveTilesetKey] = useState("")
  const [selectedTileGids, setSelectedTileGids] = useState<number[]>([])
  const [selectedStamp, setSelectedStamp] = useState<TilesetStamp | null>(null)
  const [brushTransform, setBrushTransform] = useState<BrushTransformState>(
    DEFAULT_BRUSH_TRANSFORM
  )


  const [loadingTileset, setLoadingTileset] = useState(false)
  const [loadingMapIO, setLoadingMapIO] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [pendingImportedMap, setPendingImportedMap] = useState<TiledMap | null>(null)

  // blobUrlsRef 已移除，因为改用 convertFileSrc 直接加载本地资源
  // tilesetImageRef 用不到了，现在 TilesetPreviewColumn 内部由 Leafer 接管

  const transformedStamp = useMemo(
    () => transformStamp(selectedStamp, brushTransform),
    [brushTransform, selectedStamp]
  )

  const {
    viewRef,
    tilesets,
    mapMetrics,
    cameraState,
    hoverCell,
    revision,
    isDirty,
    layers,
    activeLayer,
    activeLayerId,
    setActiveLayerId,
    addLayer,
    removeLayer,
    moveLayerUp,
    moveLayerDown,
    renameLayer,
    toggleLayerVisibility,
    setTilesets,
    markSaved,
    clearActiveLayer,
    exportTiledMap,
    importTiledMap,
  } = useLeaferEngine({
    document: documentConfig,
    viewport: config.viewport as ViewportConfig,
    initialCamera: config.camera,
    activeStamp: transformedStamp,
  })

  const activeTileset = useMemo(() => {
    return (
      tilesets.find((entry) => getTilesetKey(entry) === activeTilesetKey) ??
      tilesets[0] ??
      null
    )
  }, [activeTilesetKey, tilesets])



  useEffect(() => {
    if (!activeTileset || !selectedTileGids.length) {
      setSelectedStamp(null)
      return
    }

    setSelectedStamp(activeTileset.createStamp(selectedTileGids))
  }, [activeTileset, selectedTileGids])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === config.shortcuts.cancelSelectionKey) {
        setSelectedTileGids([])
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const brushSummary = useMemo(
    () => getBrushTransformSummary(brushTransform),
    [brushTransform]
  )



  const activeTilesetSourcePath = activeTileset?.sourcePath ?? activeTileset?.name ?? ""



  const selectTiles = useCallback((gids: number[]) => {
    const next = Array.from(new Set(gids)).filter((gid) => gid > 0)
    setSelectedTileGids(next)
  }, [])

  const handleDraftChange = useCallback(
    (key: keyof GridConfig, value: number) => {
      setDraftConfig((current) => ({
        ...current,
        [key]: value,
      }))
    },
    []
  )

  const handleRotateBrushClockwise = useCallback(() => {
    setBrushTransform((current) => rotateBrushClockwise(current))
  }, [])

  const handleRotateBrushCounterClockwise = useCallback(() => {
    setBrushTransform((current) => rotateBrushCounterClockwise(current))
  }, [])

  const handleToggleBrushFlipX = useCallback(() => {
    setBrushTransform((current) => toggleBrushHorizontalFlip(current))
  }, [])

  const handleToggleBrushFlipY = useCallback(() => {
    setBrushTransform((current) => toggleBrushVerticalFlip(current))
  }, [])

  const handleResetBrushTransform = useCallback(() => {
    setBrushTransform(resetBrushTransform())
  }, [])

  const createTilesetsFromSources = useCallback(
    async (sources: TilesetLoadSource[]) => {
      return Promise.all(
        sources.map(async (source) => {
          return Tileset.fromUrl({
            name: source.name,
            image: source.path,
            sourcePath: source.path,
            firstGid: source.firstGid ?? 1,
            tileWidth: source.tileWidth,
            tileHeight: source.tileHeight,
            spacing: source.spacing ?? 0,
            margin: source.margin ?? 0,
          })
        })
      )
    },
    []
  )

  const applyLoadedTilesets = useCallback(
    (nextTilesets: Tileset[], preferredKey?: string) => {
      setTilesets(nextTilesets)

      const fallbackTileset = nextTilesets[0] ?? null
      const nextActiveTileset =
        nextTilesets.find((entry) => getTilesetKey(entry) === preferredKey) ??
        fallbackTileset

      setActiveTilesetKey(nextActiveTileset ? getTilesetKey(nextActiveTileset) : "")
      selectTiles(nextActiveTileset?.listTileGids().slice(0, 1) ?? [])
    },
    [selectTiles, setTilesets]
  )

  const clearTilesets = useCallback(() => {
    setTilesets([])
    setActiveTilesetKey("")
    setSelectedTileGids([])
    setSelectedStamp(null)

  }, [setTilesets])



  const handleLoadTilesets = useCallback(async () => {
    const fileSelection = await open({
      multiple: true,
      directory: false,
      filters: [
        {
          name: "Image",
          extensions: ["png", "jpg", "jpeg", "webp", "gif"],
        },
      ],
    })

    if (!fileSelection) return

    const files = Array.isArray(fileSelection) ? fileSelection : [fileSelection]
    if (!files.length) return

    try {
      setLoadingTileset(true)
      setErrorMessage("")

      let nextFirstGid = Math.max(0, ...tilesets.map((entry) => entry.lastGid)) + 1
      const nextTilesets = [...tilesets]
      let firstImportedKey = ""

      for (const [index, path] of files.entries()) {
        const nextTileset = await Tileset.fromUrl({
          name:
            files.length === 1 && !tilesets.length
              ? "Working Tileset"
              : `Tileset ${tilesets.length + index + 1}`,
          image: path,
          sourcePath: path,
          firstGid: nextFirstGid,
          tileWidth: documentConfig.cellSize,
          tileHeight: documentConfig.cellSize,
          margin: 0,
          spacing: 0,
        })

        nextTilesets.push(nextTileset)
        firstImportedKey ||= getTilesetKey(nextTileset)
        nextFirstGid = nextTileset.lastGid + 1
      }

      applyLoadedTilesets(nextTilesets, firstImportedKey)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "读取图集文件失败"
      )
    } finally {
      setLoadingTileset(false)
    }
  }, [
    applyLoadedTilesets,
    documentConfig.cellSize,
    tilesets,
  ])

  const handleApplyDocument = useCallback(async () => {
    const nextConfig: GridConfig = {
      ...draftConfig,
      cols: Number(draftConfig.cols),
      rows: Number(draftConfig.rows),
      cellSize: Number(draftConfig.cellSize),
      majorLineEvery: Number(draftConfig.majorLineEvery),
    }

    if (
      !isPositiveInteger(nextConfig.cols) ||
      !isPositiveInteger(nextConfig.rows) ||
      !isPositiveInteger(nextConfig.cellSize) ||
      !isPositiveInteger(nextConfig.majorLineEvery)
    ) {
      setErrorMessage("网格行列、单元大小和主网格间隔都必须是正整数")
      return
    }

    const shouldReloadTilesets =
      nextConfig.cellSize !== documentConfig.cellSize &&
      tilesets.some((entry) => entry.sourcePath)

    setErrorMessage("")

    if (shouldReloadTilesets) {
      setLoadingTileset(true)
    }

    setDocumentConfig(nextConfig)

    if (shouldReloadTilesets) {
      try {
        const sources = tilesets
          .filter((entry) => entry.sourcePath)
          .map((entry) => ({
            name: entry.name,
            path: entry.sourcePath as string,
            firstGid: entry.firstGid,
            tileWidth: nextConfig.cellSize,
            tileHeight: nextConfig.cellSize,
            spacing: entry.spacing,
            margin: entry.margin,
          }))

        const nextTilesets = await createTilesetsFromSources(sources)
        applyLoadedTilesets(nextTilesets, activeTilesetKey)
      } catch (error) {
        clearTilesets()
        setErrorMessage(
          error instanceof Error ? error.message : "重新加载 tileset 失败"
        )
      } finally {
        setLoadingTileset(false)
      }
    }
  }, [
    activeTilesetKey,
    applyLoadedTilesets,
    clearTilesets,
    createTilesetsFromSources,
    documentConfig.cellSize,
    draftConfig,
    tilesets,
  ])

  const handleExportMap = useCallback(async () => {
    try {
      setLoadingMapIO(true)
      setErrorMessage("")

      const draft = exportTiledMap()
      if (!draft) {
        setErrorMessage("当前没有可导出的地图数据")
        return
      }

      const selectedDir = await open({
        directory: true,
        multiple: false,
        title: "选择项目导出的目标文件夹",
      })

      if (!selectedDir || Array.isArray(selectedDir)) return

      // 以用户选择的文件夹直接作为项目根目录
      const projectDir = selectedDir
      const projectName = projectDir.split(/[\\/]/).pop() || "map"

      const targetMapPath = joinPath(projectDir, `${projectName}.tmj`)
      const assetsDir = joinPath(projectDir, "assets")
      const tilesetsDir = joinPath(assetsDir, "tilesets")

      // 显式逐级创建目录，防止静默失败
      try { await mkdir(projectDir, { recursive: true }) } catch (e) { alert(`创建目录失败: projectDir - ${String(e)}`) }
      try { await mkdir(assetsDir, { recursive: true }) } catch (e) { alert(`创建目录失败: assetsDir - ${String(e)}`) }
      try { await mkdir(tilesetsDir, { recursive: true }) } catch (e) { alert(`创建目录失败: tilesetsDir - ${String(e)}`) }

      // 复制图集文件并准备引用
      const tilesetRefs = []

      for (const ts of tilesets) {
        let finalImageRelative = ts.image

        if (ts.sourcePath) {
          const filename = ts.sourcePath.split(/[\\/]/).pop() || "tileset.png"
          const targetPath = joinPath(tilesetsDir, filename)

          try {
            const bytes = await readFile(ts.sourcePath)
            await writeFile(targetPath, bytes)
            finalImageRelative = `assets/tilesets/${filename}`
          } catch (e) {
            console.error("Failed to copy tileset image:", e)
            alert(`无法保存图片 ${filename}：${String(e)}`)
          }
        }

        const ref = ts.toTiledTilesetRef()
        ref.image = finalImageRelative
        tilesetRefs.push(ref)
      }

      const map = exportTiledMap({
        tilesets: tilesetRefs,
      })

      if (!map) return

      await writeTextFile(targetMapPath, JSON.stringify(map, null, 2))
      setMapPath(targetMapPath)
      markSaved()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "导出地图失败")
    } finally {
      setLoadingMapIO(false)
    }
  }, [exportTiledMap, mapPath, markSaved, tilesets])

  const handleImportMap = useCallback(async () => {
    if (isDirty && !window.confirm("当前有未保存修改，导入地图会覆盖当前状态，是否继续？")) {
      return
    }

    const file = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "Tiled Map",
          extensions: ["tmj", "json"],
        },
      ],
    })

    if (!file || Array.isArray(file)) return

    try {
      setLoadingMapIO(true)
      setErrorMessage("")

      const raw = await readTextFile(file)
      const parsed = JSON.parse(raw) as TiledMap
      const nextConfig = getDocumentConfigFromMap(parsed)

      if (!nextConfig) {
        setErrorMessage("当前只支持导入正方形 tile 的有限正交地图")
        return
      }

      setMapPath(file)
      setDocumentConfig(nextConfig)
      setDraftConfig(nextConfig)
      setPendingImportedMap(parsed)

      const tilesetSources = parsed.tilesets.reduce<TilesetLoadSource[]>(
        (result, tilesetRef, index) => {
          const nextTilesetPath = resolveTilesetSourcePath(file, tilesetRef)
          if (!nextTilesetPath) return result

          result.push({
            name: tilesetRef.name ?? `Tileset ${index + 1}`,
            path: nextTilesetPath,
            firstGid: tilesetRef.firstgid,
            tileWidth: tilesetRef.tilewidth ?? nextConfig.cellSize,
            tileHeight: tilesetRef.tileheight ?? nextConfig.cellSize,
            spacing: tilesetRef.spacing,
            margin: tilesetRef.margin,
          })

          return result
        },
        []
      )

      if (tilesetSources.length) {
        const nextTilesets = await createTilesetsFromSources(tilesetSources)
        applyLoadedTilesets(nextTilesets, getTilesetKey(nextTilesets[0]))
      } else {
        clearTilesets()
      }
    } catch (error) {
      setPendingImportedMap(null)
      setErrorMessage(error instanceof Error ? error.message : "导入地图失败")
    } finally {
      setLoadingMapIO(false)
    }
  }, [applyLoadedTilesets, clearTilesets, createTilesetsFromSources, isDirty])

  useEffect(() => {
    if (!pendingImportedMap) return

    const targetConfig = getDocumentConfigFromMap(pendingImportedMap)
    if (
      targetConfig &&
      (mapMetrics.cols !== targetConfig.cols ||
        mapMetrics.rows !== targetConfig.rows ||
        mapMetrics.cellSize !== targetConfig.cellSize)
    ) {
      return
    }

    importTiledMap(pendingImportedMap)
    markSaved()
    setPendingImportedMap(null)
  }, [
    importTiledMap,
    mapMetrics.cellSize,
    mapMetrics.height,
    mapMetrics.width,
    markSaved,
    pendingImportedMap,
  ])

  useEffect(() => {
    if (!isDirty) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [isDirty])


  const handleSelectTileset = useCallback(
    (key: string) => {
      const nextTileset = tilesets.find((entry) => getTilesetKey(entry) === key)
      setActiveTilesetKey(key)
      selectTiles(nextTileset?.listTileGids().slice(0, 1) ?? [])
    },
    [selectTiles, tilesets]
  )

  useEffect(() => {
    // URL 缓存清理逻辑已移除，因为不再使用 Blob URL
    return () => {}
  }, [])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_top,#17304f_0%,#0a1220_45%,#04070d_100%)] text-slate-100">
      <header className="border-b border-white/10 bg-black/20 px-6 py-5 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-amber-300/80">
              Tile Editor
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              Five-Column Finite Workspace
            </h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">
              固定画布、有限 tilemap、受控缩放和平移、多图层、多 tileset、stamp 旋转翻转与无重叠连续绘制现在放进同一套工作流里了。
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-300">
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
              Canvas {mapMetrics.width} x {mapMetrics.height}
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
              Grid {mapMetrics.cols} x {mapMetrics.rows}
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
              Zoom {(cameraState.scale * 100).toFixed(0)}%
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
              Layers {layers.length}
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
              Tilesets {tilesets.length}
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto p-4">
        <div className="flex w-[320px] shrink-0 flex-col gap-4 overflow-y-auto pr-1">
          <WorkspaceColumn
            mapPath={mapPath}
            isDirty={isDirty}
            revision={revision}
            loadingMapIO={loadingMapIO}
            draftConfig={draftConfig}
            mapMetrics={{ cols: mapMetrics.cols, rows: mapMetrics.rows }}
            onImportMap={handleImportMap}
            onExportMap={handleExportMap}
            onApplyDocument={handleApplyDocument}
            onDraftChange={handleDraftChange}
          />

          {errorMessage ? (
            <section className="rounded-[28px] border border-rose-300/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
              {errorMessage}
            </section>
          ) : null}
        </div>

        <div className="flex w-[320px] shrink-0 flex-col gap-4 overflow-y-auto pr-1">
          <TilesetWorkspaceColumn
            tilesets={tilesets}
            activeTileset={activeTileset}
            loadingTileset={loadingTileset}
            onLoadTileset={handleLoadTilesets}
            onSelectTileset={handleSelectTileset}
            getTilesetKey={getTilesetKey}
            sourcePath={activeTilesetSourcePath}
            selectedTileGids={selectedTileGids}
            onSelectTiles={selectTiles}
            brushSummary={brushSummary}
            onClearActiveLayer={clearActiveLayer}
            onRotateCW={handleRotateBrushClockwise}
            onRotateCCW={handleRotateBrushCounterClockwise}
            onFlipX={handleToggleBrushFlipX}
            onFlipY={handleToggleBrushFlipY}
            onResetTransform={handleResetBrushTransform}
          />
        </div>

        <div className="flex w-[320px] shrink-0 flex-col gap-4 overflow-y-auto pr-1">
          <LayersColumn
            layers={layers}
            activeLayerId={activeLayerId}
            onSetActiveLayerId={setActiveLayerId}
            onAddLayer={addLayer}
            onRemoveLayer={removeLayer}
            onMoveLayerUp={moveLayerUp}
            onMoveLayerDown={moveLayerDown}
            onRenameLayer={renameLayer}
            onToggleLayerVisibility={toggleLayerVisibility}
          />
        </div>

        <div className="min-w-[720px] flex-1">
          <CanvasStageColumn
            viewRef={viewRef}
            mapMetrics={mapMetrics}
            cameraScale={cameraState.scale}
            hoverCell={hoverCell}
            activeLayerName={activeLayer?.name ?? "-"}
            stampLabel={transformedStamp ? `${transformedStamp.width} x ${transformedStamp.height}` : "-"}
          />
        </div>
      </div>
    </div>
  )
}
