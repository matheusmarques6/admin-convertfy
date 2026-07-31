"use client"

/**
 * Dashboard do Funil Comercial — /admin/comercial/funil
 *
 * Leads → MQLs → Agendamentos → Reuniões → Vendas, com cards de
 * métricas de tráfego dos dois lados (investimento, CPL, CPA, ROAS,
 * ticket médio, cash collect) e taxas de conversão entre etapas.
 *
 * Visual: página ESCURA por design (réplica do dashboard de referência
 * de mídia paga), independente do tema do admin — mesmo precedente da
 * sidebar (sempre dark). Cards com tile de ícone em gradiente, funil
 * central de trapézios com taper fixo e pílulas de conversão na borda.
 *
 * Dados: GET /api/crm/funnel (agregação em runtime). Investimento é
 * lançado manualmente em crm_ad_spend (dialog "Investimento"); o
 * mapeamento etapa do kanban → etapa do funil vive em
 * pipeline_stages.funnel_step (dialog de configuração).
 */

import { useMemo, useState } from "react"
import useSWR from "swr"
import { format } from "date-fns"
import {
  BarChart3,
  Banknote,
  CalendarCheck,
  ChevronDown,
  CreditCard,
  DollarSign,
  Filter,
  Megaphone,
  Percent,
  Plus,
  RefreshCcw,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  UserPlus,
  Users,
  Video,
  Wallet,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { PeriodPicker, type PeriodValue } from "@/components/ui/period-picker"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  AdSpendDialog,
  MetaAdsDialog,
  StageMappingDialog,
} from "@/components/crm/funnel-dialogs"

// ─── Tipos do payload da API ─────────────────────────────────────

export interface FunnelPipelineStage {
  id: string
  name: string
  order: number
  stage_type: string
  funnel_step: string | null
}

export interface FunnelPipeline {
  id: string
  name: string
  color: string | null
  stages: FunnelPipelineStage[]
}

export interface AdSpendEntry {
  id: string
  day: string
  platform: string
  account_name: string
  amount: number
  notes: string | null
}

export interface ConnectedAdAccount {
  id: string
  account_id: string
  account_name: string
  last_synced_at: string | null
  last_sync_status: string | null
  last_sync_error: string | null
}

export interface CreativePerformance {
  ad_name: string
  campaign_name: string
  adset_name: string
  spend: number
  impressions: number
  clicks: number
  leads_meta: number
  leads_crm: number
  vendas: number
  receita: number
  cpl: number | null
  cpa: number | null
  roas: number | null
}

interface FunnelApiData {
  window: { days: number; from: string; to: string }
  funnel: { leads: number; mql: number; agendamento: number; reuniao: number; venda: number }
  rates: {
    leads_mql: number | null
    mql_agendamento: number | null
    agendamento_reuniao: number | null
    reuniao_venda: number | null
  }
  metrics: {
    investimento: number
    faturamento: number
    cash_collect: number
    roas: number | null
    tx_conversao: number | null
    ticket_medio: number | null
    taxa_cash_collect: number | null
    cpl: number | null
    custo_mql: number | null
    custo_agendamento: number | null
    custo_reuniao: number | null
    cpa: number | null
  }
  ad_spend: {
    total: number
    manual: number
    synced: number
    by_account: Array<{ platform: string; account_name: string; amount: number }>
    entries: AdSpendEntry[]
  }
  ad_accounts: ConnectedAdAccount[]
  creatives: CreativePerformance[]
  vendas: Array<{
    id: string
    title: string
    value: number
    cash_collected: number | null
    won_at: string | null
    pipeline_id: string
  }>
  pipelines: FunnelPipeline[]
  mapped_steps: string[]
  utm_options: { sources: string[]; mediums: string[]; campaigns: string[] }
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// ─── Formatação ──────────────────────────────────────────────────

const fmtBRL0 = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })

const fmtBRL2 = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtInt = (v: number) => v.toLocaleString("pt-BR")

const fmtPct1 = (v: number) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

const dash = "—"

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
  tiktok: "TikTok Ads",
  other: "Outro",
}

// ─── Tokens visuais da página (dark, fiel à referência) ──────────

const CARD =
  "rounded-[14px] border border-white/[0.06] bg-[#0F1420]"

