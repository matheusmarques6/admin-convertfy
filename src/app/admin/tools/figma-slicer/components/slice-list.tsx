"use client"

import { useCallback } from "react"
import { Plus, Trash2, RotateCcw } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { ImageDimensions, SliceSection } from "@/types/slicer"

interface SliceListProps {
  sections: SliceSection[]
  imageDimensions: ImageDimensions
  onSectionsChange: (sections: SliceSection[]) => void
  analysisTime?: number
  onReanalyze?: () => void
  isReanalyzing?: boolean
}

function sanitizeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
}

export function SliceList({
  sections,
  imageDimensions,
  onSectionsChange,
  analysisTime,
  onReanalyze,
  isReanalyzing,
}: SliceListProps) {
  const handleNameChange = useCallback(
    (id: string, newName: string) => {
      onSectionsChange(
        sections.map((s) => (s.id === id ? { ...s, name: sanitizeName(newName) || s.name } : s))
      )
    },
    [sections, onSectionsChange]
  )

  const handleRemove = useCallback(
    (index: number) => {
      if (sections.length === 1) {
        // Cannot remove the only section — keep it as the whole image
        return
      }
      // Merge with previous section (or with next if removing the first)
      const merged = [...sections]
      if (index === 0) {
        merged[1] = { ...merged[1], y_start: 0 }
        merged.splice(0, 1)
      } else {
        merged[index - 1] = {
          ...merged[index - 1],
          y_end: merged[index].y_end,
        }
        merged.splice(index, 1)
      }
      onSectionsChange(merged)
    },
    [sections, onSectionsChange]
  )

  const handleAddCut = useCallback(() => {
    // Find the largest section and split it in half
    if (sections.length === 0) return
    let largestIdx = 0
    let largestHeight = 0
    sections.forEach((s, i) => {
      const h = s.y_end - s.y_start
      if (h > largestHeight) {
        largestHeight = h
        largestIdx = i
      }
    })
    if (largestHeight < 4) return // not enough space to split

    const target = sections[largestIdx]
    const midY = Math.round((target.y_start + target.y_end) / 2)
    const newSection: SliceSection = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
      name: `section_${sections.length + 1}`,
      y_start: midY,
      y_end: target.y_end,
    }
    const updated = [...sections]
    updated[largestIdx] = { ...target, y_end: midY }
    updated.splice(largestIdx + 1, 0, newSection)
    onSectionsChange(updated)
  }, [sections, onSectionsChange])

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">
          Seções detectadas ({sections.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ScrollArea className="max-h-[420px] pr-3">
          <div className="space-y-2">
            {sections.map((section, index) => {
              const height = section.y_end - section.y_start
              return (
                <div
                  key={section.id}
                  className={cn(
                    "rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
                    "bg-card p-3 space-y-2"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#4E62D8]/10 text-[#4E62D8] text-[10px] font-mono font-semibold">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <Input
                        value={section.name}
                        onChange={(e) => handleNameChange(section.id, e.target.value)}
                        className="h-7 text-xs font-mono px-2"
                        spellCheck={false}
                        aria-label={`Nome da seção ${index + 1}`}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-gray-400 hover:text-red-600"
                      onClick={() => handleRemove(index)}
                      disabled={sections.length === 1}
                      aria-label={`Remover seção ${index + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-[#8B92A5] font-mono">
                    <span>
                      {imageDimensions.width} × {height}px
                    </span>
                    <span>
                      y={section.y_start}–{section.y_end}
                    </span>
                  </div>
                  {section.description && (
                    <p className="text-[11px] text-gray-500 dark:text-[#8B92A5] line-clamp-2">
                      {section.description}
                    </p>
                  )}
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

        <div className="space-y-2 pt-2 border-t border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          {typeof analysisTime === "number" && analysisTime > 0 && (
            <p className="text-[11px] text-gray-500 dark:text-[#8B92A5]">
              Analisado em {(analysisTime / 1000).toFixed(1)}s pela IA
            </p>
          )}
          {onReanalyze && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={onReanalyze}
              disabled={isReanalyzing}
            >
              <RotateCcw className={cn("mr-2 h-3 w-3", isReanalyzing && "animate-spin")} />
              {isReanalyzing ? "Re-analisando..." : "Re-analisar com IA"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
