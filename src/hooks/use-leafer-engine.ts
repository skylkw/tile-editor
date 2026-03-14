import { createLeaferEngine, LeaferEngine } from "@/core/engine/leafer-engine"
import type {
  CameraState,
  GridCell,
  GridOptions,
} from "@/core/engine/types"
import { resolveGridOptions } from "@/core/engine/grid"
import { buildTiledMap } from "@/core/io/tiled-map"
import { TileLayer } from "@/core/tilemap/tile-layer"
import { clearTiledGidFlags } from "@/core/tilemap/tiled-gid"
import type {
  TiledMap,
  TiledTileLayer,
  TiledTilesetRef,
} from "@/core/tilemap/tiled-types"
import type { Tileset, TilesetStamp } from "@/core/tilemap/tileset"
import { Group, Image, Rect } from "leafer-ui"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

export interface UseLeaferEngineOptions {
  document?: GridOptions
  activeStamp?: TilesetStamp | null
}

export interface EditorLayerState {
  id: string
  name: string
  visible: boolean
}

type StampPreviewNode = Image | Rect

const DEFAULT_DOCUMENT: Required<
  Pick<GridOptions, "cols" | "rows" | "cellSize" | "majorLineEvery">
> = {
  cols: 128,
  rows: 128,
  cellSize: 32,
  majorLineEvery: 8,
}

const DEFAULT_CAMERA_STATE: CameraState = {
  x: 0,
  y: 0,
  scale: 1,
}

function createDefaultLayerState(index = 1): EditorLayerState {
  return {
    id: `layer-${index}`,
    name: `Layer ${index}`,
    visible: true,
  }
}

function isTextInputTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable)
  )
}

function isTiledTileLayer(layer: TiledMap["layers"][number]): layer is TiledTileLayer {
  return (
    typeof layer === "object" &&
    layer !== null &&
    "type" in layer &&
    layer.type === "tilelayer"
  )
}