const CONTROL =
  "h-9 rounded-[10px] border border-white/10 bg-[#10141C] text-[13px] font-medium text-gray-200 transition-colors hover:bg-[#161C2A] hover:text-white focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#4E62D8]"

// Taper fixo (% da largura do container): o formato do funil é sempre
// elegante e monotônico, independente dos volumes — números degenerados
// (0 leads, MQL > leads) não deformam a silhueta.
const TAPER = [100, 84, 68, 54, 40]
const LAST_BOTTOM = 28
const SEGMENT_H = 88

const FUNNEL_SEGMENTS: Array<{
  key: keyof FunnelApiData["funnel"]
  label: string
  fill: string
}> = [
  { key: "leads", label: "Leads", fill: "linear-gradient(180deg, #222A3C 0%, #161C2A 100%)" },
  { key: "mql", label: "MQLs", fill: "linear-gradient(180deg, #3A4460 0%, #2B3348 100%)" },
  { key: "agendamento", label: "Agendamentos", fill: "linear-gradient(180deg, #4666E8 0%, #3450CE 100%)" },
  { key: "reuniao", label: "Reuniões", fill: "linear-gradient(180deg, #D0620E 0%, #AC4E08 100%)" },
  { key: "venda", label: "Vendas", fill: "linear-gradient(180deg, #21A452 0%, #158540 100%)" },
]

const RATE_KEYS: Array<keyof FunnelApiData["rates"]> = [
  "leads_mql",
  "mql_agendamento",
  "agendamento_reuniao",
  "reuniao_venda",
]

// ─── Componente principal ────────────────────────────────────────

