"use client"

import { useEffect, useState } from "react"
import { X, Clock, Check, ArrowRight, Search, Layers, Package } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  PRODUCTION_STEP_COUNT,
  PROD_STAGE_LABELS,
  type ProductionCampaign,
  type ProductionDesigner,
} from "@/types/campaign-production"
import {
  designerInitials,
  LANG_LABEL,
  sendLabel,
  storeBrand,
  storeInitials,
} from "./helpers"

const STRUCTURE_BY_LANG: Record<string, string[]> = {
  pt: [
    "Hero com headline + CTA principal",
    "Grid de produtos curados",
    "Bloco de oferta / cupom",
    "Prova social ou urgência",
    "Rodapé com descadastro",
  ],
  en: [
    "Hero with headline + main CTA",
    "Curated product grid",
    "Offer / coupon block",
    "Social proof or urgency",
    "Footer with unsubscribe",
  ],
  es: [
    "Hero con titular + CTA principal",
    "Grid de productos seleccionados",
    "Bloque de oferta / cupón",
    "Prueba social o urgencia",
    "Pie con baja",
  ],
}

interface Props {
  campaign: ProductionCampaign | null
  storeIndex: number
  designers: ProductionDesigner[]
  onClose: () => void
  onUpdateStore: (
    storeId: string,
    patch: { prod_stage?: number; designer_id?: string | null },
  ) => void
}

