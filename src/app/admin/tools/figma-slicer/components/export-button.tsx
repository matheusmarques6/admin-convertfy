"use client"

import { Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ExportButtonProps {
  onExport: () => void
  isExporting: boolean
  sectionsCount: number
}

export function ExportButton({
  onExport,
  isExporting,
  sectionsCount,
}: ExportButtonProps) {
  const disabled = isExporting || sectionsCount === 0

  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={onExport}
        disabled={disabled}
      >
        {isExporting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Gerando slices...
          </>
        ) : (
          <>
            <Download className="mr-2 h-4 w-4" />
            Exportar {sectionsCount} {sectionsCount === 1 ? "slice" : "slices"} como ZIP
          </>
        )}
      </Button>
      <p className="text-[11px] text-center text-gray-500 dark:text-[#8B92A5]">
        Redimensionado para 600px (padrão Klaviyo/Omnisend)
      </p>
    </div>
  )
}
