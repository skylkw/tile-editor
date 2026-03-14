import { open, save } from "@tauri-apps/plugin-dialog"
import { readFile, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import type { TiledMap } from "./core/tilemap/tiled-types"
import type { TilesetStamp, TilesetTileDescriptor } from "./core/tilemap/tileset"
import { Tileset } from "./core/tilemap/tileset"
import {
  BrushWorkspaceColumn,
  CanvasStageColumn,
  LayersColumn,
  TilesetLibraryColumn,
  TilesetPreviewColumn,
  WorkspaceColumn,
} from "./features/editor/components"
import type {
  BrushTransformState,
  DocumentSettings,
  ImageBounds,
  TilesetLoadSource,
} from "./features/editor/types"
import {
  DEFAULT_BRUSH_TRANSFORM,
  DEFAULT_DOCUMENT,
  clamp,
  getBoundsFromTiles,
  getBrushTransformSummary,
  getDocumentConfigFromMap,
  getMimeTypeFromPath,
  getTilesetKey,
  isPositiveInteger,
  resetBrushTransform,
  resolveTilesetSourcePath,
  rotateBrushClockwise,
  rotateBrushCounterClockwise,
  toggleBrushHorizontalFlip,
  toggleBrushVerticalFlip,
  transformBrushGid,
  transformStamp,
} from "./features/editor/utils"
import { useLeaferEngine } from "./hooks/use-leafer-engine"

async function createObjectUrlFromPath(path: string) {
  const bytes = await readFile(path)
  const blob = new Blob([bytes], { type: getMimeTypeFromPath(path) })
  return URL.createObjectURL(blob)
}

export default function App() {
  const [documentConfig, setDocumentConfig] =
    useState<DocumentSettings>(DEFAULT_DOCUMENT)
  const [draftConfig, setDraftConfig] = useState<DocumentSettings>(DEFAULT_DOCUMENT)
  const [mapPath, setMapPath] = useState("")
  const [activeTilesetKey, setActiveTilesetKey] = useState("")
  const [activeGid, setActiveGid] = useState(1)
  const [selectedTileGids, setSelectedTileGids] = useState<number[]>([])
  const [selectedStamp, setSelectedStamp] = useState<TilesetStamp | null>(null)
  const [brushTransform, setBrushTransform] = useState<BrushTransformState>(
    DEFAULT_BRUSH_TRANSFORM
  )
  const [tilesetZoom, setTilesetZoom] = useState(100)
  const [tilesetFilter, setTilesetFilter] = useState("")
  const [loadingTileset, setLoadingTileset] = useState(false)
  const [loadingMapIO, setLoadingMapIO] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [dragSelectionBounds, setDragSelectionBounds] =
    useState<ImageBounds | null>(null)
  const [pendingImportedMap, setPendingImportedMap] = useState<TiledMap | null>(null)

  const blobUrlsRef = useRef<Map<string, string>>(new Map())
  const tilesetImageRef = useRef<HTMLImageElement | null>(null)
  const dragStartPointRef = useRef<{ x: number; y: number } | null>(null)

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
    activeStamp: transformedStamp,
  })

  const activeTileset = useMemo(() => {
    return (
      tilesets.find((entry) => getTilesetKey(entry) === activeTilesetKey) ??
      tilesets[0] ??
      null
    )
  }, [activeTilesetKey, tilesets])

  const selectedTileSet = useMemo(
    () => new Set(selectedTileGids),
    [selectedTileGids]
  )

  const selectedTile = useMemo(
    () => activeTileset?.getTileDescriptor(activeGid) ?? null,
    [activeGid, activeTileset]
  )

  const selectedTilesBounds = useMemo(() => {
    if (!activeTileset || !selectedTileGids.length) return null

    const tiles = selectedTileGids
      .map((gid) => activeTileset.getTileDescriptor(gid))
      .filter((tile): tile is TilesetTileDescriptor => tile !== null)

    return getBoundsFromTiles(tiles)
  }, [activeTileset, selectedTileGids])

  useEffect(() => {
    if (!activeTileset || !selectedTileGids.length) {
      setSelectedStamp(null)
      return
    }

    setSelectedStamp(activeTileset.createStamp(selectedTileGids))
  }, [activeTileset, selectedTileGids])

  const brushSummary = useMemo(
    () => getBrushTransformSummary(brushTransform),
    [brushTransform]
  )

  const previewSelectionBounds = dragSelectionBounds ?? selectedTilesBounds

  const previewSelectionStyle = useMemo(() => {
    if (!activeTileset || !previewSelectionBounds) return undefined

    return {
      left: `${(previewSelectionBounds.x / activeTileset.imageWidth) * 100}%`,
      top: `${(previewSelectionBounds.y / activeTileset.imageHeight) * 100}%`,
      width: `${(previewSelectionBounds.width / activeTileset.imageWidth) * 100}%`,
      height: `${(previewSelectionBounds.height / activeTileset.imageHeight) * 100}%`,
    }
  }, [activeTileset, previewSelectionBounds])

  const tileButtons = useMemo(() => {
    if (!activeTileset) return []

    const query = tilesetFilter.trim().toLowerCase()
    const allTiles = activeTileset.listTiles()
    if (!query) return allTiles

    return allTiles.filter((tile) => {
      const tokens = [
        String(tile.gid),
        String(tile.localId),
        String(tile.column + 1),
        String(tile.row + 1),
      ]

      return tokens.some((token) => token.includes(query))
    })
  }, [activeTileset, tilesetFilter])

  const transformedStampSize = transformedStamp
    ? `${transformedStamp.width} x ${transformedStamp.height}`
    : "0 x 0"

  const selectionLabel = transformedStamp
    ? `${transformedStamp.width} x ${transformedStamp.height} Stamp`
    : selectedTileGids.length
      ? `${selectedTileGids.length} Tiles`
      : "No Selection"

  const selectionHint = dragSelectionBounds
    ? "拖动中，松开后会更新当前 stamp。"
    : selectedTileGids.length
      ? `已选 ${selectedTileGids.length} 个 tile，当前变换: ${brushSummary}`
      : "单击选择单个 tile，拖动可以框选一整块区域。"

  const activeTilesetPreviewUrl = activeTileset?.image ?? ""
  const activeTilesetSourcePath = activeTileset?.sourcePath ?? activeTileset?.name ?? ""

  const stampPreviewGrid = useMemo(() => {
    if (!transformedStamp || !activeTileset) return null

    const cells = Array.from(
      { length: transformedStamp.width * transformedStamp.height },
      () => null as { key: string; gid: number; url: string | null } | null
    )

    transformedStamp.cells.forEach((cell, index) => {
      const gridIndex = cell.offsetY * transformedStamp.width + cell.offsetX
      cells[gridIndex] = {
        key: `${index}-${cell.offsetX}-${cell.offsetY}-${cell.gid}`,
        gid: cell.gid,
        url: activeTileset.getTileImageUrl(cell.gid),
      }
    })

    return {
      width: transformedStamp.width,
      height: transformedStamp.height,
      cells,
    }
  }, [activeTileset, transformedStamp])

  const selectTiles = useCallback((gids: number[]) => {
    const next = Array.from(new Set(gids)).filter((gid) => gid > 0)
    setSelectedTileGids(next)
    setActiveGid(next[0] ?? 0)
  }, [])

  const handleDraftChange = useCallback(
    (key: keyof DocumentSettings, value: number) => {
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

  const getTilePreviewUrl = useCallback(
    (gid: number) => {
      if (!activeTileset) return null
      return activeTileset.getTileImageUrl(transformBrushGid(gid, brushTransform))
    },
    [activeTileset, brushTransform]
  )

  const getOrCreateObjectUrl = useCallback(async (path: string) => {
    const cached = blobUrlsRef.current.get(path)
    if (cached) return cached

    const objectUrl = await createObjectUrlFromPath(path)
    blobUrlsRef.current.set(path, objectUrl)
    return objectUrl
  }, [])

  const createTilesetsFromSources = useCallback(
    async (sources: TilesetLoadSource[]) => {
      return Promise.all(
        sources.map(async (source) => {
          const imageUrl = await getOrCreateObjectUrl(source.path)
          return Tileset.fromUrl({
            name: source.name,
            image: imageUrl,
            sourcePath: source.path,
            firstGid: source.firstGid,
            tileWidth: source.tileWidth,
            tileHeight: source.tileHeight,
            spacing: source.spacing,
            margin: source.margin,
          })
        })
      )
    },
    [getOrCreateObjectUrl]
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
    setActiveGid(0)
  }, [setTilesets])

  const getPreviewPoint = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!activeTileset || !tilesetImageRef.current) return null

      const rect = tilesetImageRef.current.getBoundingClientRect()
      if (!rect.width || !rect.height) return null

      const localX = clamp(event.clientX - rect.left, 0, rect.width)
      const localY = clamp(event.clientY - rect.top, 0, rect.height)

      return {
        x: (localX / rect.width) * activeTileset.imageWidth,
        y: (localY / rect.height) * activeTileset.imageHeight,
      }
    },
    [activeTileset]
  )

  const getSelectionTiles = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }) => {
      if (!activeTileset) return []

      const tiles = activeTileset.getTilesInImageBounds(
        start.x,
        start.y,
        end.x,
        end.y
      )
      if (tiles.length) return tiles

      const single = activeTileset.getTileAtImagePoint(end.x, end.y)
      return single ? [single] : []
    },
    [activeTileset]
  )

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
        const imageUrl = await getOrCreateObjectUrl(path)
        const nextTileset = await Tileset.fromUrl({
          name:
            files.length === 1 && !tilesets.length
              ? "Working Tileset"
              : `Tileset ${tilesets.length + index + 1}`,
          image: imageUrl,
          sourcePath: path,
          firstGid: nextFirstGid,
          tileWidth: documentConfig.cellSize,
          tileHeight: documentConfig.cellSize,
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
    getOrCreateObjectUrl,
    tilesets,
  ])

  const handleApplyDocument = useCallback(async () => {
    const nextConfig = {
      width: Number(draftConfig.width),
      height: Number(draftConfig.height),
      cellSize: Number(draftConfig.cellSize),
      majorLineEvery: Number(draftConfig.majorLineEvery),
    }

    if (
      !isPositiveInteger(nextConfig.width) ||
      !isPositiveInteger(nextConfig.height) ||
      !isPositiveInteger(nextConfig.cellSize) ||
      !isPositiveInteger(nextConfig.majorLineEvery)
    ) {
      setErrorMessage("画布宽高、单元大小和主网格间隔都必须是正整数")
      return
    }

    if (nextConfig.width % nextConfig.cellSize !== 0) {
      setErrorMessage("画布宽度必须能被 cellSize 整除")
      return
    }

    if (nextConfig.height % nextConfig.cellSize !== 0) {
      setErrorMessage("画布高度必须能被 cellSize 整除")
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

      const map = exportTiledMap()
      if (!map) {
        setErrorMessage("当前没有可导出的地图数据")
        return
      }

      const filePath = await save({
        defaultPath: mapPath || "tilemap.tmj",
        filters: [
          {
            name: "Tiled Map",
            extensions: ["tmj", "json"],
          },
        ],
      })

      if (!filePath) return

      await writeTextFile(filePath, JSON.stringify(map, null, 2))
      setMapPath(filePath)
      markSaved()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "导出地图失败")
    } finally {
      setLoadingMapIO(false)
    }
  }, [exportTiledMap, mapPath, markSaved])

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
      (mapMetrics.width !== targetConfig.width ||
        mapMetrics.height !== targetConfig.height ||
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

  const handleTilesetPreviewPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !activeTileset) return

      const point = getPreviewPoint(event)
      if (!point) return

      dragStartPointRef.current = point
      const selectedTiles = getSelectionTiles(point, point)
      setDragSelectionBounds(getBoundsFromTiles(selectedTiles))
      event.currentTarget.setPointerCapture(event.pointerId)
      event.preventDefault()
    },
    [activeTileset, getPreviewPoint, getSelectionTiles]
  )

  const handleTilesetPreviewPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const startPoint = dragStartPointRef.current
      if (!startPoint) return

      const point = getPreviewPoint(event)
      if (!point) return

      const selectedTiles = getSelectionTiles(startPoint, point)
      setDragSelectionBounds(getBoundsFromTiles(selectedTiles))
      event.preventDefault()
    },
    [getPreviewPoint, getSelectionTiles]
  )

  const finishTilesetPreviewSelection = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const startPoint = dragStartPointRef.current
      dragStartPointRef.current = null

      if (!startPoint) return

      const point = getPreviewPoint(event)
      if (!point) {
        setDragSelectionBounds(null)
        return
      }

      const selectedTiles = getSelectionTiles(startPoint, point)
      setDragSelectionBounds(null)
      selectTiles(selectedTiles.map((tile) => tile.gid))

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    },
    [getPreviewPoint, getSelectionTiles, selectTiles]
  )

  const handleSelectTileset = useCallback(
    (key: string) => {
      const nextTileset = tilesets.find((entry) => getTilesetKey(entry) === key)
      setActiveTilesetKey(key)
      selectTiles(nextTileset?.listTileGids().slice(0, 1) ?? [])
    },
    [selectTiles, tilesets]
  )

  useEffect(() => {
    const blobUrls = blobUrlsRef

    return () => {
      blobUrls.current.forEach((objectUrl) => URL.revokeObjectURL(objectUrl))
      blobUrls.current.clear()
    }
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
          <TilesetLibraryColumn
            tilesets={tilesets}
            activeTileset={activeTileset}
            loadingTileset={loadingTileset}
            filter={tilesetFilter}
            onLoadTileset={handleLoadTilesets}
            onSelectTileset={handleSelectTileset}
            onFilterChange={setTilesetFilter}
            getTilesetKey={getTilesetKey}
          />
        </div>

        <div className="flex w-[360px] shrink-0 flex-col gap-4 overflow-y-auto pr-1">
          <TilesetPreviewColumn
            activeTileset={activeTileset}
            previewUrl={activeTilesetPreviewUrl}
            sourcePath={activeTilesetSourcePath}
            selectionStyle={previewSelectionStyle}
            selectionLabel={selectionLabel}
            selectionHint={selectionHint}
            zoom={tilesetZoom}
            onZoomChange={setTilesetZoom}
            imageRef={tilesetImageRef}
            onPointerDown={handleTilesetPreviewPointerDown}
            onPointerMove={handleTilesetPreviewPointerMove}
            onPointerUp={finishTilesetPreviewSelection}
            onPointerCancel={finishTilesetPreviewSelection}
          />
        </div>

        <div className="flex w-[380px] shrink-0 flex-col gap-4 overflow-y-auto pr-1">
          <BrushWorkspaceColumn
            selectedTile={selectedTile}
            selectedTileGids={selectedTileGids}
            transformedStampSize={transformedStampSize}
            brushSummary={brushSummary}
            tileButtons={tileButtons}
            selectedTileSet={selectedTileSet}
            activeGid={activeGid}
            stampPreviewGrid={stampPreviewGrid}
            getTilePreviewUrl={getTilePreviewUrl}
            onSelectTile={(gid) => selectTiles([gid])}
            onClearActiveLayer={clearActiveLayer}
            onRotateCW={handleRotateBrushClockwise}
            onRotateCCW={handleRotateBrushCounterClockwise}
            onFlipX={handleToggleBrushFlipX}
            onFlipY={handleToggleBrushFlipY}
            onResetTransform={handleResetBrushTransform}
          />

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
