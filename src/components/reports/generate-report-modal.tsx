"use client"

import { useState, useMemo } from "react"
import { Loader2, Search, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { toast } from "@/lib/hooks/use-toast"

export interface StoreOption {
  id: string
  store_name: string
  client_id: string
  client_name: string
  has_klaviyo: boolean
  has_shopify: boolean
}

interface GenerateReportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stores: StoreOption[]
  onGenerated?: () => void
}

const PERIOD_OPTIONS = [
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "custom", label: "Personalizado" },
]

export function GenerateReportModal({ open, onOpenChange, stores, onGenerated }: GenerateReportModalProps) {
  const [selectedStores, setSelectedStores] = useState<Set<string>>(new Set())
  const [period, setPeriod] = useState("30d")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)

  const filteredStores = useMemo(() => {
    if (!searchQuery) return stores
    const q = searchQuery.toLowerCase()
    return stores.filter(s =>
      s.store_name.toLowerCase().includes(q) ||
      s.client_name.toLowerCase().includes(q)
    )
  }, [stores, searchQuery])

  const toggleStore = (id: string) => {
    setSelectedStores(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedStores.size === filteredStores.length) {
      setSelectedStores(new Set())
    } else {
      setSelectedStores(new Set(filteredStores.map(s => s.id)))
    }
  }

  const handleGenerate = async () => {
    if (selectedStores.size === 0) return

    setIsGenerating(true)
    try {
      const body: Record<string, unknown> = {
        store_ids: Array.from(selectedStores),
        period,
      }
      if (period === "custom") {
        body.start_date = startDate
        body.end_date = endDate
      }

      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error("Falha ao criar relatório")

      toast({
        title: "Relatório em processamento",
        description: `${selectedStores.size} loja(s) sendo processada(s).`,
      })

      onOpenChange(false)
      setSelectedStores(new Set())
      setPeriod("30d")
      setSearchQuery("")
      onGenerated?.()
    } catch {
      toast({
        variant: "destructive",
        title: "Erro ao gerar relatório",
        description: "Tente novamente.",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerar Relatório</DialogTitle>
          <DialogDescription>
            Selecione as lojas e o período para gerar o relatório.
          </DialogDescription>
        </DialogHeader>

        {/* Period */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3]">Período</label>
          <div className="flex flex-wrap gap-2">
            {PERIOD_OPTIONS.map(opt => (
              <Button
                key={opt.value}
                variant={period === opt.value ? "primary" : "secondary"}
                size="sm"
                onClick={() => setPeriod(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          {period === "custom" && (
            <div className="flex gap-2">
              <Input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="flex-1"
              />
              <Input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="flex-1"
              />
            </div>
          )}
        </div>

        {/* Store selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3]">
              Lojas ({selectedStores.size} selecionada{selectedStores.size !== 1 ? "s" : ""})
            </label>
            <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs h-7">
              {selectedStores.size === filteredStores.length ? "Desmarcar todas" : "Selecionar todas"}
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-[#5C6378]" />
            <Input
              placeholder="Buscar loja..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="max-h-[240px] overflow-y-auto space-y-1 rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] p-2">
            {filteredStores.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-[#5C6378] text-center py-4">
                Nenhuma loja encontrada
              </p>
            ) : (
              filteredStores.map(store => (
                <button
                  key={store.id}
                  type="button"
                  onClick={() => toggleStore(store.id)}
                  className={cn(
                    "w-full flex items-center gap-3 p-2.5 rounded-md text-left transition-colors",
                    selectedStores.has(store.id)
                      ? "bg-[#4E62D8]/10 dark:bg-[#7B8CEA]/10"
                      : "hover:bg-gray-50 dark:hover:bg-[#1A1D27]"
                  )}
                >
                  <div className={cn(
                    "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                    selectedStores.has(store.id)
                      ? "bg-[#4E62D8] dark:bg-[#7B8CEA] border-[#4E62D8] dark:border-[#7B8CEA]"
                      : "border-gray-300 dark:border-[#5C6378]"
                  )}>
                    {selectedStores.has(store.id) && (
                      <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                        <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
                      {store.store_name}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-[#5C6378] truncate">
                      {store.client_name}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {store.has_klaviyo && (
                      <Badge variant="neutral" showDot={false} className="text-[10px] px-1.5">K</Badge>
                    )}
                    {store.has_shopify && (
                      <Badge variant="neutral" showDot={false} className="text-[10px] px-1.5">S</Badge>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isGenerating}>
            Cancelar
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={selectedStores.size === 0 || isGenerating || (period === "custom" && (!startDate || !endDate))}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Gerar Relatório
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
