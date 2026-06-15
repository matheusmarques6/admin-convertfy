"use client"

import { useMemo, useState } from "react"
import { Filter, X, ChevronDown, Loader2, Layers } from "lucide-react"
import {
  PRODUCTION_BUCKETS,
  type ProductionBucketKey,
} from "@/types/campaign-production"
import { useProduction } from "@/app/admin/campaigns/central/use-production"
import { bucketOf } from "./helpers"
import { ProductionCard } from "./production-card"
import { DesignerModal } from "./designer-modal"

export function ProductionTab() {
  const { productions, designers, isLoading, updateStore } = useProduction(true)
  const [stageFilter, setStageFilter] = useState<ProductionBucketKey | "todas">("todas")
  const [designerFilter, setDesignerFilter] = useState<string | "todos">("todos")
  const [task, setTask] = useState<{ campaignId: string; storeIndex: number } | null>(null)

  const counts = useMemo(() => {
    const c: Record<ProductionBucketKey, number> = { design: 0, revisao: 0, agendado: 0, enviado: 0 }
    for (const p of productions) for (const s of p.stores) c[bucketOf(s.prod_stage)]++
    return c
  }, [productions])

  const visible = productions.filter((p) =>
    p.stores.some((s) => {
      if (stageFilter !== "todas" && bucketOf(s.prod_stage) !== stageFilter) return false
      if (designerFilter !== "todos" && s.designer_id !== designerFilter) return false
      return true
    }),
  )

  const modalCampaign = task ? productions.find((p) => p.id === task.campaignId) ?? null : null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
        <Loader2 size={16} className="animate-spin" /> Carregando produção…
      </div>
    )
  }

  if (productions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[6px] border border-dashed border-border bg-card/50 px-6 py-12 text-center">
        <Layers size={28} className="text-muted-foreground/60" />
        <div className="text-[13.5px] font-medium text-muted-foreground">
          Nenhuma campanha em produção. Aprove sugestões para enviá-las aos designers.
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1080px]">
      {/* Resumo clicável por estágio */}
      <div className="mb-4 flex flex-wrap gap-3">
        {PRODUCTION_BUCKETS.map((b) => {
          const on = stageFilter === b.key
          const label = b.label === "Design" ? "Em design" : b.label === "Revisão" ? "Em revisão" : b.label + "s"
          return (
            <button
              key={b.key}
              onClick={() => setStageFilter(on ? "todas" : b.key)}
              className="min-w-[150px] flex-1 rounded-[6px] border bg-card px-4 py-3 text-left transition-colors"
              style={{
                borderColor: on ? b.color : undefined,
                boxShadow: on ? `0 0 0 1px ${b.color}` : undefined,
              }}
            >
              <div className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full" style={{ background: b.color }} />
                <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {label}
                </span>
              </div>
              <div className="mt-1 text-[22px] font-bold tabular-nums text-foreground">
                {counts[b.key]}
              </div>
            </button>
          )
        })}
      </div>

      {/* Filtros globais */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Filter size={13} /> Filtrar:
        </span>
        {stageFilter !== "todas" && (
          <button
            onClick={() => setStageFilter("todas")}
            className="inline-flex items-center gap-1.5 rounded-full border border-foreground bg-foreground px-2.5 py-1 text-[12.5px] font-semibold text-background"
          >
            {PRODUCTION_BUCKETS.find((b) => b.key === stageFilter)?.label}
            <X size={12} />
          </button>
        )}
        <div className="relative inline-flex items-center">
          <select
            value={designerFilter}
            onChange={(e) => setDesignerFilter(e.target.value)}
            className={`cursor-pointer appearance-none rounded-full border bg-card py-1.5 pl-3 pr-7 text-[12.5px] font-medium outline-none ${
              designerFilter === "todos" ? "border-border text-muted-foreground" : "border-primary text-primary"
            }`}
          >
            <option value="todos">Todos os designers</option>
            {designers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-2.5 text-muted-foreground" />
        </div>
        {(stageFilter !== "todas" || designerFilter !== "todos") && (
          <button
            onClick={() => {
              setStageFilter("todas")
              setDesignerFilter("todos")
            }}
            className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-4">
        {visible.length === 0 && (
          <div className="rounded-[6px] border border-dashed border-border bg-card/50 px-6 py-10 text-center text-[13px] text-muted-foreground">
            Nenhuma campanha com esse filtro.
          </div>
        )}
        {visible.map((p) => (
          <ProductionCard
            key={p.id}
            campaign={p}
            designers={designers}
            stageFilter={stageFilter}
            designerFilter={designerFilter}
            onUpdateStore={(storeId, patch) => updateStore(p.id, storeId, patch)}
            onOpenStore={(storeIndex) => setTask({ campaignId: p.id, storeIndex })}
          />
        ))}
      </div>

      <DesignerModal
        campaign={modalCampaign}
        storeIndex={task?.storeIndex ?? 0}
        designers={designers}
        onClose={() => setTask(null)}
        onUpdateStore={(storeId, patch) => {
          if (modalCampaign) updateStore(modalCampaign.id, storeId, patch)
        }}
      />
    </div>
  )
}
