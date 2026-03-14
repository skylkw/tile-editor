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
import { Button } from "./components/ui/button"
import type { TiledMap, TiledTilesetRef } from "./core/tilemap/tiled-types"
import type { TilesetStamp, TilesetTileDescriptor } from "./core/tilemap/tileset"
import { Tileset } from "./core/tilemap/tileset"
import { useLeaferEngine } from "./hooks/use-leafer-engine"

type DocumentSettings = {
  width: number
  height: number
  cellSize: number
  majorLineEvery: number
}

type ImageBounds = {
  x: number
  y: number
  width: number
  height: number
}

type TilesetLoadSource = {
  name: string
  path: string
  firstGid?: number
  tileWidth: number
  tileHeight: number
  spacing?: number
  margin?: number
}

const DEFAULT_DOCUMENT: DocumentSettings = {
  width: 4096,
  height: 4096,
  cellSize: 32,
  majorLineEvery: 8,
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
}

function isPositiveInteger(value: number) {
  return Number.isInteger(value) && value > 0
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getMimeTypeFromPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? ""
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream"
}

async function createObjectUrlFromPath(path: string) {
  const bytes = await readFile(path)
  const blob = new Blob([bytes], { type: getMimeTypeFromPath(path) })
  return URL.createObjectURL(blob)
}

