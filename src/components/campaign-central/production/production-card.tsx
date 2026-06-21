"use client"

import { useState } from "react"
import { ChevronDown, Search, ChevronRight, Check, Edit3, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  PRODUCTION_BUCKETS,
  PRODUCTION_STEP_COUNT,
  type ProductionBucketKey,
  type ProductionCampaign,
  type ProductionDesigner,
} from "@/types/campaign-production"
import {
  bucketCounts,
  bucketOf,
  campaignProgress,
  designerInitials,
  LANG_LABEL,
  PRODUCTION_TYPE_META,
  sendLabel,
  storeBrand,
  storeInitials,
} from "./helpers"
import { StageBar } from "./stage-bar"
import { StorePipeline } from "./store-pipeline"
import { DesignerPicker } from "./designer-picker"

function StoreGlyph({ name, size = 28 }: { name: string; size?: number }) {
  const b = storeBrand(name)
  return (
    <span
      style={{ width: size, height: size, background: b.primary }}
      className="inline-flex shrink-0 items-center justify-center rounded-[7px] text-[10px] font-bold text-white"
    >
      {storeInitials(name)}
    </span>
  )
}

interface Props {
  campaign: ProductionCampaign
  designers: ProductionDesigner[]
  stageFilter: ProductionBucketKey | "todas"
  designerFilter: string | "todos"
  onUpdateStore: (storeId: string, patch: { prod_stage?: number; designer_id?: string | null }) => void
  onOpenStore: (storeIndex: number) => void
  /** Quando passado e a campanha é rascunho, renderiza botão "Editar copy"
   *  que abre o CopyPanel pro fluxo de teste + aprovação. */
  onOpenCopy?: (pipelineItemId: string) => Promise<void> | void
}