export function FunnelDashboard() {
  const [period, setPeriod] = useState<PeriodValue>({ period: "30d" })
  const [pipelineId, setPipelineId] = useState("all")
  const [utm, setUtm] = useState({ source: "", medium: "", campaign: "" })
  const [spendOpen, setSpendOpen] = useState(false)
  const [mappingOpen, setMappingOpen] = useState(false)
  const [metaOpen, setMetaOpen] = useState(false)

  const query = useMemo(() => {
    const params = new URLSearchParams()
    if (period.period === "custom" && period.customStart && period.customEnd) {
      params.set("from", format(period.customStart, "yyyy-MM-dd"))
      params.set("to", format(period.customEnd, "yyyy-MM-dd"))
    } else {
      params.set("days", period.period.replace(/\D/g, "") || "30")
    }
    if (pipelineId !== "all") params.set("pipeline_id", pipelineId)
    if (utm.source) params.set("utm_source", utm.source)
    if (utm.medium) params.set("utm_medium", utm.medium)
    if (utm.campaign) params.set("utm_campaign", utm.campaign)
    return params.toString()
  }, [period, pipelineId, utm])

  const { data, isLoading, mutate } = useSWR<FunnelApiData>(
    `/api/crm/funnel?${query}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  )

  const activeUtmCount = [utm.source, utm.medium, utm.campaign].filter(Boolean).length
  const m = data?.metrics
  const loading = isLoading && !data

  const missingSteps = useMemo(() => {
    if (!data) return []
    const wanted: Array<{ step: string; label: string }> = [
      { step: "mql", label: "MQL" },
      { step: "agendamento", label: "Agendamento" },
      { step: "reuniao", label: "Reunião" },
      { step: "venda", label: "Venda" },
    ]
    return wanted.filter((w) => !data.mapped_steps.includes(w.step))
  }, [data])

  const leftCards: MetricCardDef[] = [
    { label: "Investimento", icon: BarChart3, tile: "linear-gradient(135deg, #14B8A6, #0D9488)", value: m ? fmtBRL0(m.investimento) : dash, hint: m && m.investimento === 0 ? "Lance o investimento do período" : undefined },
    { label: "Faturamento total", icon: Banknote, tile: "linear-gradient(135deg, #22C55E, #16A34A)", value: m ? fmtBRL0(m.faturamento) : dash },
    { label: "ROAS", icon: RefreshCcw, tile: "linear-gradient(135deg, #8B5CF6, #7C3AED)", value: m?.roas != null ? `${m.roas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x` : dash },
    { label: "Tx. conversão", icon: Percent, tile: "linear-gradient(135deg, #F59E0B, #D97706)", value: m?.tx_conversao != null ? fmtPct1(m.tx_conversao) : dash },
    { label: "Ticket médio", icon: CreditCard, tile: "linear-gradient(135deg, #EC4899, #DB2777)", value: m?.ticket_medio != null ? fmtBRL0(m.ticket_medio) : dash },
    { label: "Cash collect", icon: Wallet, tile: "linear-gradient(135deg, #06B6D4, #0891B2)", value: m ? fmtBRL0(m.cash_collect) : dash },
  ]

  const rightCards: MetricCardDef[] = [
    { label: "Custo por lead", icon: Users, tile: "linear-gradient(135deg, #3B82F6, #2563EB)", value: m?.cpl != null ? fmtBRL2(m.cpl) : dash },
    { label: "Custo por MQL", icon: UserPlus, tile: "linear-gradient(135deg, #A855F7, #9333EA)", value: m?.custo_mql != null ? fmtBRL2(m.custo_mql) : dash },
    { label: "Custo por agend.", icon: CalendarCheck, tile: "linear-gradient(135deg, #6366F1, #4F46E5)", value: m?.custo_agendamento != null ? fmtBRL2(m.custo_agendamento) : dash },
    { label: "Custo por reunião", icon: Video, tile: "linear-gradient(135deg, #10B981, #059669)", value: m?.custo_reuniao != null ? fmtBRL2(m.custo_reuniao) : dash },
    { label: "CPA", icon: DollarSign, tile: "linear-gradient(135deg, #F59E0B, #D97706)", value: m?.cpa != null ? fmtBRL2(m.cpa) : dash },
    { label: "Taxa cash collect", icon: Percent, tile: "linear-gradient(135deg, #F97316, #EA580C)", value: m?.taxa_cash_collect != null ? fmtPct1(m.taxa_cash_collect) : dash },
  ]

  return (
    <div className="-m-4 min-h-[100dvh] bg-[#0A0E17] md:-m-6 lg:-m-8">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-5 md:px-7 md:py-6">
        {/* Cabeçalho */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold leading-tight tracking-tight text-white">
              Funil
            </h1>
            <p className="mt-0.5 text-[12.5px] text-[#7C8598]">
              Funil comercial com métricas de tráfego
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <select
                className={cn(CONTROL, "appearance-none pl-3 pr-8")}
                value={pipelineId}
                onChange={(e) => setPipelineId(e.target.value)}
                aria-label="Pipeline"
              >
                <option value="all">Todos os pipelines</option>
                {(data?.pipelines ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <Icon
                icon={ChevronDown}
                customSize={14}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7C8598]"
              />
            </div>

            <UtmFilterButton
              utm={utm}
              onChange={setUtm}
              options={data?.utm_options}
              activeCount={activeUtmCount}
            />

            <PeriodPicker
              value={period}
              onChange={setPeriod}
              className="h-9 rounded-[10px] border border-white/10 bg-[#10141C] text-[13px] text-gray-200 hover:bg-[#161C2A] hover:text-white active:bg-[#161C2A]"
              options={[
                { value: "7d", label: "7 dias" },
                { value: "15d", label: "15 dias" },
                { value: "30d", label: "30 dias" },
                { value: "90d", label: "90 dias" },
              ]}
            />

            <button
              type="button"
              onClick={() => setMetaOpen(true)}
              className={cn(CONTROL, "inline-flex items-center gap-1.5 px-3")}
            >
              <Icon icon={Megaphone} size={16} />
              Meta Ads
              {(data?.ad_accounts?.length ?? 0) > 0 && (
                <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-[#34D399]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setSpendOpen(true)}
              className={cn(CONTROL, "inline-flex items-center gap-1.5 px-3")}
            >
              <Icon icon={Plus} size={16} />
              Investimento
            </button>

            <button
              type="button"
              onClick={() => setMappingOpen(true)}
              className={cn(CONTROL, "inline-flex items-center gap-1.5 px-3")}
            >
              <Icon icon={Settings2} size={16} />
              Etapas
            </button>

            <button
              type="button"
              onClick={() => mutate()}
              disabled={isLoading}
              className={cn(CONTROL, "inline-flex w-9 items-center justify-center disabled:opacity-50")}
              aria-label="Atualizar"
            >
              <Icon icon={RefreshCw} size={16} className={cn(isLoading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Aviso de funil sem mapeamento */}
        {missingSteps.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#F59E0B]/25 bg-[#F59E0B]/10 px-4 py-2.5">
            <div className="text-[12.5px] text-[#FBBF24]">
              <span className="font-semibold">Funil incompleto:</span> nenhuma etapa mapeada
              como {missingSteps.map((s) => s.label).join(", ")}. Mapeie as etapas do kanban
              pra essas contagens saírem de zero.
            </div>
            <button
              type="button"
              onClick={() => setMappingOpen(true)}
              className={cn(CONTROL, "inline-flex items-center gap-1.5 px-3")}
            >
              <Icon icon={SlidersHorizontal} size={16} />
              Mapear etapas
            </button>
          </div>
        )}

        {/* Cards + funil */}
        <div className="grid items-center gap-4 lg:grid-cols-[300px_minmax(0,1fr)_300px] lg:gap-6">
          <div className="order-2 grid grid-cols-2 content-start gap-3 sm:grid-cols-3 lg:order-none lg:grid-cols-1">
            {leftCards.map((c) => (
              <MetricCard key={c.label} def={c} loading={loading} />
            ))}
          </div>

          <div className="order-1 lg:order-none">
            <FunnelChart data={data} loading={loading} />
          </div>

          <div className="order-3 grid grid-cols-2 content-start gap-3 sm:grid-cols-3 lg:order-none lg:grid-cols-1">
            {rightCards.map((c) => (
              <MetricCard key={c.label} def={c} loading={loading} />
            ))}
          </div>
        </div>

        <CreativesPanel data={data} onConnect={() => setMetaOpen(true)} />
        <SpendByAccountPanel data={data} onManage={() => setSpendOpen(true)} />
        <VendasPanel data={data} onChanged={() => mutate()} />
      </div>

      <MetaAdsDialog
        open={metaOpen}
        onOpenChange={setMetaOpen}
        accounts={data?.ad_accounts ?? []}
        onChanged={() => mutate()}
      />
      <AdSpendDialog
        open={spendOpen}
        onOpenChange={setSpendOpen}
        entries={data?.ad_spend.entries ?? []}
        onChanged={() => mutate()}
      />
      <StageMappingDialog
        open={mappingOpen}
        onOpenChange={setMappingOpen}
        pipelines={data?.pipelines ?? []}
        onSaved={() => mutate()}
      />
    </div>
  )
}

// ─── Cards de métrica ────────────────────────────────────────────

interface MetricCardDef {
  label: string
  icon: LucideIcon
  tile: string
  value: string
  hint?: string
}

function MetricCard({ def, loading }: { def: MetricCardDef; loading: boolean }) {
  return (
    <div className={cn(CARD, "flex items-center gap-3.5 px-4 py-3.5")}>
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]"
        style={{ background: def.tile }}
      >
        <Icon icon={def.icon} size={20} className="text-white" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[#7C8598]">
          {def.label}
        </div>
        {loading ? (
          <div className="mt-1.5 h-6 w-20 animate-pulse rounded bg-white/10" />
        ) : (
          <div className="mt-0.5 truncate text-[22px] font-bold leading-tight tracking-[-0.01em] text-white tabular-nums">
            {def.value}
          </div>
        )}
        {def.hint && !loading && (
          <div className="mt-0.5 text-[10.5px] text-[#5A6478]">{def.hint}</div>
        )}
      </div>
    </div>
  )
}

// ─── Funil de trapézios ──────────────────────────────────────────

function FunnelChart({ data, loading }: { data?: FunnelApiData; loading: boolean }) {
  return (
    <div className="relative mx-auto w-full max-w-[580px] select-none pb-4 pt-1">
      {FUNNEL_SEGMENTS.map((seg, i) => {
        const vol = data?.funnel[seg.key] ?? 0
        const topW = TAPER[i]
        const botW = i < TAPER.length - 1 ? TAPER[i + 1] : LAST_BOTTOM

        const lt = (100 - topW) / 2
        const rt = (100 + topW) / 2
        const lb = (100 - botW) / 2
        const rb = (100 + botW) / 2

        const rateKey = i < RATE_KEYS.length ? RATE_KEYS[i] : null
        const rate = rateKey ? (data?.rates[rateKey] ?? null) : null
        const showRate = i < FUNNEL_SEGMENTS.length - 1
        const pillLeft = Math.min(50 + botW / 2, 87)

        return (
          <div key={seg.key} className="relative" style={{ height: SEGMENT_H, marginBottom: -1 }}>
            <div
              className="absolute inset-0 flex flex-col items-center justify-center"
              style={{
                background: seg.fill,
                clipPath: `polygon(${lt}% 0, ${rt}% 0, ${rb}% 100%, ${lb}% 100%)`,
              }}
            >
              {loading ? (
                <div className="h-8 w-16 animate-pulse rounded bg-white/10" />
              ) : (
                <div className="text-[32px] font-bold leading-none tracking-[-0.02em] text-white tabular-nums">
                  {fmtInt(vol)}
                </div>
              )}
              <div className="mt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/70">
                {seg.label}
              </div>
            </div>

            {/* Taxa de conversão pra próxima etapa, na borda inferior */}
            {showRate && !loading && (
              <div
                className="absolute z-10 -translate-y-1/2 rounded-full border border-white/15 bg-[#0B0F1A] px-2.5 py-1 text-[11.5px] font-semibold text-white tabular-nums"
                style={{ top: SEGMENT_H, left: `${pillLeft}%` }}
              >
                {rate != null ? fmtPct1(rate) : dash}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Criativos (Meta × CRM) ──────────────────────────────────────

function CreativesPanel({
  data,
  onConnect,
}: {
  data?: FunnelApiData
  onConnect: () => void
}) {
  const [open, setOpen] = useState(true)
  const creatives = data?.creatives ?? []
  const connected = (data?.ad_accounts?.length ?? 0) > 0

  return (
    <div className={cn(CARD, "mt-5")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div>
          <div className="text-[13.5px] font-semibold text-white">
            Criativos que mais performaram
          </div>
          <div className="mt-0.5 text-[11.5px] text-[#7C8598]">
            {connected
              ? creatives.length > 0
                ? `${creatives.length} criativo${creatives.length > 1 ? "s" : ""} no período — ordenado por receita gerada`
                : "Sem dados no período. Sincronize a conta ou amplie o intervalo."
              : "Conecte o Meta Ads pra ver gasto, leads e vendas por criativo"}
          </div>
        </div>
        <Icon
          icon={ChevronDown}
          size={16}
          className={cn("text-[#7C8598] transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="border-t border-white/[0.06] px-5 py-4">
          {!connected ? (
            <div className="flex flex-col items-start gap-3">
              <p className="max-w-[560px] text-[12.5px] leading-relaxed text-[#7C8598]">
                Com a conta conectada, o gasto de cada anúncio encontra os leads e as vendas
                do CRM pelos nomes que já vão nas suas UTMs — e você vê CPL, CPA e ROAS por
                criativo, não só no total.
              </p>
              <button
                type="button"
                onClick={onConnect}
                className={cn(CONTROL, "inline-flex items-center gap-1.5 px-3")}
              >
                <Icon icon={Megaphone} size={16} />
                Conectar Meta Ads
              </button>
            </div>
          ) : creatives.length === 0 ? (
            <p className="text-[12.5px] text-[#7C8598]">
              Nenhum criativo com gasto ou conversão no período selecionado.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-[12.5px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-[#5A6478]">
                    <th className="pb-2 pr-3 font-semibold">Criativo</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Gasto</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Leads</th>
                    <th className="pb-2 pr-3 text-right font-semibold">CPL</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Vendas</th>
                    <th className="pb-2 pr-3 text-right font-semibold">CPA</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Receita</th>
                    <th className="pb-2 text-right font-semibold">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {creatives.map((c, i) => (
                    <tr
                      key={`${c.ad_name}-${i}`}
                      className="border-t border-white/[0.05]"
                    >
                      <td className="max-w-[280px] py-2 pr-3">
                        <div className="truncate font-medium text-[#E4E8F0]">
                          {c.ad_name || "Sem anúncio identificado"}
                        </div>
                        <div className="truncate text-[10.5px] text-[#5A6478]">
                          {[c.campaign_name, c.adset_name].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right text-[#C6CDDB] tabular-nums">
                        {c.spend > 0 ? fmtBRL0(c.spend) : dash}
                      </td>
                      <td className="py-2 pr-3 text-right text-[#C6CDDB] tabular-nums">
                        {fmtInt(c.leads_crm)}
                      </td>
                      <td className="py-2 pr-3 text-right text-[#C6CDDB] tabular-nums">
                        {c.cpl != null ? fmtBRL2(c.cpl) : dash}
                      </td>
                      <td className="py-2 pr-3 text-right text-[#C6CDDB] tabular-nums">
                        {fmtInt(c.vendas)}
                      </td>
                      <td className="py-2 pr-3 text-right text-[#C6CDDB] tabular-nums">
                        {c.cpa != null ? fmtBRL2(c.cpa) : dash}
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold text-white tabular-nums">
                        {c.receita > 0 ? fmtBRL0(c.receita) : dash}
                      </td>
                      <td
                        className={cn(
                          "py-2 text-right font-semibold tabular-nums",
                          c.roas == null
                            ? "text-[#5A6478]"
                            : c.roas >= 1
                              ? "text-[#34D399]"
                              : "text-[#F87171]",
                        )}
                      >
                        {c.roas != null
                          ? `${c.roas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`
                          : dash}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Investimento por conta ──────────────────────────────────────

function SpendByAccountPanel({
  data,
  onManage,
}: {
  data?: FunnelApiData
  onManage: () => void
}) {
  const [open, setOpen] = useState(false)
  const byAccount = data?.ad_spend.by_account ?? []
  const total = data?.ad_spend.total ?? 0
  const synced = data?.ad_spend.synced ?? 0
  const manual = data?.ad_spend.manual ?? 0
  const accountLabel = (a: { platform: string; account_name: string }) =>
    a.account_name || PLATFORM_LABELS[a.platform] || a.platform

  return (
    <div className={cn(CARD, "mt-5")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div>
          <div className="text-[13.5px] font-semibold text-white">Investimento por conta</div>
          <div className="mt-0.5 text-[11.5px] text-[#7C8598]">
            {byAccount.length > 0
              ? `${byAccount.length} conta${byAccount.length > 1 ? "s" : ""} combinada${byAccount.length > 1 ? "s" : ""} — total ${fmtBRL2(total)}`
              : "Nenhum lançamento no período"}
            {synced > 0 && (
              <span className="ml-1.5 text-[#5A6478]">
                · {fmtBRL2(synced)} sincronizado da Meta
                {manual > 0 ? ` + ${fmtBRL2(manual)} manual` : ""}
              </span>
            )}
          </div>
        </div>
        <Icon
          icon={ChevronDown}
          size={16}
          className={cn("text-[#7C8598] transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="border-t border-white/[0.06] px-5 py-4">
          {byAccount.length === 0 ? (
            <p className="text-[12.5px] text-[#7C8598]">
              Lance o investimento das suas contas de anúncio pra calcular CPL, CPA e ROAS.
            </p>
          ) : (
            <div className="space-y-2">
              {byAccount.map((a) => (
                <div
                  key={`${a.platform}-${a.account_name}`}
                  className="flex items-center justify-between gap-3 text-[12.5px]"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{
                        background:
                          a.platform === "meta"
                            ? "#4666E8"
                            : a.platform === "google"
                              ? "#F59E0B"
                              : a.platform === "tiktok"
                                ? "#E5E7EB"
                                : "#6B7280",
                      }}
                    />
                    <span className="truncate text-[#C6CDDB]">{accountLabel(a)}</span>
                    <span className="shrink-0 text-[10.5px] uppercase tracking-wide text-[#5A6478]">
                      {PLATFORM_LABELS[a.platform] ?? a.platform}
                    </span>
                  </div>
                  <span className="font-semibold text-white tabular-nums">
                    {fmtBRL2(a.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4">
            <button
              type="button"
              onClick={onManage}
              className={cn(CONTROL, "inline-flex items-center gap-1.5 px-3")}
            >
              <Icon icon={Plus} size={16} />
              Gerenciar lançamentos
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Vendas do período (cash collect) ────────────────────────────

function VendasPanel({
  data,
  onChanged,
}: {
  data?: FunnelApiData
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const vendas = data?.vendas ?? []

  const saveCash = async (id: string, raw: string, current: number | null) => {
    const trimmed = raw.trim().replace(",", ".")
    const next = trimmed === "" ? null : Number(trimmed)
    if (next != null && (!Number.isFinite(next) || next < 0)) return
    if (next === current) return
    setSavingId(id)
    try {
      await fetch(`/api/crm/deals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cash_collected: next }),
      })
      onChanged()
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className={cn(CARD, "mt-3")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div>
          <div className="text-[13.5px] font-semibold text-white">
            Vendas do período · cash collect
          </div>
          <div className="mt-0.5 text-[11.5px] text-[#7C8598]">
            {vendas.length > 0
              ? `${vendas.length} venda${vendas.length > 1 ? "s" : ""} — informe o valor recebido de cada uma`
              : "Nenhuma venda no período"}
          </div>
        </div>
        <Icon
          icon={ChevronDown}
          size={16}
          className={cn("text-[#7C8598] transition-transform", open && "rotate-180")}
        />
      </button>

      {open && vendas.length > 0 && (
        <div className="border-t border-white/[0.06] px-5 py-4">
          <div className="mb-2.5 grid grid-cols-[minmax(0,1fr)_100px_90px_120px] gap-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5A6478]">
            <span>Deal</span>
            <span>Ganho em</span>
            <span className="text-right">Valor</span>
            <span className="text-right">Recebido</span>
          </div>
          <div className="space-y-2">
            {vendas.map((v) => (
              <div
                key={v.id}
                className="grid grid-cols-[minmax(0,1fr)_100px_90px_120px] items-center gap-3 text-[12.5px]"
              >
                <span className="truncate text-[#C6CDDB]">{v.title}</span>
                <span className="text-[#7C8598] tabular-nums">
                  {v.won_at ? format(new Date(v.won_at), "dd/MM/yyyy") : dash}
                </span>
                <span className="text-right font-semibold text-white tabular-nums">
                  {fmtBRL0(v.value)}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  defaultValue={v.cash_collected != null ? String(v.cash_collected) : ""}
                  placeholder="0,00"
                  disabled={savingId === v.id}
                  onBlur={(e) => saveCash(v.id, e.target.value, v.cash_collected)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                  }}
                  className="h-8 w-full rounded-[8px] border border-white/10 bg-[#0A0E17] px-2 text-right text-[12.5px] text-white tabular-nums placeholder:text-[#4A5265] focus:border-white/25 focus:outline-none disabled:opacity-40"
                  aria-label={`Cash collect de ${v.title}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Filtro de UTM ───────────────────────────────────────────────

function UtmFilterButton({
  utm,
  onChange,
  options,
  activeCount,
}: {
  utm: { source: string; medium: string; campaign: string }
  onChange: (v: { source: string; medium: string; campaign: string }) => void
  options?: FunnelApiData["utm_options"]
  activeCount: number
}) {
  const fields: Array<{ key: "source" | "medium" | "campaign"; label: string; opts: string[] }> = [
    { key: "source", label: "Fonte (utm_source)", opts: options?.sources ?? [] },
    { key: "medium", label: "Mídia (utm_medium)", opts: options?.mediums ?? [] },
    { key: "campaign", label: "Campanha (utm_campaign)", opts: options?.campaigns ?? [] },
  ]

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn(CONTROL, "inline-flex items-center gap-1.5 px-3")}>
          <Icon icon={Filter} size={16} />
          Filtros UTM
          {activeCount > 0 && (
            <span className="rounded-full bg-white px-1.5 text-[10.5px] font-bold text-[#0A0E17]">
              {activeCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[280px] space-y-3 rounded-[12px] border-white/10 bg-[#0F1420] p-3 text-white"
      >
        {fields.map((field) => (
          <div key={field.key} className="space-y-1">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#7C8598]">
              {field.label}
            </div>
            <div className="relative">
              <select
                className={cn(CONTROL, "w-full appearance-none pl-3 pr-8")}
                value={utm[field.key]}
                onChange={(e) => onChange({ ...utm, [field.key]: e.target.value })}
              >
                <option value="">Todas</option>
                {field.opts.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              <Icon
                icon={ChevronDown}
                customSize={14}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7C8598]"
              />
            </div>
          </div>
        ))}
        <div className="flex justify-end">
          <button
            type="button"
            disabled={activeCount === 0}
            onClick={() => onChange({ source: "", medium: "", campaign: "" })}
            className="text-[12px] font-medium text-[#7C8598] transition-colors hover:text-white disabled:opacity-40"
          >
            Limpar filtros
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
