"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { GripHorizontal, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ImageDimensions, SliceSection } from "@/types/slicer"

interface SlicePreviewProps {
  imageUrl: string
  imageDimensions: ImageDimensions
  sections: SliceSection[]
  onSectionsChange: (sections: SliceSection[]) => void
}

interface DragState {
  cutIndex: number // index of the section whose y_end we're dragging
  startClientY: number
  startCutY: number // original-pixel y_end at drag start
  minY: number // bound: y_start of this section + 1
  maxY: number // bound: y_end of next section - 1
}

export function SlicePreview({
  imageUrl,
  imageDimensions,
  sections,
  onSectionsChange,
}: SlicePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [displayHeight, setDisplayHeight] = useState(0)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [dragHoverY, setDragHoverY] = useState<number | null>(null)

  const updateDisplayHeight = useCallback(() => {
    if (imgRef.current) {
      setDisplayHeight(imgRef.current.clientHeight)
    }
  }, [])

  // Track display size with ResizeObserver
  useEffect(() => {
    if (!imgRef.current) return
    updateDisplayHeight()
    const observer = new ResizeObserver(() => updateDisplayHeight())
    observer.observe(imgRef.current)
    return () => observer.disconnect()
  }, [updateDisplayHeight])

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
        minY: section.y_start + 1,
        maxY: nextSection.y_end - 1,
      })
      setDragHoverY(section.y_end)
    },
    [sections]
  )

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragState || displayHeight === 0) return
      const deltaDisplay = e.clientY - dragState.startClientY
      const deltaOriginal = (deltaDisplay / displayHeight) * imageDimensions.height
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
        const newSections = sections.map((s, i) => {
          if (i === dragState.cutIndex) return { ...s, y_end: dragHoverY }
          if (i === dragState.cutIndex + 1) return { ...s, y_start: dragHoverY }
          return s
        })
        onSectionsChange(newSections)
      }
      setDragState(null)
      setDragHoverY(null)
    },
    [dragState, dragHoverY, sections, onSectionsChange]
  )

  const handleRemoveCut = useCallback(
    (cutIndex: number) => {
      // merge section[cutIndex] and section[cutIndex+1] into one
      if (cutIndex < 0 || cutIndex >= sections.length - 1) return
      const merged = sections.reduce<SliceSection[]>((acc, section, i) => {
        if (i === cutIndex) {
          acc.push({ ...section, y_end: sections[i + 1].y_end })
          return acc
        }
        if (i === cutIndex + 1) return acc
        acc.push(section)
        return acc
      }, [])
      onSectionsChange(merged)
    },
    [sections, onSectionsChange]
  )

  const toDisplayY = useCallback(
    (originalY: number) =>
      displayHeight === 0
        ? 0
        : (originalY / imageDimensions.height) * displayHeight,
    [displayHeight, imageDimensions.height]
  )

  const cuts = sections.slice(0, -1)

  return (
    <div
      ref={containerRef}
      className="relative select-none w-full"
      style={{ touchAction: "none" }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Imagem do email */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={imageUrl}
        alt="Email para fatiar"
        className="w-full h-auto block rounded-md"
        draggable={false}
        onLoad={updateDisplayHeight}
      />

      {/* Section labels */}
      {sections.map((section, index) => {
        const topY = toDisplayY(section.y_start)
        const bottomY = toDisplayY(section.y_end)
        const heightPx = section.y_end - section.y_start
        // Se o nome já tem prefixo NN_, usa ele; senão gera do index
        const hasPrefix = /^\d{2}_/.test(section.name)
        const displayLabel = hasPrefix
          ? section.name
          : `${String(index + 1).padStart(2, "0")}_${section.name}`
        return (
          <div
            key={`label-${section.id}`}
            className="absolute left-0 right-0 pointer-events-none"
            style={{ top: `${topY}px`, height: `${bottomY - topY}px` }}
          >
            <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-black/70 text-white text-[10px] font-mono leading-none backdrop-blur-sm">
              {displayLabel} · {imageDimensions.width}×{heightPx}px
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
            {/* The line itself */}
            <div
              className={cn(
                "absolute left-0 right-0 transition-all",
                isDraggingThis
                  ? "h-[3px] bg-[#4E62D8]"
                  : "h-[2px] bg-red-500 group-hover:h-[3px] group-hover:bg-[#4E62D8]"
              )}
              style={{ pointerEvents: "none" }}
            />

            {/* Drag handle */}
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

            {/* Coordinate tooltip when dragging */}
            {isDraggingThis && dragHoverY !== null && (
              <div
                className="absolute left-1/2 -translate-x-1/2 -top-7 px-2 py-0.5 rounded bg-black text-white text-[10px] font-mono"
                style={{ pointerEvents: "none" }}
              >
                y={dragHoverY}
              </div>
            )}

            {/* Remove cut button */}
            <button
              type="button"
              aria-label={`Remover linha de corte ${cutIndex + 1}`}
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
  )
}