export function DesignerModal({ campaign, storeIndex, designers, onClose, onUpdateStore }: Props) {
  const [si, setSi] = useState(storeIndex)
  const [railQ, setRailQ] = useState("")

  useEffect(() => {
    setSi(storeIndex)
    setRailQ("")
  }, [campaign?.id, storeIndex])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  if (!campaign) return null
  const store = campaign.stores[si] ?? campaign.stores[0]
  if (!store) return null

  const brand = storeBrand(store.store_name)
  const designer = designers.find((d) => d.id === store.designer_id) ?? null
  const stage = store.prod_stage
  const structure = STRUCTURE_BY_LANG[store.lang] ?? STRUCTURE_BY_LANG.pt
  const urgent = campaign.send_in != null && campaign.send_in <= 3

  const advance = (to: number) => onUpdateStore(store.store_id, { prod_stage: to })

  return (
    <div className="fixed inset-0 z-[55]">
      <div className="absolute inset-0 bg-foreground/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="absolute inset-4 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl md:inset-6">
        {/* Header */}
        <div className="flex h-[54px] shrink-0 items-center justify-between border-b border-border px-4 pl-5">
          <div className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
            <Layers size={16} className="text-muted-foreground/70" />
            <span>Produção</span>
            <span className="text-muted-foreground/40">›</span>
            <span className="max-w-[220px] truncate text-foreground/70">{campaign.title}</span>
            <span className="text-muted-foreground/40">›</span>
            <span className="font-semibold text-foreground">{store.store_name}</span>
            <Badge variant="warning" showDot={false}>
              Task de campanha
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${
                urgent ? "text-amber-600" : "text-muted-foreground"
              }`}
            >
              <Clock size={14} />
              {sendLabel(campaign.send_in, campaign.send_date)}
            </span>
            <button
              onClick={onClose}
              className="inline-flex rounded-md p-1.5 text-muted-foreground hover:bg-muted"
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 bg-muted/30">
          {/* Rail de lojas */}
          <div className="flex w-[210px] shrink-0 flex-col border-r border-border bg-card">
            <div className="shrink-0 px-3 pt-3.5 pb-2">
              <div className="px-1.5 pb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                Lojas da campanha · {campaign.stores.length}
              </div>
              {campaign.stores.length > 8 && (
                <div className="relative flex items-center">
                  <Search size={13} className="pointer-events-none absolute left-2.5 text-muted-foreground" />
                  <input
                    value={railQ}
                    onChange={(e) => setRailQ(e.target.value)}
                    placeholder="Buscar…"
                    className="w-full rounded-md border border-border bg-card py-1.5 pl-7 pr-2.5 text-[12px] text-foreground outline-none focus:border-primary"
                  />
                </div>
              )}
            </div>
            <div className="flex-1 overflow-auto px-3 pb-3">
              {campaign.stores.map((s, i) => {
                if (railQ && !s.store_name.toLowerCase().includes(railQ.toLowerCase())) return null
                const on = i === si
                const done = s.prod_stage >= PRODUCTION_STEP_COUNT
                return (
                  <button
                    key={s.store_id}
                    onClick={() => setSi(i)}
                    className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg border px-2 py-2 text-left ${
                      on ? "border-primary/30 bg-primary/5" : "border-transparent hover:bg-muted/60"
                    }`}
                  >
                    <span
                      style={{ background: storeBrand(s.store_name).primary }}
                      className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-md text-[9px] font-bold text-white"
                    >
                      {storeInitials(s.store_name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`truncate text-[12.5px] text-foreground ${on ? "font-semibold" : "font-medium"}`}
                      >
                        {s.store_name}
                      </div>
                      <div className="text-[10.5px] text-muted-foreground">
                        {LANG_LABEL[s.lang] ?? s.lang}
                      </div>
                    </div>
                    <span
                      className="size-[7px] shrink-0 rounded-full"
                      style={{
                        background: done ? "#047857" : s.prod_stage === 2 ? "#D97706" : "#4E62D8",
                      }}
                    />
                  </button>
                )
              })}
            </div>
          </div>

          {/* Brief */}
          <div className="w-[380px] shrink-0 overflow-auto border-r border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2.5 rounded-[10px] border border-border bg-muted/40 px-3 py-2.5">
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                {designer ? designerInitials(designer.name) : "—"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-foreground">
                  {designer ? designer.name : "Não atribuído"}
                </div>
                <div className="text-[11.5px] text-muted-foreground">Designer · responsável</div>
              </div>
              <Badge variant={stage >= 4 ? "positive" : stage === 2 ? "warning" : "info"} showDot>
                {PROD_STAGE_LABELS[Math.min(stage, 4)]}
              </Badge>
            </div>

            {/* Copy aprovada */}
            <div className="mb-5">
              <div className="mb-2.5 flex items-center gap-1.5">
                <Check size={15} className="text-emerald-600" />
                <span className="text-[13px] font-semibold text-foreground">Copy aprovada pelo COO</span>
              </div>
              <div className="overflow-hidden rounded-[10px] border border-border">
                <div className="border-b border-border/60 px-3 py-2.5">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Assunto
                  </div>
                  <div className="text-[13.5px] font-semibold text-foreground">
                    {campaign.subject ?? "—"}
                  </div>
                </div>
                <div className="px-3 py-2.5">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Ângulo
                  </div>
                  <div className="text-[12.5px] leading-relaxed text-muted-foreground">
                    {campaign.angle ?? "—"}
                  </div>
                </div>
              </div>
            </div>

            {/* Kit de marca */}
            <div className="mb-5">
              <div className="mb-2.5 text-[13px] font-semibold text-foreground">
                Kit de marca · {store.store_name}
              </div>
              <div className="flex items-center gap-3.5">
                <div className="flex gap-1.5">
                  {[brand.primary, brand.accent].map((col) => (
                    <div key={col} className="text-center">
                      <div
                        className="size-9 rounded-lg border border-border"
                        style={{ background: col }}
                      />
                      <div className="mt-1 font-mono text-[9.5px] text-muted-foreground">{col}</div>
                    </div>
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 text-[11.5px] text-muted-foreground">
                    <span className="text-muted-foreground/60">Fonte:</span> {brand.font}
                  </div>
                  <div className="text-[11.5px] text-muted-foreground">
                    <span className="text-muted-foreground/60">Voz:</span> {brand.voice}
                  </div>
                </div>
              </div>
            </div>

            {/* Estrutura sugerida */}
            <div>
              <div className="mb-2.5 text-[13px] font-semibold text-foreground">Estrutura sugerida</div>
              <div className="flex flex-col gap-1.5">
                {structure.map((bl, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-[12.5px] text-muted-foreground">
                    <span className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    {bl}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Preview + ações */}
          <div className="flex min-w-0 flex-1 flex-col bg-muted/30">
            <div className="flex flex-1 flex-col items-center overflow-auto px-6 py-7">
              <div className="mb-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Preview · {LANG_LABEL[store.lang] ?? store.lang}
              </div>
              <EmailPreview storeName={store.store_name} subject={campaign.subject} lang={store.lang} />
            </div>

            {/* Footer: ações de estágio */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card px-5 py-3">
              <span className="text-[11.5px] text-muted-foreground">
                Estágio atual: <strong className="text-foreground">{PROD_STAGE_LABELS[Math.min(stage, 4)]}</strong>
              </span>
              <div className="flex items-center gap-2">
                {stage > 0 && stage < 4 && (
                  <button
                    onClick={() => advance(stage - 1)}
                    className="rounded-md border border-border bg-card px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground hover:bg-muted"
                  >
                    Voltar etapa
                  </button>
                )}
                {stage <= 1 && (
                  <button
                    onClick={() => advance(2)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    <ArrowRight size={13} /> Enviar pra revisão
                  </button>
                )}
                {stage === 2 && (
                  <button
                    onClick={() => advance(3)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    <Check size={13} /> Aprovar e agendar
                  </button>
                )}
                {stage === 3 && (
                  <button
                    onClick={() => advance(4)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-emerald-700"
                  >
                    <Check size={13} /> Marcar enviada
                  </button>
                )}
                {stage >= 4 && (
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-600">
                    <Check size={15} /> Enviada
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmailPreview({
  storeName,
  subject,
  lang,
}: {
  storeName: string
  subject: string | null
  lang: string
}) {
  const b = storeBrand(storeName)
  const limited = lang === "en" ? "Limited time" : lang === "es" ? "Tiempo limitado" : "Por tempo limitado"
  const cta = lang === "en" ? "Shop now" : lang === "es" ? "Ver ahora" : "Ver agora"
  return (
    <div className="w-[360px] overflow-hidden rounded-lg border border-border bg-white shadow-xl">
      <div className="flex items-center justify-between px-5 py-3.5" style={{ background: b.primary }}>
        <span className="text-[14px] font-bold tracking-wide text-white">{storeName}</span>
        <span className="size-2 rounded-full" style={{ background: b.accent }} />
      </div>
      <div className="border-b border-gray-100 px-5 pb-5 pt-6 text-center">
        <div
          className="mb-2 inline-block text-[10px] font-bold uppercase tracking-widest"
          style={{ color: b.accent }}
        >
          {limited}
        </div>
        <div className="text-[20px] font-bold leading-tight" style={{ color: b.primary }}>
          {subject ?? "Sua campanha"}
        </div>
        <div
          className="mt-4 inline-block rounded-md px-6 py-2.5 text-[13px] font-bold text-white"
          style={{ background: b.accent }}
        >
          {cta}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 px-5 py-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex aspect-square items-center justify-center rounded-md bg-gray-100 text-gray-300"
          >
            <Package size={18} />
          </div>
        ))}
      </div>
    </div>
  )
}
