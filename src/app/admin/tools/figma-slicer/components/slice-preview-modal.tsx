"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, Download, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import type { ImageDimensions, SliceSection } from "@/types/slicer"
import { detectSectionWarnings } from "./slice-list"

interface SlicePreviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sections: SliceSection[]
  imageUrl: string
  imageDimensions: ImageDimensions
  onConfirmExport: () => void
  isExporting: boolean
}

/**
 * Modal de verificação final. Renderiza cada fatia INDIVIDUALMENTE
 * usando a imagem original como background com offset negativo —
 * o usuário vê EXATAMENTE como cada slice vai ficar no ZIP.
 *
 * Exige checkbox "confirmo que revisei" para habilitar o botão de
 * download. Essa é a última barreira antes de enviar algo pra loja.
 */
export function SlicePreviewModal({
  open,
  onOpenChange,
  sections,
  imageUrl,
  imageDimensions,
  onConfirmExport,
  isExporting,
}: SlicePreviewModalProps) {
  const [hasReviewed, setHasReviewed] = useState(false)

  // Cada fatia será renderizada numa caixa com height proporcional
  // e o background mostrando APENAS a parte correspondente da imagem.
  const slicesWithWarnings = useMemo(
    () =>
      sections.map((section) => ({
        section,
        warnings: detectSectionWarnings(
          section,
          sections,
          imageDimensions.height
        ),
      })),
    [sections, imageDimensions.height]
  )

  const totalWarnings = slicesWithWarnings.reduce(
    (sum, { warnings }) => sum + warnings.length,
    0
  )

  const handleConfirm = () => {
    if (!hasReviewed) return
    onConfirmExport()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)]">
          <DialogTitle className="flex items-center gap-2">
            Revisão final dos cortes
          </DialogTitle>
          <DialogDescription>
            Veja exatamente como cada fatia vai ficar no ZIP. Confira se nenhum
            corte atravessa texto, botões ou imagens antes de baixar.
          </DialogDescription>
        </DialogHeader>

        {totalWarnings > 0 && (
          <div className="mx-6 mt-4 rounded-[8px] bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800 dark:text-amber-300">
              <strong>{totalWarnings}</strong> {totalWarnings === 1 ? "aviso" : "avisos"}{" "}
              detectado{totalWarnings > 1 ? "s" : ""}. Verifique as fatias
              marcadas antes de exportar.
            </div>
          </div>
        )}

        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-4">
            {slicesWithWarnings.map(({ section, warnings }, index) => {
              const sliceHeight = section.y_end - section.y_start
              // Calcula a altura visual proporcional (para caber no modal)
              // Máximo 400px de altura no preview, mantém aspect ratio
              const aspectRatio = sliceHeight / imageDimensions.width
              const displayWidth = Math.min(540, imageDimensions.width)
              const displayHeight = Math.min(400, displayWidth * aspectRatio)
              const scaleFactor = displayWidth / imageDimensions.width

              // Offset negativo do background = y_start da seção * scale
              const bgOffsetY = -Math.round(section.y_start * scaleFactor)
              // Tamanho do background = imagem inteira na escala
              const bgHeight = Math.round(imageDimensions.height * scaleFactor)

              const prefixMatch = section.name.match(/^(\d{2})_(.*)$/)
              const displayNumber = prefixMatch
                ? prefixMatch[1]
                : String(index + 1).padStart(2, "0")
              const displayName = prefixMatch ? prefixMatch[2] : section.name

              return (
                <div
                  key={section.id}
                  className={cn(
                    "rounded-[8px] border overflow-hidden",
                    warnings.length > 0
                      ? "border-amber-400 dark:border-amber-600/60"
                      : "border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]"
                  )}
                >
                  <div
                    className={cn(
                      "px-3 py-2 flex items-center justify-between gap-2",
                      warnings.length > 0
                        ? "bg-amber-50 dark:bg-amber-900/20"
                        : "bg-gray-50 dark:bg-[#1A1D27]"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded bg-[#4E62D8]/10 text-[#4E62D8] text-[10px] font-mono font-semibold">
                        {displayNumber}
                      </span>
                      <span className="text-xs font-mono font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
                        {displayName}.png
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-500 dark:text-[#8B92A5] font-mono shrink-0">
                      600 × {sliceHeight}px
                    </span>
                  </div>

                  <div
                    className="relative bg-gray-100 dark:bg-[#0F1117] mx-auto"
                    style={{
                      width: `${displayWidth}px`,
                      height: `${displayHeight}px`,
                      backgroundImage: `url(${imageUrl})`,
                      backgroundPosition: `0 ${bgOffsetY}px`,
                      backgroundSize: `${displayWidth}px ${bgHeight}px`,
                      backgroundRepeat: "no-repeat",
                    }}
                  />

                  {warnings.length > 0 && (
                    <div className="px-3 py-2 bg-amber-50/50 dark:bg-amber-900/10 border-t border-amber-200 dark:border-amber-900/30">
                      <ul className="space-y-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                        {warnings.map((w, widx) => (
                          <li key={widx} className="flex items-start gap-1">
                            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                            <span>{w}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)] flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <div className="flex items-center gap-2">
            <Checkbox
              id="review-confirm"
              checked={hasReviewed}
              onCheckedChange={(checked) => setHasReviewed(checked === true)}
            />
            <Label
              htmlFor="review-confirm"
              className="text-xs text-gray-700 dark:text-[#EAEDF3] cursor-pointer"
            >
              Revisei visualmente todas as fatias e estão corretas
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isExporting}
            >
              Voltar ajustar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirm}
              disabled={!hasReviewed || isExporting}
            >
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Gerando ZIP...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                  Confirmar e baixar
                </>
              )}
            </Button>
          </div>
        </DialogFooter>

        <div className="px-6 pb-4">
          <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-[#8B92A5]">
            <Download className="h-3 w-3" />
            <span>
              {sections.length} fatias · 600px × proporcional · padrão Klaviyo/Omnisend
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