export function useLeaferEngine(options: UseLeaferEngineOptions = {}) {
  const initialLayerState = useMemo(() => createDefaultLayerState(), [])
  const initialLayers = useMemo(() => [initialLayerState], [initialLayerState])
  const viewRef = useRef<HTMLDivElement | null>(null)
  const engineRef = useRef<LeaferEngine | null>(null)
  const tilesetsRef = useRef<Tileset[]>([])
  const activeStampRef = useRef<TilesetStamp | null>(options.activeStamp ?? null)
  const spacePressedRef = useRef(false)
  const hoverCellRef = useRef<GridCell | null>(null)
  const layerIdCounterRef = useRef(2)
  const layerInstancesRef = useRef<Map<string, TileLayer>>(new Map())
  const layerStatesRef = useRef<EditorLayerState[]>(initialLayers)
  const activeLayerIdRef = useRef(initialLayerState.id)
  const hoverOutlineRef = useRef<Rect | null>(null)
  const stampPreviewGroupRef = useRef<Group | null>(null)
  const stampPreviewTintRef = useRef<Rect | null>(null)
  const stampPreviewNodesRef = useRef<StampPreviewNode[]>([])
  const revisionRef = useRef(0)

  const [cameraState, setCameraState] = useState(DEFAULT_CAMERA_STATE)
  const [hoverCell, setHoverCell] = useState<GridCell | null>(null)
  const [tilesets, setTilesetsState] = useState<Tileset[]>([])
  const [layers, setLayers] = useState<EditorLayerState[]>(initialLayers)
  const [activeLayerId, setActiveLayerIdState] = useState(initialLayerState.id)
  const [revision, setRevision] = useState(0)
  const [savedRevision, setSavedRevision] = useState(0)

  const cols = options.document?.cols ?? DEFAULT_DOCUMENT.cols
  const rows = options.document?.rows ?? DEFAULT_DOCUMENT.rows
  const cellSize = options.document?.cellSize ?? DEFAULT_DOCUMENT.cellSize
  const majorLineEvery =
    options.document?.majorLineEvery ?? DEFAULT_DOCUMENT.majorLineEvery

  const resolvedDocument = useMemo(
    () =>
      resolveGridOptions({
        ...options.document,
        cols,
        rows,
        cellSize,
        majorLineEvery,
      }),
    [cellSize, cols, majorLineEvery, options.document, rows]
  )

  const activeLayer = useMemo(
    () => layers.find((layer) => layer.id === activeLayerId) ?? null,
    [activeLayerId, layers]
  )
  const tileset = useMemo(() => tilesets[0] ?? null, [tilesets])
  const isDirty = revision !== savedRevision

  useEffect(() => {
    activeStampRef.current = options.activeStamp ?? null
  }, [options.activeStamp])

  const updateHoverCell = useCallback((nextCell: GridCell | null) => {
    const currentCell = hoverCellRef.current
    const unchanged =
      currentCell?.cellX === nextCell?.cellX &&
      currentCell?.cellY === nextCell?.cellY

    if (unchanged) return

    hoverCellRef.current = nextCell
    setHoverCell(nextCell)
  }, [])

  const syncCameraState = useCallback((engine: LeaferEngine) => {
    setCameraState(engine.getCameraState())
  }, [])

  const bumpRevision = useCallback(() => {
    revisionRef.current += 1
    setRevision(revisionRef.current)
  }, [])

  const markSaved = useCallback(() => {
    setSavedRevision(revisionRef.current)
  }, [])

  const getTilesetForGid = useCallback((gid: number) => {
    const resolvedGid = clearTiledGidFlags(gid)
    return (
      tilesetsRef.current.find((tileset) => tileset.containsGid(resolvedGid)) ??
      null
    )
  }, [])

  const syncLayerOrdering = useCallback(() => {
    const currentLayers = layerStatesRef.current

    currentLayers.forEach((layerState, index) => {
      layerInstancesRef.current.get(layerState.id)?.setOrder(index)
    })
  }, [])

  const commitLayers = useCallback(
    (nextLayers: EditorLayerState[], nextActiveLayerId?: string) => {
      const fallbackActiveId =
        nextLayers.find((layer) => layer.id === nextActiveLayerId)?.id ??
        nextLayers[0]?.id ??
        ""

      layerStatesRef.current = nextLayers
      activeLayerIdRef.current = fallbackActiveId
      setLayers(nextLayers)
      setActiveLayerIdState(fallbackActiveId)

      const nextIds = new Set(nextLayers.map((layer) => layer.id))
      for (const [layerId, layer] of layerInstancesRef.current) {
        if (nextIds.has(layerId)) continue
        layer.destroy()
        layerInstancesRef.current.delete(layerId)
      }

      syncLayerOrdering()
    },
    [syncLayerOrdering]
  )

  const ensureLayerInstance = useCallback((layerId: string, engine?: LeaferEngine) => {
    const targetEngine = engine ?? engineRef.current
    if (!targetEngine) return null

    const layerState = layerStatesRef.current.find((layer) => layer.id === layerId)
    if (!layerState) return null
    const layerOrder = layerStatesRef.current.findIndex((layer) => layer.id === layerId)

    const existing = layerInstancesRef.current.get(layerId)
    if (existing) {
      if (!existing.isAttachedTo(targetEngine)) {
        existing.attachEngine(targetEngine)
      }
      existing.setName(layerState.name)
      existing.setVisible(layerState.visible)
      existing.setOrder(layerOrder)
      existing.resizeToMatchEngine()
      existing.setTilesets(tilesetsRef.current)
      return existing
    }

    const nextLayer = new TileLayer(targetEngine, {
      id: layerState.id,
      name: layerState.name,
      visible: layerState.visible,
      order: layerOrder,
    })
    nextLayer.resizeToMatchEngine()
    nextLayer.setTilesets(tilesetsRef.current)
    layerInstancesRef.current.set(layerId, nextLayer)
    return nextLayer
  }, [])

  const syncAllLayerInstances = useCallback(
    (engine?: LeaferEngine) => {
      const targetEngine = engine ?? engineRef.current
      if (!targetEngine) return

      for (const layerState of layerStatesRef.current) {
        ensureLayerInstance(layerState.id, targetEngine)
      }

      syncLayerOrdering()
    },
    [ensureLayerInstance, syncLayerOrdering]
  )

  const getLayer = useCallback(
    (layerId?: string) => {
      return ensureLayerInstance(layerId ?? activeLayerIdRef.current)
    },
    [ensureLayerInstance]
  )

  const setActiveLayerId = useCallback((layerId: string) => {
    const layerExists = layerStatesRef.current.some((layer) => layer.id === layerId)
    if (!layerExists) return

    activeLayerIdRef.current = layerId
    setActiveLayerIdState(layerId)
  }, [])

  const setTilesets = useCallback((nextTilesets: Tileset[]) => {
    tilesetsRef.current = nextTilesets
    setTilesetsState(nextTilesets)

    for (const layer of layerInstancesRef.current.values()) {
      layer.setTilesets(nextTilesets)
    }
  }, [])

  const setTileset = useCallback(
    (nextTileset: Tileset | null) => {
      setTilesets(nextTileset ? [nextTileset] : [])
    },
    [setTilesets]
  )

  const createStampPreviewFallback = useCallback(
    (offsetX: number, offsetY: number, size: number, gid: number) => {
      const hue = (gid * 41) % 360

      return new Rect({
        x: offsetX * size,
        y: offsetY * size,
        width: size,
        height: size,
        fill: `hsla(${hue}, 78%, 58%, 0.38)`,
        stroke: "rgba(15, 23, 42, 0.8)",
        strokeWidth: 1,
      })
    },
    []
  )

  const syncStampPreviewNodes = useCallback(() => {
    const previewGroup = stampPreviewGroupRef.current
    const previewTint = stampPreviewTintRef.current
    const engine = engineRef.current
    const stamp = activeStampRef.current
    if (!previewGroup || !engine) return

    stampPreviewNodesRef.current.forEach((node) => node.destroy())
    stampPreviewNodesRef.current = []

    if (!stamp?.cells.length) {
      previewGroup.set({ visible: false })
      return
    }

    const size = engine.getCellSize()
    const nextNodes = stamp.cells.map((stampCell) => {
      const tileImageUrl = getTilesetForGid(stampCell.gid)?.getTileImageUrl(
        stampCell.gid
      )
      if (tileImageUrl) {
        return new Image({
          x: stampCell.offsetX * size,
          y: stampCell.offsetY * size,
          width: size,
          height: size,
          url: tileImageUrl,
          opacity: 0.5,
        })
      }

      return createStampPreviewFallback(
        stampCell.offsetX,
        stampCell.offsetY,
        size,
        stampCell.gid
      )
    })

    nextNodes.forEach((node) => previewGroup.add(node))
    if (previewTint) {
      previewGroup.add(previewTint)
    }
    stampPreviewNodesRef.current = nextNodes
  }, [createStampPreviewFallback, getTilesetForGid])

  const syncStampPreviewPosition = useCallback(() => {
    const previewGroup = stampPreviewGroupRef.current
    const previewTint = stampPreviewTintRef.current
    const outline = hoverOutlineRef.current
    const engine = engineRef.current
    const stamp = activeStampRef.current
    const hoverCell = hoverCellRef.current

    if (
      !previewGroup ||
      !previewTint ||
      !outline ||
      !engine ||
      !stamp?.cells.length ||
      !hoverCell
    ) {
      previewGroup?.set({ visible: false })
      previewTint?.set({ visible: false })
      outline?.set({ visible: false })
      return
    }

    const world = engine.cellToWorld(hoverCell.cellX, hoverCell.cellY)
    const size = engine.getCellSize()

    previewGroup.set({
      visible: true,
      x: world.x,
      y: world.y,
    })
    previewTint.set({
      visible: true,
      x: 0,
      y: 0,
      width: stamp.width * size,
      height: stamp.height * size,
    })

    outline.set({
      visible: true,
      x: world.x,
      y: world.y,
      width: stamp.width * size,
      height: stamp.height * size,
    })
  }, [])

  useEffect(() => {
    syncStampPreviewNodes()
    syncStampPreviewPosition()
  }, [options.activeStamp, syncStampPreviewNodes, syncStampPreviewPosition, tilesets])

  const setStampPreviewBlocked = useCallback((blocked: boolean) => {
    const previewGroup = stampPreviewGroupRef.current
    const previewTint = stampPreviewTintRef.current
    const outline = hoverOutlineRef.current
    if (!previewGroup || !previewTint || !outline) return

    previewGroup.set({
      opacity: blocked ? 0.78 : 1,
    })
    previewTint.set({
      visible: blocked,
      fill: blocked ? "rgba(248, 113, 113, 0.28)" : "rgba(34, 197, 94, 0)",
    })
    outline.set({
      fill: blocked ? "rgba(248, 113, 113, 0.12)" : "rgba(56, 189, 248, 0.08)",
      stroke: blocked ? "#f87171" : "#38bdf8",
    })
  }, [])

  const addLayer = useCallback(() => {
    const nextIndex = layerIdCounterRef.current
    layerIdCounterRef.current += 1

    const nextLayer = createDefaultLayerState(nextIndex)
    const nextLayers = [...layerStatesRef.current, nextLayer]
    commitLayers(nextLayers, nextLayer.id)
    ensureLayerInstance(nextLayer.id)
    bumpRevision()
    return nextLayer.id
  }, [bumpRevision, commitLayers, ensureLayerInstance])

  const removeLayer = useCallback(
    (layerId: string) => {
      if (layerStatesRef.current.length <= 1) return false

      const nextLayers = layerStatesRef.current.filter((layer) => layer.id !== layerId)
      const nextActiveLayerId =
        activeLayerIdRef.current === layerId
          ? nextLayers[Math.max(0, nextLayers.length - 1)]?.id
          : activeLayerIdRef.current

      commitLayers(nextLayers, nextActiveLayerId)
      bumpRevision()
      return true
    },
    [bumpRevision, commitLayers]
  )

  const moveLayer = useCallback(
    (layerId: string, direction: -1 | 1) => {
      const currentLayers = [...layerStatesRef.current]
      const currentIndex = currentLayers.findIndex((layer) => layer.id === layerId)
      if (currentIndex === -1) return false

      const nextIndex = currentIndex + direction
      if (nextIndex < 0 || nextIndex >= currentLayers.length) return false

      const [targetLayer] = currentLayers.splice(currentIndex, 1)
      currentLayers.splice(nextIndex, 0, targetLayer)
      commitLayers(currentLayers, activeLayerIdRef.current)
      bumpRevision()
      return true
    },
    [bumpRevision, commitLayers]
  )

  const moveLayerUp = useCallback(
    (layerId: string) => moveLayer(layerId, 1),
    [moveLayer]
  )

  const moveLayerDown = useCallback(
    (layerId: string) => moveLayer(layerId, -1),
    [moveLayer]
  )

  const renameLayer = useCallback((layerId: string, name: string) => {
    const nextName = name.trim() || "Untitled Layer"
    const nextLayers = layerStatesRef.current.map((layer) =>
      layer.id === layerId ? { ...layer, name: nextName } : layer
    )

    commitLayers(nextLayers, activeLayerIdRef.current)
    layerInstancesRef.current.get(layerId)?.setName(nextName)
    bumpRevision()
  }, [bumpRevision, commitLayers])

  const toggleLayerVisibility = useCallback(
    (layerId: string) => {
      const currentLayers = layerStatesRef.current
      const targetLayer = currentLayers.find((layer) => layer.id === layerId)
      if (!targetLayer) return

      const nextVisible = !targetLayer.visible
      const nextLayers = currentLayers.map((layer) =>
        layer.id === layerId ? { ...layer, visible: nextVisible } : layer
      )

      const nextActiveLayerId =
        !nextVisible && activeLayerIdRef.current === layerId
          ? nextLayers.find((layer) => layer.visible)?.id ?? layerId
          : activeLayerIdRef.current

      commitLayers(nextLayers, nextActiveLayerId)
      layerInstancesRef.current.get(layerId)?.setVisible(nextVisible)
      bumpRevision()
    },
    [bumpRevision, commitLayers]
  )

  const setTile = useCallback(
    (cellX: number, cellY: number, gid: number, layerId?: string) => {
      getLayer(layerId)?.setTile(cellX, cellY, gid)
      bumpRevision()
    },
    [bumpRevision, getLayer]
  )

  const setTileGid = useCallback(
    (cellX: number, cellY: number, rawGid: number, layerId?: string) => {
      getLayer(layerId)?.setTileGid(cellX, cellY, rawGid)
      bumpRevision()
    },
    [bumpRevision, getLayer]
  )

  const getTileGid = useCallback(
    (cellX: number, cellY: number, layerId?: string) => {
      return getLayer(layerId)?.getTileGid(cellX, cellY) ?? 0
    },
    [getLayer]
  )

  const removeTile = useCallback(
    (cellX: number, cellY: number, layerId?: string) => {
      getLayer(layerId)?.removeTile(cellX, cellY)
      bumpRevision()
    },
    [bumpRevision, getLayer]
  )

  const clearLayer = useCallback((layerId: string) => {
    getLayer(layerId)?.clear()
    bumpRevision()
  }, [bumpRevision, getLayer])

  const clearActiveLayer = useCallback(() => {
    clearLayer(activeLayerIdRef.current)
  }, [clearLayer])

  const clearTiles = clearActiveLayer

  const clearAllLayers = useCallback(() => {
    for (const layerState of layerStatesRef.current) {
      getLayer(layerState.id)?.clear()
    }
    bumpRevision()
  }, [bumpRevision, getLayer])

  const exportTiledTileLayer = useCallback(
    (name?: string): TiledTileLayer | null => {
      const layerState = layerStatesRef.current.find(
        (layer) => layer.id === activeLayerIdRef.current
      )
      if (!layerState) return null

      return getLayer(layerState.id)?.exportTiledTileLayer(name ?? layerState.name) ?? null
    },
    [getLayer]
  )

  const exportTiledTileLayers = useCallback(() => {
    return layerStatesRef.current
      .map((layerState) =>
        getLayer(layerState.id)?.exportTiledTileLayer(layerState.name) ?? null
      )
      .filter((layer): layer is TiledTileLayer => layer !== null)
  }, [getLayer])

  const exportTiledMap = useCallback(
    (options?: {
      tilesets?: TiledTilesetRef[]
      infinite?: boolean
      orientation?: TiledMap["orientation"]
    }): TiledMap | null => {
      const tileLayers = exportTiledTileLayers()
      if (!tileLayers.length) return null

      const metrics = engineRef.current?.getGrid() ?? resolvedDocument
      const tilesets =
        options?.tilesets ??
        tilesetsRef.current.map((tileset) => tileset.toTiledTilesetRef())

      return buildTiledMap({
        tilewidth: metrics.cellSize,
        tileheight: metrics.cellSize,
        infinite: options?.infinite ?? false,
        width: metrics.cols,
        height: metrics.rows,
        orientation: options?.orientation ?? "orthogonal",
        tilesets,
        layers: tileLayers,
      })
    },
    [exportTiledTileLayers, resolvedDocument]
  )

  const importTiledMap = useCallback(
    (map: TiledMap) => {
      const tileLayers = map.layers.filter(isTiledTileLayer)

      if (!tileLayers.length) {
        clearAllLayers()
        return
      }

      for (const layer of layerInstancesRef.current.values()) {
        layer.destroy()
      }
      layerInstancesRef.current.clear()

      const nextLayers = tileLayers.map((layer, index) => ({
        id: `layer-${index + 1}`,
        name: layer.name || `Layer ${index + 1}`,
        visible: layer.visible ?? true,
      }))

      layerIdCounterRef.current = nextLayers.length + 1
      commitLayers(nextLayers, nextLayers[0]?.id)

      for (let index = 0; index < tileLayers.length; index += 1) {
        const sourceLayer = tileLayers[index]
        const targetState = nextLayers[index]
        const targetLayer = ensureLayerInstance(targetState.id)

        targetLayer?.importTiledTileLayer(sourceLayer, {
          mapWidth: map.width,
          mapHeight: map.height,
        })
        targetLayer?.setVisible(targetState.visible)
      }
      bumpRevision()
    },
    [bumpRevision, clearAllLayers, commitLayers, ensureLayerInstance]
  )

  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const engine = createLeaferEngine({
      view,
      grid: resolvedDocument,
      viewport: {
        zoomMin: 0.5,
        zoomMax: 24,
        zoomStep: 1.1,
        fitPadding: { top: 48, right: 48, bottom: 48, left: 48 },
      },
    })

    engineRef.current = engine
    syncAllLayerInstances(engine)
    syncCameraState(engine)
    engine.onCameraChange = (state) => setCameraState(state)
    updateHoverCell(null)

    const hoverOutline = new Rect({
      visible: false,
      fill: "rgba(56, 189, 248, 0.08)",
      stroke: "#38bdf8",
      strokeWidth: 1.5,
      cornerRadius: 2,
      hitChildren: false,
    })
    const stampPreviewTint = new Rect({
      visible: false,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      fill: "rgba(248, 113, 113, 0.28)",
      cornerRadius: 2,
      hitChildren: false,
    })
    const stampPreviewGroup = new Group({
      visible: false,
      opacity: 1,
      hitChildren: false,
    })
    hoverOutlineRef.current = hoverOutline
    stampPreviewGroupRef.current = stampPreviewGroup
    stampPreviewTintRef.current = stampPreviewTint
    stampPreviewNodesRef.current = []
    engine.getOverlayLayer().add(stampPreviewGroup)
    engine.getOverlayLayer().add(hoverOutline)
    syncStampPreviewNodes()
    syncStampPreviewPosition()
    setStampPreviewBlocked(false)

    let interactionMode: "idle" | "paint" | "erase" | "pan" = "idle"
    let lastCellKey = ""
    let strokeOccupiedKeys = new Set<string>()

    const getScreenPoint = (event: PointerEvent | WheelEvent) => {
      const rect = view.getBoundingClientRect()
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
    }

    const updateHoverVisual = (cell: GridCell | null) => {
      hoverCellRef.current = cell
      syncStampPreviewPosition()
    }

    const getStampFootprintKeys = (cell: GridCell) => {
      const stamp = activeStampRef.current
      if (!stamp?.cells.length) return []

      const metrics = engine.getGrid()
      const keys: string[] = []

      for (const stampCell of stamp.cells) {
        const targetCellX = cell.cellX + stampCell.offsetX
        const targetCellY = cell.cellY + stampCell.offsetY

        if (
          targetCellX < 0 ||
          targetCellY < 0 ||
          targetCellX >= metrics.cols ||
          targetCellY >= metrics.rows
        ) {
          continue
        }

        keys.push(`${targetCellX},${targetCellY}`)
      }

      return keys
    }

    const canApplyStampAt = (cell: GridCell) => {
      if (!strokeOccupiedKeys.size) return true

      return !getStampFootprintKeys(cell).some((key) => strokeOccupiedKeys.has(key))
    }

    const applyStampAt = (mode: "paint" | "erase", cell: GridCell) => {
      const stamp = activeStampRef.current
      const layer = getLayer()
      if (!stamp?.cells.length || !layer) return false

      const footprintKeys = getStampFootprintKeys(cell)
      if (!footprintKeys.length) return false
      if (strokeOccupiedKeys.size && footprintKeys.some((key) => strokeOccupiedKeys.has(key))) {
        return false
      }

      for (const stampCell of stamp.cells) {
        const targetCellX = cell.cellX + stampCell.offsetX
        const targetCellY = cell.cellY + stampCell.offsetY

        if (mode === "paint") {
          layer.setTile(targetCellX, targetCellY, stampCell.gid)
        } else {
          layer.removeTile(targetCellX, targetCellY)
        }
      }

      footprintKeys.forEach((key) => strokeOccupiedKeys.add(key))
      bumpRevision()
      return true
    }

    const paintAt = (mode: "paint" | "erase", screenX: number, screenY: number) => {
      const cell = engine.screenToCell(screenX, screenY)
      updateHoverCell(cell)
      updateHoverVisual(cell)
      if (!cell) return

      const blocked = !canApplyStampAt(cell)
      setStampPreviewBlocked(blocked)

      const cellKey = `${cell.cellX},${cell.cellY},${activeLayerIdRef.current}`
      if (cellKey === lastCellKey) return

      if (blocked) return

      const applied = applyStampAt(mode, cell)
      if (!applied) return

      setStampPreviewBlocked(false)
      lastCellKey = cellKey
    }

    const handlePointerDown = (event: PointerEvent) => {
      const point = getScreenPoint(event)

      if (event.button === 1 || (event.button === 0 && spacePressedRef.current)) {
        return // Let Leafer handle pan
      } else if (event.button === 2) {
        interactionMode = "erase"
        strokeOccupiedKeys = new Set()
        paintAt("erase", point.x, point.y)
      } else if (event.button === 0) {
        interactionMode = "paint"
        strokeOccupiedKeys = new Set()
        paintAt("paint", point.x, point.y)
      } else {
        return
      }

      view.setPointerCapture(event.pointerId)
      event.preventDefault()
    }

    const handlePointerMove = (event: PointerEvent) => {
      const point = getScreenPoint(event)
      const nextHoverCell = engine.screenToCell(point.x, point.y)
      updateHoverCell(nextHoverCell)
      updateHoverVisual(nextHoverCell)

      if (interactionMode === "paint" || interactionMode === "erase") {
        paintAt(interactionMode, point.x, point.y)
      }
    }

    const resetInteraction = (event?: PointerEvent) => {
      interactionMode = "idle"
      lastCellKey = ""
      strokeOccupiedKeys = new Set()
      setStampPreviewBlocked(false)

      if (event && view.hasPointerCapture(event.pointerId)) {
        view.releasePointerCapture(event.pointerId)
      }
    }

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault()
    }

    const handlePointerLeave = () => {
      if (interactionMode === "idle") {
        updateHoverCell(null)
        updateHoverVisual(null)
        setStampPreviewBlocked(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return
      if (isTextInputTarget(event.target)) return
      spacePressedRef.current = true
      event.preventDefault()
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return
      spacePressedRef.current = false
      if (interactionMode === "pan") {
        interactionMode = "idle"
      }
    }

    view.addEventListener("pointerdown", handlePointerDown)
    view.addEventListener("pointermove", handlePointerMove)
    view.addEventListener("pointerup", resetInteraction)
    view.addEventListener("pointercancel", resetInteraction)
    view.addEventListener("pointerleave", handlePointerLeave)
    view.addEventListener("contextmenu", handleContextMenu)
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)

    return () => {
      view.removeEventListener("pointerdown", handlePointerDown)
      view.removeEventListener("pointermove", handlePointerMove)
      view.removeEventListener("pointerup", resetInteraction)
      view.removeEventListener("pointercancel", resetInteraction)
      view.removeEventListener("pointerleave", handlePointerLeave)
      view.removeEventListener("contextmenu", handleContextMenu)
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      updateHoverCell(null)
      updateHoverVisual(null)
      setStampPreviewBlocked(false)
      hoverOutlineRef.current = null
      stampPreviewGroupRef.current = null
      stampPreviewTintRef.current = null
      stampPreviewNodesRef.current = []
      engine.destroy()

      if (engineRef.current === engine) {
        engineRef.current = null
      }
    }
  }, [
    bumpRevision,
    getLayer,
    resolvedDocument,
    syncAllLayerInstances,
    syncCameraState,
    syncStampPreviewNodes,
    syncStampPreviewPosition,
    setStampPreviewBlocked,
    updateHoverCell,
  ])

  useEffect(() => {
    syncAllLayerInstances()
  }, [resolvedDocument, syncAllLayerInstances])

  useEffect(() => {
    const layerInstances = layerInstancesRef

    return () => {
      const layersToDestroy = Array.from(layerInstances.current.values())
      layerInstances.current.clear()

      for (const layer of layersToDestroy) {
        layer.destroy()
      }
    }
  }, [])

  return {
    viewRef,
    engineRef,
    tileset,
    tilesets,
    mapMetrics: resolvedDocument,
    cameraState,
    hoverCell,
    revision,
    savedRevision,
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
    setTileset,
    markSaved,
    setTile,
    setTileGid,
    getTileGid,
    removeTile,
    clearLayer,
    clearActiveLayer,
    clearAllLayers,
    clearTiles,
    exportTiledTileLayer,
    exportTiledTileLayers,
    exportTiledMap,
    importTiledMap,
  }
}
