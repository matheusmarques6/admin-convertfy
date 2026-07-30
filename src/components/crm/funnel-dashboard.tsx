"use client"

/**
 * Dashboard do Funil Comercial — /admin/comercial/funil
 *
 * Leads → MQLs → Agendamentos → Reuniões → Vendas, com cards de
 * métricas de tráfego dos dois lados (investimento, CPL, CPA, ROAS,
 * ticket médio, cash collect) e taxas de conversão entre etapas.
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
import { Button } from "@/components/ui/button"
import { PeriodPicker, type PeriodValue } from "@/components/ui/period-picker"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { AdSpendDialog, StageMappingDialog } from "@/components/crm/funnel-dialogs"

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
    by_account: Array<{ platform: string; account_name: string; amount: number }>
    entries: AdSpendEntry[]
  }
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

// ─── Config visual do funil (fiel ao design de referência) ───────

const FUNNEL_SEGMENTS: Array<{
  key: keyof FunnelApiData["funnel"]
  label: string
  fill: string
}> = [
  { key: "leads", label: "Leads", fill: "linear-gradient(180deg, #232A3A 0%, #171D2B 100%)" },
  { key: "mql", label: "MQLs", fill: "linear-gradient(180deg, #3B4457 0%, #2C3446 100%)" },
  { key: "agendamento", label: "Agendamentos", fill: "linear-gradient(180deg, #4E62D8 0%, #3A4EC4 100%)" },
  { key: "reuniao", label: "Reuniões", fill: "linear-gradient(180deg, #D97706 0%, #B45309 100%)" },
  { key: "venda", label: "Vendas", fill: "linear-gradient(180deg, #16A34A 0%, #15803D 100%)" },
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
    { label: "Investimento", icon: BarChart3, tint: "text-teal-600 dark:text-teal-400", value: m ? fmtBRL0(m.investimento) : dash, hint: m && m.investimento === 0 ? "Lance o investimento do período" : undefined },
    { label: "Faturamento total", icon: Banknote, tint: "text-emerald-600 dark:text-emerald-400", value: m ? fmtBRL0(m.faturamento) : dash },
    { label: "ROAS", icon: RefreshCcw, tint: "text-violet-600 dark:text-violet-400", value: m?.roas != null ? `${m.roas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x` : dash },
    { label: "Tx. conversão", icon: Percent, tint: "text-amber-600 dark:text-amber-400", value: m?.tx_conversao != null ? fmtPct1(m.tx_conversao) : dash, hint: "vendas / leads" },
    { label: "Ticket médio", icon: CreditCard, tint: "text-pink-600 dark:text-pink-400", value: m?.ticket_medio != null ? fmtBRL0(m.ticket_medio) : dash },
    { label: "Cash collect", icon: Wallet, tint: "text-teal-600 dark:text-teal-400", value: m ? fmtBRL0(m.cash_collect) : dash },
  ]

  const rightCards: MetricCardDef[] = [
    { label: "Custo por lead", icon: Users, tint: "text-blue-600 dark:text-blue-400", value: m?.cpl != null ? fmtBRL2(m.cpl) : dash },
    { label: "Custo por MQL", icon: UserPlus, tint: "text-violet-600 dark:text-violet-400", value: m?.custo_mql != null ? fmtBRL2(m.custo_mql) : dash },
    { label: "Custo por agend.", icon: CalendarCheck, tint: "text-indigo-600 dark:text-indigo-400", value: m?.custo_agendamento != null ? fmtBRL2(m.custo_agendamento) : dash },
    { label: "Custo por reunião", icon: Video, tint: "text-emerald-600 dark:text-emerald-400", value: m?.custo_reuniao != null ? fmtBRL2(m.custo_reuniao) : dash },
    { label: "CPA", icon: DollarSign, tint: "text-amber-600 dark:text-amber-400", value: m?.cpa != null ? fmtBRL2(m.cpa) : dash },
    { label: "Taxa cash collect", icon: Percent, tint: "text-orange-600 dark:text-orange-400", value: m?.taxa_cash_collect != null ? fmtPct1(m.taxa_cash_collect) : dash },
  ]

  return (
    <CrmPageShell
      title="Funil"
      subtitle="Funil comercial com métricas de tráfego"
      actions={
        <>
          <select
            className="crm-input"
            value={pipelineId}
            onChange={(e) => setPipelineId(e.target.value)}
            aria-label="Pipeline"
          >
            <option value="all">Todos os pipelines</option>
            {(data?.pipelines ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <UtmFilterButton
            utm={utm}
            onChange={setUtm}
            options={data?.utm_options}
            activeCount={activeUtmCount}
          />

          <PeriodPicker
            value={period}
            onChange={setPeriod}
            options={[
              { value: "7d", label: "7 dias" },
              { value: "15d", label: "15 dias" },
              { value: "30d", label: "30 dias" },
              { value: "90d", label: "90 dias" },
            ]}
          />

          <Button variant="secondary" size="sm" onClick={() => setSpendOpen(true)}>
            <Icon icon={Plus} size={16} className="mr-1.5" />
            Investimento
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMappingOpen(true)}
            aria-label="Configurar etapas do funil"
          >
            <Icon icon={Settings2} size={16} />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => mutate()}
            disabled={isLoading}
            aria-label="Atualizar"
          >
            <Icon icon={RefreshCw} size={16} className={cn(isLoading && "animate-spin")} />
          </Button>
        </>
      }
    >
      <div className="mx-auto w-full max-w-[1280px] p-4 md:p-6">
        {missingSteps.length > 0 && (
          <div
            className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[6px] border px-3 py-2"
            style={{
              background: "var(--crm-warn-bg)",
              borderColor: "var(--crm-warn-border)",
              color: "var(--crm-warn)",
            }}
          >
            <div className="text-[12.5px]">
              <span className="font-semibold">Funil incompleto:</span> nenhuma etapa mapeada
              como {missingSteps.map((s) => s.label).join(", ")}. Mapeie as etapas do kanban
              pra essas contagens saírem de zero.
            </div>
            <Button variant="secondary" size="sm" onClick={() => setMappingOpen(true)}>
              <Icon icon={SlidersHorizontal} size={16} className="mr-1.5" />
              Mapear etapas
            </Button>
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-[250px_minmax(0,1fr)_250px]">
          <div className="order-2 grid grid-cols-2 content-start gap-3 sm:grid-cols-3 lg:order-none lg:grid-cols-1">
            {leftCards.map((c) => (
              <MetricCard key={c.label} def={c} loading={isLoading && !data} />
            ))}
          </div>

          <div className="order-1 lg:order-none">
            <FunnelChart data={data} loading={isLoading && !data} />
          </div>

          <div className="order-3 grid grid-cols-2 content-start gap-3 sm:grid-cols-3 lg:order-none lg:grid-cols-1">
            {rightCards.map((c) => (
              <MetricCard key={c.label} def={c} loading={isLoading && !data} />
            ))}
          </div>
        </div>

        <SpendByAccountPanel
          data={data}
          onManage={() => setSpendOpen(true)}
        />

        <VendasPanel data={data} onChanged={() => mutate()} />
      </div>

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
    </CrmPageShell>
  )
}

// ─── Cards de métrica ────────────────────────────────────────────

interface MetricCardDef {
  label: string
  icon: LucideIcon
  tint: string
  value: string
  hint?: string
}

function MetricCard({ def, loading }: { def: MetricCardDef; loading: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-white p-4 dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]">
      <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-gray-500 dark:text-[#8B92A5]">
        <Icon icon={def.icon} size={16} className={def.tint} />
        {def.label}
      </div>
      {loading ? (
        <div className="h-7 w-24 animate-pulse rounded bg-gray-100 dark:bg-white/10" />
      ) : (
        <div className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-gray-900 tabular-nums dark:text-[#EAEDF3]">
          {def.value}
        </div>
      )}
      {def.hint && !loading && (
        <div className="text-[11px] text-gray-400 dark:text-[#5C6378]">{def.hint}</div>
      )}
    </div>
  )
}

// ─── Funil de trapézios ──────────────────────────────────────────

const SEGMENT_HEIGHT = 82

function FunnelChart({ data, loading }: { data?: FunnelApiData; loading: boolean }) {
  const counts = FUNNEL_SEGMENTS.map((s) => data?.funnel[s.key] ?? 0)
  const maxVolume = Math.max(...counts, 1)
  // Largura proporcional ao volume: piso 34%, teto 96% (nunca colapsa)
  const widthFor = (vol: number) => 34 + (vol / maxVolume) * 62

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[520px] animate-pulse py-2">
        {FUNNEL_SEGMENTS.map((s, i) => {
          const w = 96 - i * 13
          return (
            <div
              key={s.key}
              className="mx-auto mb-1 rounded bg-gray-100 dark:bg-white/10"
              style={{ height: SEGMENT_HEIGHT - 4, width: `${w}%` }}
            />
          )
        })}
      </div>
    )
  }

  return (
    <div className="relative mx-auto w-full max-w-[520px] select-none py-2">
      {FUNNEL_SEGMENTS.map((seg, i) => {
        const vol = counts[i]
        const nextVol = i < counts.length - 1 ? counts[i + 1] : null
        const topW = widthFor(vol)
        const botW = nextVol != null ? widthFor(nextVol) : topW * 0.62

        const lt = (100 - topW) / 2
        const rt = (100 + topW) / 2
        const lb = (100 - botW) / 2
        const rb = (100 + botW) / 2

        const rateKey = i < RATE_KEYS.length ? RATE_KEYS[i] : null
        const rate = rateKey ? (data?.rates[rateKey] ?? null) : null
        const showRate = i < FUNNEL_SEGMENTS.length - 1

        return (
          <div key={seg.key} className="relative" style={{ height: SEGMENT_HEIGHT, marginBottom: -1 }}>
            <div
              className="absolute inset-0 flex flex-col items-center justify-center"
              style={{
                background: seg.fill,
                clipPath: `polygon(${lt}% 0, ${rt}% 0, ${rb}% 100%, ${lb}% 100%)`,
              }}
            >
              <div className="text-[30px] font-bold leading-none tracking-[-0.02em] text-white tabular-nums">
                {fmtInt(vol)}
              </div>
              <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/80">
                {seg.label}
              </div>
            </div>

            {/* Taxa de conversão pra próxima etapa (borda inferior, à direita) */}
            {showRate && (
              <div
                className="absolute z-10 rounded-full border border-white/10 bg-[#10141F] px-2.5 py-1 text-[11px] font-semibold text-white tabular-nums shadow-sm"
                style={{
                  top: SEGMENT_HEIGHT,
                  left: `${Math.min(50 + botW / 2, 84)}%`,
                  marginLeft: 10,
                  transform: "translateY(-50%)",
                }}
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
  const accountLabel = (a: { platform: string; account_name: string }) =>
    a.account_name || PLATFORM_LABELS[a.platform] || a.platform

  return (
    <div className="mt-4 rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-white dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <div className="text-[13px] font-semibold text-gray-900 dark:text-[#EAEDF3]">
            Investimento por conta
          </div>
          <div className="text-[11.5px] text-gray-500 dark:text-[#8B92A5]">
            {byAccount.length > 0
              ? `${byAccount.length} conta${byAccount.length > 1 ? "s" : ""} combinada${byAccount.length > 1 ? "s" : ""} — total ${fmtBRL2(total)}`
              : "Nenhum lançamento no período"}
          </div>
        </div>
        <Icon
          icon={ChevronDown}
          size={16}
          className={cn("text-gray-400 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="border-t border-[rgba(0,0,0,0.06)] px-4 py-3 dark:border-[rgba(255,255,255,0.06)]">
          {byAccount.length === 0 ? (
            <p className="text-[12.5px] text-gray-500 dark:text-[#8B92A5]">
              Lance o investimento das suas contas de anúncio pra calcular CPL, CPA e ROAS.
            </p>
          ) : (
            <div className="space-y-1.5">
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
                            ? "#4E62D8"
                            : a.platform === "google"
                              ? "#D97706"
                              : a.platform === "tiktok"
                                ? "#111827"
                                : "#6B7280",
                      }}
                    />
                    <span className="truncate text-gray-700 dark:text-[#C9CEDA]">
                      {accountLabel(a)}
                    </span>
                    <span className="shrink-0 text-[10.5px] uppercase tracking-wide text-gray-400 dark:text-[#5C6378]">
                      {PLATFORM_LABELS[a.platform] ?? a.platform}
                    </span>
                  </div>
                  <span className="font-medium text-gray-900 tabular-nums dark:text-[#EAEDF3]">
                    {fmtBRL2(a.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={onManage}>
              <Icon icon={Plus} size={16} className="mr-1.5" />
              Gerenciar lançamentos
            </Button>
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
    <div className="mt-3 rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-white dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <div className="text-[13px] font-semibold text-gray-900 dark:text-[#EAEDF3]">
            Vendas do período · cash collect
          </div>
          <div className="text-[11.5px] text-gray-500 dark:text-[#8B92A5]">
            {vendas.length > 0
              ? `${vendas.length} venda${vendas.length > 1 ? "s" : ""} — informe o valor recebido de cada uma`
              : "Nenhuma venda no período"}
          </div>
        </div>
        <Icon
          icon={ChevronDown}
          size={16}
          className={cn("text-gray-400 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && vendas.length > 0 && (
        <div className="border-t border-[rgba(0,0,0,0.06)] px-4 py-3 dark:border-[rgba(255,255,255,0.06)]">
          <div className="mb-2 grid grid-cols-[minmax(0,1fr)_100px_84px_110px] gap-3 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-gray-400 dark:text-[#5C6378]">
            <span>Deal</span>
            <span>Ganho em</span>
            <span className="text-right">Valor</span>
            <span className="text-right">Recebido</span>
          </div>
          <div className="space-y-1.5">
            {vendas.map((v) => (
              <div
                key={v.id}
                className="grid grid-cols-[minmax(0,1fr)_100px_84px_110px] items-center gap-3 text-[12.5px]"
              >
                <span className="truncate text-gray-700 dark:text-[#C9CEDA]">{v.title}</span>
                <span className="text-gray-500 tabular-nums dark:text-[#8B92A5]">
                  {v.won_at ? format(new Date(v.won_at), "dd/MM/yyyy") : dash}
                </span>
                <span className="text-right font-medium text-gray-900 tabular-nums dark:text-[#EAEDF3]">
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
                  className="crm-input w-full text-right tabular-nums"
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
        <Button variant="secondary" size="sm">
          <Icon icon={Filter} size={16} className="mr-1.5" />
          Filtros UTM
          {activeCount > 0 && (
            <span className="ml-1.5 rounded-full bg-gray-900 px-1.5 text-[10.5px] font-semibold text-white dark:bg-white dark:text-gray-900">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[280px] space-y-3 p-3">
        {fields.map((field) => (
          <div key={field.key} className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-gray-500 dark:text-[#8B92A5]">
              {field.label}
            </div>
            <select
              className="crm-input w-full"
              value={utm[field.key]}
              onChange={(e) => onChange({ ...utm, [field.key]: e.target.value })}
            >
              <option value="">Todas</option>
              {field.opts.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
        ))}
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            disabled={activeCount === 0}
            onClick={() => onChange({ source: "", medium: "", campaign: "" })}
          >
            Limpar filtros
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
