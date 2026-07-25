"use client"

/**
 * Dashboard de custo de IA — consome /api/admin/ai-usage.
 *
 * Seções:
 *   - Cards de totais (custo, tokens, execuções, taxa de erro)
 *   - Gráfico de custo por dia (recharts)
 *   - Tabela por agente/feature (custo desc)
 *   - Tabela por modelo
 *   - Execuções recentes (50, erros destacados)
 */
import { useState } from "react"
import dynamic from "next/dynamic"
import useSWR from "swr"
import { Loader2 } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/ui/page-header"
import { SegmentedTabs, SegmentedTabItem } from "@/components/ui/segmented-tabs"
import { AGENT_VISUAL, type PipelineAgentKey } from "@/lib/agents/agent-visual"

const AiUsageCostChart = dynamic(
  () => import("./ai-usage-cost-chart").then((m) => ({ default: m.AiUsageCostChart })),
  {
    loading: () => <Skeleton className="h-full w-full rounded-[6px]" />,
    ssr: false,
  }
)

interface Aggregate {
  runs: number
  errors: number
  tokens_input: number
  tokens_output: number
  cost_cents: number
  cost_usd: number
  avg_duration_ms: number
}

interface UsagePayload {
  window_days: number
  truncated: boolean
  totals: Aggregate
  by_feature: Array<Aggregate & { feature: string; source: string }>
  by_model: Array<Aggregate & { model: string }>
  by_day: Array<Aggregate & { day: string }>
  recent: Array<{
    id: string
    source: string
    feature: string
    model: string | null
    status: string
    tokens_input: number
    tokens_output: number
    cost_cents: number
    duration_ms: number
    created_at: string
  }>
}

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    const j = await r.json()
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
    return j
  })

const WINDOWS = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
] as const

const SOURCE_LABELS: Record<string, string> = {
  email_generation: "Pipeline Emails",
  campaign_central: "Campanhas",
  crm: "CRM",
  standalone: "Avulso",
}

/**
 * Rótulo amigável do feature. No pipeline de emails o `feature` é o
 * `agent_type` cru (ex.: `assembler_chooser`) — mapeia pro nome de exibição
 * (Curador, Montador, Blueprint…) via AGENT_VISUAL. Outras sources mantêm o cru.
 */
function featureLabel(feature: string, source: string): string {
  if (source === "email_generation") {
    return AGENT_VISUAL[feature as PipelineAgentKey]?.name ?? feature
  }
  return feature
}

function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-4">
      <p className="text-[11px] uppercase tracking-[0.05em] text-slate-500 dark:text-white/50">
        {label}
      </p>
      <p className="text-[22px] font-semibold text-slate-900 dark:text-white mt-1">
        {value}
      </p>
      {sub && (
        <p className="text-[11px] text-slate-400 dark:text-white/40">{sub}</p>
      )}
    </div>
  )
}

const TH_CLASS =
  "text-left text-[11px] uppercase tracking-[0.05em] text-slate-500 dark:text-white/50 font-medium px-3 py-2"
const TD_CLASS = "px-3 py-1.5 text-[12px] text-slate-700 dark:text-white/75"

