"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import {
  ArrowLeft,
  GripHorizontal,
  Plus,
  Trash2,
  X,
  Check,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { EmailResult, SliceSection } from "@/types/slicer"

interface EmailSliceEditorProps {
  result: EmailResult
  funnelName: string
  onBack: (updatedSections: SliceSection[]) => void
}

interface DragState {
  cutIndex: number
  startClientY: number
  startCutY: number
  minY: number
  maxY: number
}

const MIN_GAP = 40 // espaço mínimo entre cortes (px da imagem original)

export function EmailSliceEditor({
  result,
  funnelName,
  onBack,
}: EmailSliceEditorProps) {
  const imageUrl = `data:image/png;base64,${result.imageBase64}`
  const imageDimensions = result.dimensions || { width: 600, height: 0 }

  const [sections, setSections] = useState<SliceSection[]>(result.sections)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [displayHeight, setDisplayHeight] = useState(0)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [dragHoverY, setDragHoverY] = useState<number | null>(null)

  const updateDisplayHeight = useCallback(() => {
    if (imgRef.current) setDisplayHeight(imgRef.current.clientHeight)
  }, [])

  useEffect(() => {
    if (!imgRef.current) return
    updateDisplayHeight()
    const observer = new ResizeObserver(() => updateDisplayHeight())
    observer.observe(imgRef.current)
    return () => observer.disconnect()
  }, [updateDisplayHeight])

  // Renumera automaticamente como parte_1, parte_2, ...
  const renumber = useCallback(
    (list: SliceSection[]): SliceSection[] =>
      list.map((s, i) => ({ ...s, name: `parte_${i + 1}` })),
    []
  )

  const toDisplayY = useCallback(
    (originalY: number) =>
      displayHeight === 0
        ? 0
        : (originalY / imageDimensions.height) * displayHeight,
    [displayHeight, imageDimensions.height]
  )

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, cutIndex: number) => {
      e.preventDefault()
      e.stopPropagation()
      const section = sections[cutIndex]
      const nextSection = sections[cutIndex + 1]
      if (!section || !nextSection) return

      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

      setDragState({
        cutIndex,
        startClientY: e.clientY,
        startCutY: section.y_end,
        minY: section.y_start + MIN_GAP,
        maxY: nextSection.y_end - MIN_GAP,
      })
      setDragHoverY(section.y_end)
    },
    [sections]
  )

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragState || displayHeight === 0) return
      const deltaDisplay = e.clientY - dragState.startClientY
      const deltaOriginal =
        (deltaDisplay / displayHeight) * imageDimensions.height
      let newY = Math.round(dragState.startCutY + deltaOriginal)
      newY = Math.max(dragState.minY, Math.min(dragState.maxY, newY))
      setDragHoverY(newY)
    },
    [dragState, displayHeight, imageDimensions.height]
  )

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragState) return
      try {
        ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {
        // pointer may have already been released
      }
      if (dragHoverY !== null) {
        setSections((prev) =>
          renumber(
            prev.map((s, i) => {
              if (i === dragState.cutIndex) return { ...s, y_end: dragHoverY }
              if (i === dragState.cutIndex + 1)
                return { ...s, y_start: dragHoverY }
              return s
            })
          )
        )
      }
      setDragState(null)
      setDragHoverY(null)
    },
    [dragState, dragHoverY, renumber]
  )

  const handleRemoveCut = useCallback(
    (cutIndex: number) => {
      if (cutIndex < 0 || cutIndex >= sections.length - 1) return
      setSections((prev) => {
        const merged = prev.reduce<SliceSection[]>((acc, section, i) => {
          if (i === cutIndex) {
            acc.push({ ...section, y_end: prev[i + 1].y_end })
            return acc
          }
          if (i === cutIndex + 1) return acc
          acc.push(section)
          return acc
        }, [])
        return renumber(merged)
      })
    },
    [sections.length, renumber]
  )

  const handleAddCut = useCallback(() => {
    setSections((prev) => {
      if (prev.length === 0) return prev
      // Encontra a seção mais alta e divide no meio
      let largestIdx = 0
      let largestHeight = 0
      prev.forEach((s, i) => {
        const h = s.y_end - s.y_start
        if (h > largestHeight) {
          largestHeight = h
          largestIdx = i
        }
      })
      if (largestHeight < MIN_GAP * 2) return prev

      const target = prev[largestIdx]
      const midY = Math.round((target.y_start + target.y_end) / 2)
      const newList = [...prev]
      newList[largestIdx] = { ...target, y_end: midY }
      newList.splice(largestIdx + 1, 0, {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`,
        name: "tmp",
        y_start: midY,
        y_end: target.y_end,
      })
      return renumber(newList)
    })
  }, [renumber])

  const handleDelete = useCallback(
    (index: number) => {
      if (sections.length <= 1) return
      setSections((prev) => {
        const newList = [...prev]
        if (index === 0 && newList.length > 1) {
          newList[1] = { ...newList[1], y_start: 0 }
          newList.splice(0, 1)
        } else {
          newList[index - 1] = {
            ...newList[index - 1],
            y_end: newList[index].y_end,
          }
          newList.splice(index, 1)
        }
        return renumber(newList)
      })
    },
    [sections.length, renumber]
  )

  const cuts = sections.slice(0, -1)

  return (
    <div className="space-y-4">
      {/* Breadcrumbs + ações */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-[#8B92A5] mb-1">
              <span>{funnelName}</span>
              <span>›</span>
              <span className="text-gray-900 dark:text-[#EAEDF3] font-medium">
                {result.email.name}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-[#8B92A5] font-mono">
              {imageDimensions.width} × {imageDimensions.height}px ·{" "}
              {sections.length} {sections.length === 1 ? "parte" : "partes"}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => onBack(sections)}
          >
            <Check className="mr-2 h-4 w-4" />
            Salvar e voltar
          </Button>
        </CardContent>
      </Card>

      {/* Preview + Lista lateral */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 order-2 lg:order-1">
          <Card>
            <CardContent className="p-4">
              <div
                ref={containerRef}
                className="relative select-none w-full"
                style={{ touchAction: "none" }}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={imageUrl}
                  alt={result.email.name}
                  className="w-full h-auto block rounded-md"
                  draggable={false}
                  onLoad={updateDisplayHeight}
                />

                {/* Labels */}
                {sections.map((section) => {
                  const topY = toDisplayY(section.y_start)
                  const bottomY = toDisplayY(section.y_end)
                  const heightPx = section.y_end - section.y_start
                  return (
                    <div
                      key={`label-${section.id}`}
                      className="absolute left-0 right-0 pointer-events-none"
                      style={{
                        top: `${topY}px`,
                        height: `${bottomY - topY}px`,
                      }}
                    >
                      <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-black/70 text-white text-[10px] font-mono leading-none backdrop-blur-sm">
                        {section.name} · {imageDimensions.width}×{heightPx}px
                      </div>
                    </div>
                  )
                })}

                {/* Cut lines */}
                {cuts.map((section, cutIndex) => {
                  const isDraggingThis = dragState?.cutIndex === cutIndex
                  const renderY =
                    isDraggingThis && dragHoverY !== null
                      ? toDisplayY(dragHoverY)
                      : toDisplayY(section.y_end)

                  return (
                    <div
                      key={`cut-${section.id}`}
                      className="absolute left-0 right-0 group"
                      style={{
                        top: `${renderY}px`,
                        transform: "translateY(-1px)",
                        pointerEvents: "none",
                      }}
                    >
                      <div
                        className={cn(
                          "absolute left-0 right-0 transition-all",
                          isDraggingThis
                            ? "h-[3px] bg-[#4E62D8]"
                            : "h-[2px] bg-red-500 group-hover:h-[3px] group-hover:bg-[#4E62D8]"
                        )}
                        style={{ pointerEvents: "none" }}
                      />

                      <div
                        role="slider"
                        aria-label={`Linha de corte ${cutIndex + 1}`}
                        aria-valuemin={0}
                        aria-valuemax={imageDimensions.height}
                        aria-valuenow={dragHoverY ?? section.y_end}
                        tabIndex={0}
                        onPointerDown={(e) => handlePointerDown(e, cutIndex)}
                        className={cn(
                          "absolute left-1/2 -translate-x-1/2 -translate-y-1/2",
                          "h-7 w-7 rounded-full flex items-center justify-center",
                          "bg-white border-2 shadow-md cursor-ns-resize",
                          "transition-all",
                          isDraggingThis
                            ? "border-[#4E62D8] shadow-lg scale-110"
                            : "border-red-500 group-hover:border-[#4E62D8] group-hover:shadow-lg"
                        )}
                        style={{ pointerEvents: "auto" }}
                      >
                        <GripHorizontal className="h-3.5 w-3.5 text-gray-600" />
                      </div>

                      {isDraggingThis && dragHoverY !== null && (
                        <div
                          className="absolute left-1/2 -translate-x-1/2 -top-7 px-2 py-0.5 rounded bg-black text-white text-[10px] font-mono"
                          style={{ pointerEvents: "none" }}
                        >
                          y={dragHoverY}
                        </div>
                      )}

                      <button
                        type="button"
                        aria-label={`Remover linha ${cutIndex + 1}`}
                        onClick={() => handleRemoveCut(cutIndex)}
                        className={cn(
                          "absolute right-2 -translate-y-1/2",
                          "h-6 w-6 rounded-full flex items-center justify-center",
                          "bg-white border border-red-300 shadow-sm",
                          "opacity-0 group-hover:opacity-100 transition-opacity",
                          "hover:bg-red-50"
                        )}
                        style={{ pointerEvents: "auto" }}
                      >
                        <X className="h-3 w-3 text-red-600" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="order-1 lg:order-2">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3]">
                  Partes ({sections.length})
                </h3>
                <p className="text-[11px] text-gray-500 dark:text-[#8B92A5]">
                  Arraste as linhas para ajustar
                </p>
              </div>

              <ScrollArea className="max-h-[400px] pr-3">
                <div className="space-y-2">
                  {sections.map((section, index) => {
                    const h = section.y_end - section.y_start
                    return (
                      <div
                        key={section.id}
                        className={cn(
                          "rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
                          "bg-card p-3"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#4E62D8]/10 text-[#4E62D8] text-[10px] font-mono font-semibold">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span className="text-xs font-mono text-gray-900 dark:text-[#EAEDF3]">
                              {section.name}
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-gray-400 hover:text-red-600"
                            onClick={() => handleDelete(index)}
                            disabled={sections.length === 1}
                            aria-label={`Remover parte ${index + 1}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-[#8B92A5] font-mono mt-1">
                          <span>{imageDimensions.width} × {h}px</span>
                          <span>
                            y={section.y_start}–{section.y_end}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>

              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={handleAddCut}
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar corte
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => onBack(sections)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar ao dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
