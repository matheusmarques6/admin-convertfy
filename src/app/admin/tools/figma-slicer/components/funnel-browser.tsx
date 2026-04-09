"use client"

import { useState } from "react"
import { ArrowLeft, ChevronDown, ChevronRight, FileText } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { FigmaEmail, FigmaFileStructure } from "@/types/slicer"

interface FunnelBrowserProps {
  structure: FigmaFileStructure
  onEmailSelected: (email: FigmaEmail, funnelName: string) => void
  onBack: () => void
}

export function FunnelBrowser({
  structure,
  onEmailSelected,
  onBack,
}: FunnelBrowserProps) {
  // Começa com todos os funis abertos
  const initialOpen = new Set<string>()
  for (const page of structure.pages) {
    for (const funnel of page.funnels) {
      initialOpen.add(funnel.id)
    }
  }
  const [openFunnels, setOpenFunnels] = useState<Set<string>>(initialOpen)

  const toggleFunnel = (funnelId: string) => {
    setOpenFunnels((prev) => {
      const next = new Set(prev)
      if (next.has(funnelId)) {
        next.delete(funnelId)
      } else {
        next.add(funnelId)
      }
      return next
    })
  }

  const totalFunnels = structure.pages.reduce(
    (sum, p) => sum + p.funnels.length,
    0
  )
  const totalEmails = structure.pages.reduce(
    (sum, p) => sum + p.funnels.reduce((s, f) => s + f.emails.length, 0),
    0
  )

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
              Verifique se o arquivo tem frames organizados em funis.
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
              {totalFunnels} {totalFunnels === 1 ? "funil" : "funis"} · {totalEmails}{" "}
              {totalEmails === 1 ? "email" : "emails"}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Trocar arquivo
          </Button>
        </CardContent>
      </Card>

      {structure.pages.map((page) =>
        page.funnels.map((funnel) => {
          const isOpen = openFunnels.has(funnel.id)
          return (
            <Card key={funnel.id}>
              <CardContent className="p-0">
                <button
                  type="button"
                  onClick={() => toggleFunnel(funnel.id)}
                  className={cn(
                    "w-full flex items-center justify-between gap-3 px-4 py-3",
                    "hover:bg-gray-50 dark:hover:bg-[#1A1D27] transition-colors",
                    "text-left"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />
                    )}
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3] truncate">
                      {funnel.name}
                    </h3>
                  </div>
                  <span className="text-[11px] text-gray-500 dark:text-[#8B92A5] font-mono shrink-0">
                    {funnel.emails.length}{" "}
                    {funnel.emails.length === 1 ? "email" : "emails"}
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)] p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {funnel.emails.map((email) => (
                        <button
                          key={email.id}
                          type="button"
                          onClick={() => onEmailSelected(email, funnel.name)}
                          className={cn(
                            "rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
                            "bg-card p-3 text-left cursor-pointer transition-all",
                            "hover:border-[#4E62D8] hover:shadow-md hover:-translate-y-0.5",
                            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4E62D8] focus-visible:ring-offset-2"
                          )}
                        >
                          <div className="h-20 rounded-[6px] bg-gradient-to-br from-[#4E62D8]/10 to-[#7B8CEA]/5 mb-2 flex items-center justify-center">
                            <FileText className="h-6 w-6 text-[#4E62D8]/60" />
                          </div>
                          <p className="text-xs font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
                            {email.name}
                          </p>
                          {email.width && email.height && (
                            <p className="text-[10px] text-gray-500 dark:text-[#8B92A5] font-mono mt-0.5">
                              {email.width} × {email.height}px
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })
      )}
    </div>
  )
}