export function AiUsageDashboard() {
  const [windowDays, setWindowDays] = useState<string>("30")
  const { data, isLoading, error } = useSWR<{ data: UsagePayload } | UsagePayload>(
    `/api/admin/ai-usage?days=${windowDays}`,
    fetcher,
    { refreshInterval: 60_000 },
  )

  // successResponse pode envelopar em { data } — aceita os 2 formatos
  const payload: UsagePayload | undefined =
    data && "totals" in data
      ? (data as UsagePayload)
      : (data as { data: UsagePayload } | undefined)?.data

  return (
    <div className="space-y-5 max-w-[1100px]">
      <PageHeader
        title="Custo de IA"
        description="Cada execução de cada agente interno: tokens, custo e duração. Atualiza a cada 60s."
      />

      <SegmentedTabs value={windowDays} onValueChange={setWindowDays}>
        {WINDOWS.map((w) => (
          <SegmentedTabItem key={w.value} value={w.value}>
            {w.label}
          </SegmentedTabItem>
        ))}
      </SegmentedTabs>

      {isLoading && !payload && (
        <div className="flex items-center gap-2 text-[13px] text-slate-500 dark:text-white/50 py-10 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando telemetria…
        </div>
      )}

      {error && (
        <div className="rounded-[4px] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-3 py-2 text-[12px] text-red-800 dark:text-red-200">
          {(error as Error).message}
        </div>
      )}

      {payload && (
        <>
          {payload.truncated && (
            <div className="rounded-[4px] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
              Volume acima de 10k execuções no período — agregados truncados.
              Reduza a janela pra precisão total.
            </div>
          )}

          {/* ── Totais ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="Custo total"
              value={usd(payload.totals.cost_cents)}
              sub={`últimos ${payload.window_days} dias`}
            />
            <StatCard
              label="Execuções"
              value={payload.totals.runs.toLocaleString("pt-BR")}
              sub={`${payload.totals.errors} erro(s)`}
            />
            <StatCard
              label="Tokens input"
              value={tokens(payload.totals.tokens_input)}
            />
            <StatCard
              label="Tokens output"
              value={tokens(payload.totals.tokens_output)}
            />
          </div>

          {/* ── Custo por dia ──────────────────────────────── */}
          <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-4">
            <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white mb-3">
              Custo por dia (USD)
            </h3>
            <div className="h-[200px]">
              <AiUsageCostChart data={payload.by_day} />
            </div>
          </div>

          {/* ── Por agente ─────────────────────────────────── */}
          <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] overflow-x-auto">
            <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white px-4 pt-4 pb-2">
              Por agente / feature
            </h3>
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                  <th className={TH_CLASS}>Agente</th>
                  <th className={TH_CLASS}>Módulo</th>
                  <th className={TH_CLASS}>Execuções</th>
                  <th className={TH_CLASS}>Erros</th>
                  <th className={TH_CLASS}>Tokens in</th>
                  <th className={TH_CLASS}>Tokens out</th>
                  <th className={TH_CLASS}>Duração média</th>
                  <th className={TH_CLASS}>Custo</th>
                </tr>
              </thead>
              <tbody>
                {payload.by_feature.map((f) => (
                  <tr
                    key={f.feature}
                    className="border-b border-slate-50 dark:border-white/[0.03] hover:bg-slate-50/50 dark:hover:bg-white/[0.02]"
                  >
                    <td className={`${TD_CLASS} font-medium text-slate-900 dark:text-white`}>
                      {featureLabel(f.feature, f.source)}
                    </td>
                    <td className={TD_CLASS}>{SOURCE_LABELS[f.source] ?? f.source}</td>
                    <td className={TD_CLASS}>{f.runs.toLocaleString("pt-BR")}</td>
                    <td className={TD_CLASS}>
                      {f.errors > 0 ? (
                        <span className="text-red-600 dark:text-red-400">{f.errors}</span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td className={TD_CLASS}>{tokens(f.tokens_input)}</td>
                    <td className={TD_CLASS}>{tokens(f.tokens_output)}</td>
                    <td className={TD_CLASS}>{Math.round(f.avg_duration_ms)}ms</td>
                    <td className={`${TD_CLASS} font-medium`}>{usd(f.cost_cents)}</td>
                  </tr>
                ))}
                {payload.by_feature.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-[12px] text-slate-400">
                      Sem execuções no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── Por modelo ─────────────────────────────────── */}
          <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] overflow-x-auto">
            <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white px-4 pt-4 pb-2">
              Por modelo
            </h3>
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                  <th className={TH_CLASS}>Modelo</th>
                  <th className={TH_CLASS}>Execuções</th>
                  <th className={TH_CLASS}>Tokens in</th>
                  <th className={TH_CLASS}>Tokens out</th>
                  <th className={TH_CLASS}>Custo</th>
                </tr>
              </thead>
              <tbody>
                {payload.by_model.map((m) => (
                  <tr
                    key={m.model}
                    className="border-b border-slate-50 dark:border-white/[0.03]"
                  >
                    <td className={`${TD_CLASS} font-mono text-[11px]`}>{m.model}</td>
                    <td className={TD_CLASS}>{m.runs.toLocaleString("pt-BR")}</td>
                    <td className={TD_CLASS}>{tokens(m.tokens_input)}</td>
                    <td className={TD_CLASS}>{tokens(m.tokens_output)}</td>
                    <td className={`${TD_CLASS} font-medium`}>{usd(m.cost_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Recentes ───────────────────────────────────── */}
          <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] overflow-x-auto">
            <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white px-4 pt-4 pb-2">
              Execuções recentes
            </h3>
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                  <th className={TH_CLASS}>Quando</th>
                  <th className={TH_CLASS}>Agente</th>
                  <th className={TH_CLASS}>Modelo</th>
                  <th className={TH_CLASS}>Status</th>
                  <th className={TH_CLASS}>Tokens (in/out)</th>
                  <th className={TH_CLASS}>Duração</th>
                  <th className={TH_CLASS}>Custo</th>
                </tr>
              </thead>
              <tbody>
                {payload.recent.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-50 dark:border-white/[0.03]"
                  >
                    <td className={TD_CLASS}>
                      {new Date(r.created_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className={`${TD_CLASS} font-medium text-slate-900 dark:text-white`}>
                      {featureLabel(r.feature, r.source)}
                    </td>
                    <td className={`${TD_CLASS} font-mono text-[11px]`}>{r.model ?? "—"}</td>
                    <td className={TD_CLASS}>
                      {r.status === "error" ? (
                        <span className="text-red-600 dark:text-red-400 font-medium">erro</span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400">ok</span>
                      )}
                    </td>
                    <td className={TD_CLASS}>
                      {tokens(r.tokens_input)} / {tokens(r.tokens_output)}
                    </td>
                    <td className={TD_CLASS}>{r.duration_ms}ms</td>
                    <td className={TD_CLASS}>{usd(Number(r.cost_cents))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
