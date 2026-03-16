import { Button } from "@/components/ui/button"
import type { EditorLayerState } from "@/hooks/use-leafer-engine"
import { PanelCard } from "./panel-card"
import { 
  Eye, 
  EyeOff, 
  Trash2, 
  Copy, 
  Plus,
  Layers,
  GripVertical,
  Edit2
} from "lucide-react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useRef } from "react"

type LayersColumnProps = {
  layers: EditorLayerState[]
  activeLayerId: string
  onSetActiveLayerId: (layerId: string) => void
  onAddLayer: () => void
  onRemoveLayer: (layerId: string) => void
  onDuplicateLayer: (layerId: string) => void
  onReorderLayers: (layerIds: string[]) => void
  onRenameLayer: (layerId: string, name: string) => void
  onToggleLayerVisibility: (layerId: string) => void
}

function SortableLayerItem({ 
  layer, 
  isActive, 
  total,
  onSelect,
  onRemove,
  onDuplicate,
  onRename,
  onToggleVisibility 
}: { 
  layer: EditorLayerState
  isActive: boolean
  total: number
  onSelect: () => void
  onRemove: () => void
  onDuplicate: () => void
  onRename: (name: string) => void
  onToggleVisibility: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: layer.id })

  const inputRef = useRef<HTMLInputElement>(null)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  }

  const handleRenameClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    inputRef.current?.focus()
    inputRef.current?.select()
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`group flex flex-col gap-2 rounded-xl border p-2 transition-all duration-200 cursor-pointer ${
        isActive
          ? "border-cyan-400/50 bg-cyan-400/10 ring-1 ring-cyan-400/20"
          : "border-white/5 bg-white/5 hover:bg-white/10"
      } ${isDragging ? "opacity-50 shadow-2xl" : ""}`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded-lg text-slate-600 hover:text-slate-400 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
          isActive 
            ? "bg-cyan-400 text-slate-950" 
            : "bg-white/10 text-slate-400"
        }`}>
          <Layers className="h-4 w-4" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <input
            ref={inputRef}
            type="text"
            value={layer.name}
            onClick={(e) => e.stopPropagation()}
            onChange={(event) => onRename(event.target.value)}
            className={`w-full bg-transparent px-1 py-0.5 text-xs font-medium outline-none transition-colors ${
              isActive ? "text-cyan-100" : "text-slate-300"
            }`}
            placeholder="Layer Name"
          />
        </div>

        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
           <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-white hover:bg-white/10"
            onClick={handleRenameClick}
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/5 pt-2">
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 transition-colors ${
              layer.visible 
                ? "text-emerald-400 hover:bg-emerald-400/10 hover:text-emerald-300" 
                : "text-slate-500 hover:bg-white/10"
            }`}
            onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
          >
            {layer.visible ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-white hover:bg-white/10"
            onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-slate-500 hover:bg-rose-500/20 hover:text-rose-400 disabled:opacity-20"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          disabled={total <= 1}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

export function LayersColumn(props: LayersColumnProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const reversedLayers = [...props.layers].reverse()
      const oldIndex = reversedLayers.findIndex((l) => l.id === active.id)
      const newIndex = reversedLayers.findIndex((l) => l.id === over.id)
      
      const newReversed = arrayMove(reversedLayers, oldIndex, newIndex)
      props.onReorderLayers([...newReversed].reverse().map(l => l.id))
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PanelCard
        title="Layers"
        description="管理绘制层级。高亮层为当前活动层。"
        action={
          <Button
            size="sm"
            onClick={props.onAddLayer}
            className="h-7 w-7 rounded-full bg-cyan-400 p-0 text-slate-950 hover:bg-cyan-300"
          >
            <Plus className="h-4 w-4" />
          </Button>
        }
      >
        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="space-y-2">
            <SortableContext 
              items={[...props.layers].reverse().map(l => l.id)}
              strategy={verticalListSortingStrategy}
            >
              {[...props.layers].reverse().map((layer) => (
                <SortableLayerItem
                  key={layer.id}
                  layer={layer}
                  total={props.layers.length}
                  isActive={layer.id === props.activeLayerId}
                  onSelect={() => props.onSetActiveLayerId(layer.id)}
                  onRemove={() => props.onRemoveLayer(layer.id)}
                  onDuplicate={() => props.onDuplicateLayer(layer.id)}
                  onRename={(name) => props.onRenameLayer(layer.id, name)}
                  onToggleVisibility={() => props.onToggleLayerVisibility(layer.id)}
                />
              ))}
            </SortableContext>
          </div>
        </DndContext>
      </PanelCard>
    </div>
  )
}
