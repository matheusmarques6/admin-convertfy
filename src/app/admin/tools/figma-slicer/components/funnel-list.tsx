"use client"

import { ArrowLeft, FileText, Zap } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { FigmaFileStructure, FigmaFunnel } from "@/types/slicer"

interface FunnelListProps {
  structure: FigmaFileStructure
  onProcessFunnel: (funnel: FigmaFunnel) => void
  onBack: () => void
}

export function FunnelList({
  structure,
  onProcessFunnel,
  onBack,
}: FunnelListProps) {
  // Flatten: todos os funis de todas as pages num único array
  const allFunnels: FigmaFunnel[] = structure.pages.flatMap((p) => p.funnels)
  const totalFunnels = allFunnels.length
  const totalEmails = allFunnels.reduce((sum, f) => sum + f.emailCount, 0)

  if (totalFunnels === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-3">
          <div className="h-12 w-12 rounded-full bg-gray-100 dark:bg-[#242836] flex items-center justify-center mx-auto">
            <FileText className="h-6 w-6 text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3]">
              Nenhum funil encontrado
            </p>
            <p className="text-xs text-gray-500 dark:text-[#8B92A5] mt-1">
              Verifique se o arquivo tem frames de emails (≥ 400 × 300px)
              dentro de frames de funil.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-500 dark:text-[#8B92A5] uppercase tracking-wide">
              Arquivo Figma
            </p>
            <h2 className="text-base font-semibold text-gray-900 dark:text-[#EAEDF3] truncate">
              {structure.name}
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-[#8B92A5] mt-0.5">
              {totalFunnels} {totalFunnels === 1 ? "funil" : "funis"} ·{" "}
              {totalEmails} {totalEmails === 1 ? "email" : "emails"}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Trocar arquivo
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
        {allFunnels.map((funnel) => (
          <Card key={funnel.id}>
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3] truncate">
                  {funnel.name}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="info" showDot={false}>
                    {funnel.emailCount}{" "}
                    {funnel.emailCount === 1 ? "email" : "emails"}
                  </Badge>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => onProcessFunnel(funnel)}
                className="shrink-0"
              >
                <Zap className="mr-2 h-3.5 w-3.5" />
                Processar funil
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