function getBoundsFromTiles(tiles: TilesetTileDescriptor[]): ImageBounds | null {
  if (!tiles.length) return null

  const minX = Math.min(...tiles.map((tile) => tile.x))
  const minY = Math.min(...tiles.map((tile) => tile.y))
  const maxX = Math.max(...tiles.map((tile) => tile.x + tile.width))
  const maxY = Math.max(...tiles.map((tile) => tile.y + tile.height))

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function isAbsoluteLocalPath(path: string) {
  return (
    /^[a-zA-Z]:[\\/]/.test(path) ||
    path.startsWith("\\\\") ||
    path.startsWith("/")
  )
}

function getDirectoryPath(path: string) {
  const normalized = path.replace(/[\\/]+/g, "/")
  const index = normalized.lastIndexOf("/")
  return index >= 0 ? normalized.slice(0, index) : ""
}

function joinPath(baseDir: string, relativePath: string) {
  if (!baseDir) return relativePath
  const separator = baseDir.includes("\\") ? "\\" : "/"
  const normalizedBase = baseDir.replace(/[\\/]+/g, separator)
  const normalizedRelative = relativePath.replace(/[\\/]+/g, separator)
  return `${normalizedBase}${separator}${normalizedRelative}`
}

function resolveTilesetSourcePath(
  mapPath: string,
  tilesetRef: TiledTilesetRef | undefined
) {
  const candidate = tilesetRef?.image ?? tilesetRef?.source
  if (!candidate) return ""
  if (isAbsoluteLocalPath(candidate)) return candidate

  const mapDir = getDirectoryPath(mapPath)
  return joinPath(mapDir, candidate)
}

function getDocumentConfigFromMap(map: TiledMap): DocumentSettings | null {
  if (!map.width || !map.height || !map.tilewidth || !map.tileheight) return null
  if (map.tilewidth !== map.tileheight) return null

  return {
    width: map.width * map.tilewidth,
    height: map.height * map.tileheight,
    cellSize: map.tilewidth,
    majorLineEvery: DEFAULT_DOCUMENT.majorLineEvery,
  }
}

function getTilesetKey(tileset: { sourcePath?: string; name: string }) {
  return tileset.sourcePath ?? tileset.name
}

function confirmDiscardChanges() {
  return window.confirm("当前有未保存修改，继续操作会覆盖当前状态，是否继续？")
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
  const [loadingTileset, setLoadingTileset] = useState(false)
  const [loadingMapIO, setLoadingMapIO] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [dragSelectionBounds, setDragSelectionBounds] =
    useState<ImageBounds | null>(null)
  const [pendingImportedMap, setPendingImportedMap] = useState<TiledMap | null>(null)

  const blobUrlsRef = useRef<Map<string, string>>(new Map())
  const tilesetImageRef = useRef<HTMLImageElement | null>(null)
  const dragStartPointRef = useRef<{ x: number; y: number } | null>(null)

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
    activeStamp: selectedStamp,
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
    if (!activeTileset) {
      setSelectedStamp(null)
      return
    }

    setSelectedStamp(activeTileset.createStamp(selectedTileGids))
  }, [activeTileset, selectedTileGids])

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

  const activeTilesetSourcePath = activeTileset?.sourcePath ?? ""
  const activeTilesetPreviewUrl = activeTileset?.image ?? ""
  const tileButtons = activeTileset?.listTiles() ?? []

  const selectTiles = useCallback((gids: number[]) => {
    const next = Array.from(new Set(gids)).filter((gid) => gid > 0)
    setSelectedTileGids(next)
    setActiveGid(next[0] ?? 0)
  }, [])

  const getOrCreateObjectUrl = useCallback(async (path: string) => {
    const cached = blobUrlsRef.current.get(path)
    if (cached) return cached

    const objectUrl = await createObjectUrlFromPath(path)
    blobUrlsRef.current.set(path, objectUrl)
    return objectUrl
  }, [])

  const loadTilesetsFromSources = useCallback(
    async (sources: TilesetLoadSource[]) => {
      const nextTilesets = await Promise.all(
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

      setTilesets(nextTilesets)
      return nextTilesets
    },
    [getOrCreateObjectUrl, setTilesets]
  )

  const applyLoadedTilesets = useCallback(
    (nextTilesets: Tileset[], preferredKey?: string) => {
      const fallbackTileset = nextTilesets[0] ?? null
      const nextActiveTileset =
        nextTilesets.find((entry) => getTilesetKey(entry) === preferredKey) ??
        fallbackTileset

      setActiveTilesetKey(nextActiveTileset ? getTilesetKey(nextActiveTileset) : "")
      selectTiles(nextActiveTileset?.listTileGids().slice(0, 1) ?? [])
    },
    [selectTiles]
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

  const handleLoadImage = useCallback(async () => {
    if (isDirty && !confirmDiscardChanges()) return

    const file = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "Image",
          extensions: ["png", "jpg", "jpeg", "webp", "gif"],
        },
      ],
    })

    if (!file || Array.isArray(file)) return

    try {
      setLoadingTileset(true)
      setErrorMessage("")
      setDragSelectionBounds(null)

      const nextTilesets = await loadTilesetsFromSources([
        {
          name: "Working Tileset",
          path: file,
          firstGid: 1,
          tileWidth: documentConfig.cellSize,
          tileHeight: documentConfig.cellSize,
        },
      ])

      applyLoadedTilesets(nextTilesets, file)
    } catch (error) {
      clearTilesets()
      setErrorMessage(
        error instanceof Error ? error.message : "读取图集文件失败"
      )
    } finally {
      setLoadingTileset(false)
    }
  }, [
    applyLoadedTilesets,
    clearTilesets,
    documentConfig.cellSize,
    isDirty,
    loadTilesetsFromSources,
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
      clearTilesets()
    }

    setDocumentConfig(nextConfig)

    if (shouldReloadTilesets) {
      try {
        const nextTilesets = await loadTilesetsFromSources(
          tilesets
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
        )

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
    documentConfig.cellSize,
    draftConfig,
    loadTilesetsFromSources,
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
    if (isDirty && !confirmDiscardChanges()) return

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
        const nextTilesets = await loadTilesetsFromSources(tilesetSources)
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
  }, [applyLoadedTilesets, clearTilesets, isDirty, loadTilesetsFromSources])

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
      if (!activeTileset) return

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

  useEffect(() => {
    const blobUrls = blobUrlsRef

    return () => {
      blobUrls.current.forEach((objectUrl) => URL.revokeObjectURL(objectUrl))
      blobUrls.current.clear()
    }
  }, [])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[radial-gradient(circle_at_top,#17304f_0%,#0a1220_45%,#04070d_100%)] text-slate-100">
      <aside className="flex w-[360px] shrink-0 flex-col border-r border-white/10 bg-black/35 backdrop-blur-xl">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-xs uppercase tracking-[0.35em] text-amber-300/80">
            Tile Editor
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            Finite Canvas Workspace
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            固定画布、有限 tilemap、受控缩放和平移。现在网格尺寸、地图尺寸和导出尺寸会始终保持一致。
          </p>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
                  File
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  导入和导出 Tiled JSON 地图，会保留当前的多图层顺序和 tileset 引用。
                </p>
              </div>
              <div
                className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${
                  isDirty
                    ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
                    : "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
                }`}
              >
                {isDirty ? "Unsaved" : "Saved"}
              </div>
            </div>

            <div className="mb-4 flex items-center justify-end">
              <div className="flex gap-2">
                <Button
                  onClick={handleImportMap}
                  disabled={loadingMapIO}
                  variant="outline"
                  className="rounded-full border-white/15 bg-transparent text-slate-200 hover:bg-white/10"
                >
                  {loadingMapIO ? "处理中..." : "导入地图"}
                </Button>
                <Button
                  onClick={handleExportMap}
                  disabled={loadingMapIO}
                  className="rounded-full bg-emerald-300 px-4 text-slate-950 hover:bg-emerald-200 disabled:opacity-60"
                >
                  导出地图
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
              {mapPath || "还没有打开地图文件"} · Revision {revision}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
                  Canvas
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  修改后会保留重叠区域内的已绘制内容。
                </p>
              </div>
              <Button
                onClick={handleApplyDocument}
                className="rounded-full bg-amber-400 px-4 text-slate-950 hover:bg-amber-300"
              >
                应用尺寸
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-2 text-xs text-slate-300">
                <span>Canvas Width</span>
                <input
                  type="number"
                  min={1}
                  value={draftConfig.width}
                  onChange={(event) =>
                    setDraftConfig((current) => ({
                      ...current,
                      width: Number(event.target.value),
                    }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-300/60"
                />
              </label>

              <label className="space-y-2 text-xs text-slate-300">
                <span>Canvas Height</span>
                <input
                  type="number"
                  min={1}
                  value={draftConfig.height}
                  onChange={(event) =>
                    setDraftConfig((current) => ({
                      ...current,
                      height: Number(event.target.value),
                    }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-300/60"
                />
              </label>

              <label className="space-y-2 text-xs text-slate-300">
                <span>Cell Size</span>
                <input
                  type="number"
                  min={1}
                  value={draftConfig.cellSize}
                  onChange={(event) =>
                    setDraftConfig((current) => ({
                      ...current,
                      cellSize: Number(event.target.value),
                    }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-300/60"
                />
              </label>

              <label className="space-y-2 text-xs text-slate-300">
                <span>Major Every</span>
                <input
                  type="number"
                  min={1}
                  value={draftConfig.majorLineEvery}
                  onChange={(event) =>
                    setDraftConfig((current) => ({
                      ...current,
                      majorLineEvery: Number(event.target.value),
                    }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-300/60"
                />
              </label>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
              当前网格: {mapMetrics.cols} x {mapMetrics.rows} cells
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
                  Tileset
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  图集会按当前 cellSize 自动切片，拖动预览图可以框选 tile。
                </p>
              </div>
              <Button
                onClick={handleLoadImage}
                disabled={loadingTileset}
                className="rounded-full bg-teal-300 px-4 text-slate-950 hover:bg-teal-200 disabled:opacity-60"
              >
                {loadingTileset ? "加载中..." : "导入图集"}
              </Button>
            </div>

            {activeTilesetPreviewUrl && activeTileset ? (
              <div className="space-y-3">
                {tilesets.length > 1 ? (
                  <div className="flex flex-wrap gap-2">
                    {tilesets.map((entry, index) => {
                      const entryKey = getTilesetKey(entry)
                      const isActiveTileset = entryKey === getTilesetKey(activeTileset)

                      return (
                        <button
                          key={entryKey}
                          type="button"
                          onClick={() => {
                            setActiveTilesetKey(entryKey)
                            selectTiles(entry.listTileGids().slice(0, 1))
                          }}
                          className={`rounded-full border px-3 py-1.5 text-xs transition ${
                            isActiveTileset
                              ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100"
                              : "border-white/10 bg-slate-950/60 text-slate-300 hover:bg-white/10"
                          }`}
                        >
                          {entry.name || `Tileset ${index + 1}`}
                        </button>
                      )
                    })}
                  </div>
                ) : null}

                <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70">
                  <div className="border-b border-white/10 px-3 py-2 text-[11px] text-slate-400">
                    {activeTilesetSourcePath}
                  </div>
                  <div className="max-h-64 overflow-auto p-3">
                    <div
                      className="relative block touch-none rounded-xl"
                      onPointerDown={handleTilesetPreviewPointerDown}
                      onPointerMove={handleTilesetPreviewPointerMove}
                      onPointerUp={finishTilesetPreviewSelection}
                      onPointerCancel={finishTilesetPreviewSelection}
                    >
                      <img
                        ref={tilesetImageRef}
                        src={activeTilesetPreviewUrl}
                        alt="Current tileset"
                        className="block w-full rounded-xl bg-[linear-gradient(135deg,#0b1220,#10192d)] object-contain [image-rendering:pixelated]"
                      />
                      {previewSelectionStyle ? (
                        <div
                          className="pointer-events-none absolute rounded-md border border-amber-300 bg-amber-300/15 shadow-[0_0_0_1px_rgba(252,211,77,0.35)]"
                          style={previewSelectionStyle}
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
                    Stamp: {selectedStamp ? `${selectedStamp.width} x ${selectedStamp.height}` : "0 x 0"}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/45 px-4 py-8 text-center text-sm text-slate-500">
                还没有导入 tileset
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
                  Palette
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  单击使用单个 tile，拖动框选会生成矩形 stamp，左键会把整块 stamp 一次性刷到当前图层。
                </p>
              </div>
              <Button
                onClick={clearActiveLayer}
                variant="outline"
                className="rounded-full border-white/15 bg-transparent text-slate-200 hover:bg-white/10"
              >
                清空当前层
              </Button>
            </div>

            {selectedTile ? (
              <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-3">
                <div
                  className="h-14 w-14 rounded-xl border border-white/15 bg-slate-950"
                  style={{
                    backgroundImage: `url(${activeTileset?.image})`,
                    backgroundPosition: `-${selectedTile.x * (56 / selectedTile.width)}px -${selectedTile.y * (56 / selectedTile.height)}px`,
                    backgroundSize: `${(activeTileset?.imageWidth ?? 0) * (56 / selectedTile.width)}px ${(activeTileset?.imageHeight ?? 0) * (56 / selectedTile.height)}px`,
                    imageRendering: "pixelated",
                  }}
                />
                <div>
                  <p className="text-sm font-medium text-white">
                    Tile #{selectedTile.gid}
                    {selectedTileGids.length > 1 ? ` +${selectedTileGids.length - 1}` : ""}
                  </p>
                  <p className="text-xs text-slate-300">
                    Local ID {selectedTile.localId} · Column {selectedTile.column + 1} · Row {selectedTile.row + 1}
                  </p>
                  <p className="text-xs text-slate-400">
                    Stamp {selectedStamp?.width ?? 1} x {selectedStamp?.height ?? 1} · Active Layer {activeLayer?.name ?? "-"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mb-4 rounded-2xl border border-dashed border-white/15 bg-slate-950/45 px-4 py-5 text-sm text-slate-500">
                先导入 tileset，再选择要绘制的 tile 或框选一个 stamp。
              </div>
            )}

            <div className="grid max-h-[360px] grid-cols-5 gap-2 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/45 p-2">
              {tileButtons.length ? (
                tileButtons.map((tile) => {
                  const previewScale = 40 / tile.width
                  const isActive = tile.gid === activeGid
                  const isSelected = selectedTileSet.has(tile.gid)

                  return (
                    <button
                      key={tile.gid}
                      type="button"
                      onClick={() => selectTiles([tile.gid])}
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
                        className="h-10 w-10 rounded-lg bg-slate-950"
                        style={{
                          backgroundImage: `url(${activeTileset?.image})`,
                          backgroundPosition: `-${tile.x * previewScale}px -${tile.y * previewScale}px`,
                          backgroundSize: `${(activeTileset?.imageWidth ?? 0) * previewScale}px ${(activeTileset?.imageHeight ?? 0) * previewScale}px`,
                          imageRendering: "pixelated",
                        }}
                      />
                    </button>
                  )
                })
              ) : (
                <div className="col-span-5 flex min-h-28 items-center justify-center text-sm text-slate-500">
                  这里会显示 tileset 切出来的 tile 列表
                </div>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
                  Layers
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  每一层独立存 tile 数据、显隐状态和导出结果，当前绘制只会落到高亮的活动层。
                </p>
              </div>
              <Button
                onClick={addLayer}
                className="rounded-full bg-cyan-300 px-4 text-slate-950 hover:bg-cyan-200"
              >
                新建图层
              </Button>
            </div>

            <div className="space-y-3">
              {layers.map((layer, index) => {
                const isActive = layer.id === activeLayerId
                const isTopLayer = index === layers.length - 1
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
                        onClick={() => setActiveLayerId(layer.id)}
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
                        onClick={() => moveLayerUp(layer.id)}
                        disabled={isTopLayer}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        上移
                      </button>
                      <button
                        type="button"
                        onClick={() => moveLayerDown(layer.id)}
                        disabled={isBottomLayer}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        下移
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleLayerVisibility(layer.id)}
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
                        onClick={() => removeLayer(layer.id)}
                        disabled={layers.length <= 1}
                        className="rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs text-rose-100 transition hover:bg-rose-300/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        删除
                      </button>
                    </div>
                    <input
                      type="text"
                      value={layer.name}
                      onChange={(event) => renameLayer(layer.id, event.target.value)}
                      className="mt-3 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-300/50"
                    />
                  </div>
                )
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
              Controls
            </h2>
            <div className="mt-3 space-y-2 text-xs leading-6 text-slate-400">
              <p>Left Click / Drag: 在当前图层绘制整个 stamp</p>
              <p>Right Click / Drag: 按 stamp 足迹擦除 tile</p>
              <p>Middle Drag 或 Space + Left Drag: 平移画布</p>
              <p>Mouse Wheel: 以鼠标位置为中心缩放</p>
              <p>Tileset Preview Drag: 框选 tileset 区域并生成 stamp</p>
              <p>Layer Panel: 切换活动层、上移下移、改名、显隐、删除</p>
            </div>
          </section>

          {errorMessage ? (
            <section className="rounded-3xl border border-rose-300/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {errorMessage}
            </section>
          ) : null}
        </div>
      </aside>

      <main className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(21,41,66,0.65),rgba(4,8,15,0.95))]" />
        <div className="absolute inset-[18px] overflow-hidden rounded-[32px] border border-white/10 bg-slate-950/65 shadow-[0_40px_120px_rgba(0,0,0,0.45)] backdrop-blur-sm">
          <div
            ref={viewRef}
            className="h-full w-full touch-none select-none"
            style={{ cursor: "crosshair" }}
          />
        </div>

        <div className="pointer-events-none absolute left-8 top-8 flex flex-wrap gap-3">
          <div className="rounded-full border border-white/10 bg-black/35 px-4 py-2 text-xs text-slate-200 backdrop-blur-md">
            Canvas {mapMetrics.width} x {mapMetrics.height}px
          </div>
          <div className="rounded-full border border-white/10 bg-black/35 px-4 py-2 text-xs text-slate-200 backdrop-blur-md">
            Grid {mapMetrics.cols} x {mapMetrics.rows}
          </div>
          <div className="rounded-full border border-white/10 bg-black/35 px-4 py-2 text-xs text-slate-200 backdrop-blur-md">
            Zoom {(cameraState.scale * 100).toFixed(0)}%
          </div>
          <div className="rounded-full border border-white/10 bg-black/35 px-4 py-2 text-xs text-slate-200 backdrop-blur-md">
            Hover {hoverCell ? `${hoverCell.cellX}, ${hoverCell.cellY}` : "-"}
          </div>
          <div className="rounded-full border border-white/10 bg-black/35 px-4 py-2 text-xs text-slate-200 backdrop-blur-md">
            Layer {activeLayer?.name ?? "-"}
          </div>
          <div className="rounded-full border border-white/10 bg-black/35 px-4 py-2 text-xs text-slate-200 backdrop-blur-md">
            Stamp {selectedStamp ? `${selectedStamp.width} x ${selectedStamp.height}` : "-"}
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-8 left-8 rounded-[28px] border border-white/10 bg-black/35 px-5 py-4 text-xs text-slate-200 backdrop-blur-md">
          <p className="text-[11px] uppercase tracking-[0.3em] text-amber-300/90">
            Active Stamp
          </p>
          <p className="mt-2 text-sm text-white">
            {selectedTile ? `#${selectedTile.gid} · ${selectedStamp?.width ?? 1} x ${selectedStamp?.height ?? 1}` : "None"}
          </p>
          <p className="mt-1 text-slate-400">
            {selectedTile
              ? `${selectedTile.width} x ${selectedTile.height}px slice · layer ${activeLayer?.name ?? "-"}`
              : "导入图集后选择一个 tile 或框选 stamp"}
          </p>
        </div>
      </main>
    </div>
  )
}