export function ProductionCard({
  campaign,
  designers,
  stageFilter,
  designerFilter,
  onUpdateStore,
  onOpenStore,
  onOpenCopy,
}: Props) {
  const [openingCopy, setOpeningCopy] = useState(false)
  const meta = PRODUCTION_TYPE_META[campaign.type] ?? PRODUCTION_TYPE_META.avulsa
  const pct = campaignProgress(campaign)
  const urgent = campaign.send_in != null && campaign.send_in <= 3
  const many = campaign.stores.length > 6
  const filtering = stageFilter !== "todas" || designerFilter !== "todos"
  const [open, setOpen] = useState(!many)
  const [q, setQ] = useState("")
  const [rowStage, setRowStage] = useState<ProductionBucketKey | "todas">("todas")

  const c = bucketCounts(campaign.stores)
  const designerIds = [
    ...new Set(campaign.stores.map((s) => s.designer_id).filter(Boolean)),
  ] as string[]

  const rows = campaign.stores.filter((s) => {
    if (stageFilter !== "todas" && bucketOf(s.prod_stage) !== stageFilter) return false
    if (designerFilter !== "todos" && s.designer_id !== designerFilter) return false
    if (rowStage !== "todas" && bucketOf(s.prod_stage) !== rowStage) return false
    if (q && !s.store_name.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })
  const expanded = open || filtering

  return (
    <div className="overflow-hidden rounded-[6px] border border-border bg-card shadow-sm transition-colors duration-150 hover:border-foreground/15">
      {/* Header */}
      <div className="px-4 pt-4 pb-3.5">
        <div className="mb-2.5 flex items-center gap-2">
          <Badge variant={meta.tone}>{meta.label}</Badge>
          {campaign.is_draft && <Badge variant="neutral">Rascunho</Badge>}
          <Badge variant={urgent ? "warning" : "neutral"} showDot>
            {sendLabel(campaign.send_in, campaign.send_date)}
          </Badge>
          <div className="flex-1" />
          {campaign.is_draft && onOpenCopy && (
            <button
              type="button"
              onClick={async () => {
                if (openingCopy) return
                setOpeningCopy(true)
                try {
                  await onOpenCopy(campaign.id)
                } finally {
                  setOpeningCopy(false)
                }
              }}
              disabled={openingCopy}
              className="inline-flex items-center gap-1 rounded-[4px] border border-primary/30 bg-primary/5 px-2 py-1 text-[11.5px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-60"
              title="Abre o painel de adaptação por loja: gere copies de teste, marque a melhor como 'Boa' e aprove pros designers"
            >
              {openingCopy ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Edit3 size={12} />
              )}
              Editar copy / Aprovar
            </button>
          )}
          <span className="text-[11.5px] text-muted-foreground">{campaign.channel}</span>
        </div>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[16px] font-semibold tracking-tight text-foreground">
              {campaign.title}
            </div>
            {campaign.subject && (
              <div className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                &ldquo;{campaign.subject}&rdquo;
              </div>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Progresso
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 w-[90px] overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full ${pct === 100 ? "bg-emerald-500" : "bg-primary"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span
                className={`text-[12.5px] font-bold tabular-nums ${
                  pct === 100 ? "text-emerald-600" : "text-foreground"
                }`}
              >
                {pct}%
              </span>
            </div>
          </div>
        </div>
        <StageBar stores={campaign.stores} />
      </div>

      {/* Barra de lojas (resumo + toggle) */}
      <div className="flex items-center gap-3 border-t border-border/60 bg-muted/30 px-4 py-2.5">
        <span className="text-[12px] font-semibold tabular-nums text-foreground">
          {campaign.stores.length} {campaign.stores.length === 1 ? "loja" : "lojas"}
        </span>
        <div className="flex items-center">
          {designerIds.slice(0, 4).map((id, i) => {
            const d = designers.find((x) => x.id === id)
            return (
              <span
                key={id}
                className="inline-flex size-[22px] items-center justify-center rounded-full border-2 border-muted bg-primary/10 text-[9px] font-semibold text-primary"
                style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 4 - i }}
                title={d?.name}
              >
                {designerInitials(d?.name ?? "?")}
              </span>
            )
          })}
          {designerIds.length > 4 && (
            <span className="ml-1 text-[11px] text-muted-foreground">+{designerIds.length - 4}</span>
          )}
        </div>
        <div className="flex-1" />
        {!filtering && many && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary"
          >
            {open ? "Recolher" : `Ver ${campaign.stores.length} lojas`}
            <ChevronDown
              size={14}
              className={`transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>

      {/* Lista de lojas */}
      {expanded && (
        <div>
          {many && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-2.5">
              {[{ k: "todas" as const, l: "Todas" }, ...PRODUCTION_BUCKETS.map((b) => ({ k: b.key, l: b.label }))].map(
                (f) => {
                  const on = rowStage === f.k
                  const n = f.k === "todas" ? campaign.stores.length : c[f.k as ProductionBucketKey]
                  return (
                    <button
                      key={f.k}
                      onClick={() => setRowStage(f.k as ProductionBucketKey | "todas")}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium ${
                        on
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-card text-muted-foreground hover:border-foreground/30"
                      }`}
                    >
                      {f.l}
                      <span className="text-[10.5px] font-bold tabular-nums opacity-80">{n}</span>
                    </button>
                  )
                },
              )}
              <div className="flex-1" />
              <div className="relative inline-flex items-center">
                <Search size={13} className="pointer-events-none absolute left-2.5 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar loja…"
                  className="w-40 rounded-md border border-border bg-card py-1.5 pl-7 pr-2.5 text-[12.5px] text-foreground outline-none focus:border-primary"
                />
              </div>
            </div>
          )}

          {/* Cabeçalho da lista */}
          <div className="flex items-center border-t border-border/60 px-4 py-2">
            <span className="w-[200px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Loja
            </span>
            <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Estágio
            </span>
            <span className="w-[170px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Designer
            </span>
            <span className="w-5" />
          </div>

          <div className={many ? "max-h-[360px] overflow-y-auto" : ""}>
            {rows.length === 0 && (
              <div className="border-t border-border/60 px-4 py-7 text-center text-[12.5px] text-muted-foreground">
                Nenhuma loja com esse filtro.
              </div>
            )}
            {rows.map((s) => {
              const done = s.prod_stage >= PRODUCTION_STEP_COUNT
              return (
                <button
                  key={s.store_id}
                  onClick={() => onOpenStore(campaign.stores.indexOf(s))}
                  className="flex w-full items-center border-t border-border/60 px-4 py-2.5 text-left hover:bg-muted/40"
                >
                  <div className="flex w-[200px] shrink-0 items-center gap-2.5">
                    <StoreGlyph name={s.store_name} />
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] font-semibold text-foreground">
                        {s.store_name}
                      </div>
                      <div className="text-[10.5px] text-muted-foreground">
                        {s.region_label} · {LANG_LABEL[s.lang] ?? s.lang}
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    {done ? (
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-600">
                        <Check size={14} /> Enviado
                      </span>
                    ) : (
                      <StorePipeline stage={s.prod_stage} />
                    )}
                  </div>
                  <div className="w-[170px] shrink-0">
                    <DesignerPicker
                      value={s.designer_id}
                      designers={designers}
                      onChange={(id) => onUpdateStore(s.store_id, { designer_id: id })}
                    />
                  </div>
                  <ChevronRight size={16} className="w-5 shrink-0 text-muted-foreground/60" />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
