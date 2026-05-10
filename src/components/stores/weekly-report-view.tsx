"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  Loader2,
} from "lucide-react"
import type { WeeklyReport } from "@/types/weekly-report"

interface StoreLite {
  id: string
  store_name: string
  platform: string | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Props {
  storeId: string
  initialWeek?: string
}

function fmtBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v)
}

function fmtDate(s: string): string {
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  })
}

function startOfWeekISO(d: Date): string {
  const dt = new Date(d)
  const day = dt.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  dt.setUTCDate(dt.getUTCDate() + diff)
  dt.setUTCHours(0, 0, 0, 0)
  return dt.toISOString().slice(0, 10)
}

function shiftWeek(weekISO: string, weeks: number): string {
  const d = new Date(weekISO + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + weeks * 7)
  return d.toISOString().slice(0, 10)
}

export function WeeklyReportView({ storeId, initialWeek }: Props) {
  const [week, setWeek] = useState<string>(
    initialWeek ?? startOfWeekISO(new Date(Date.now() - 7 * 24 * 3600 * 1000)),
  )
  const url = `/api/stores/${storeId}/weekly-report?week=${week}`
  const { data, mutate, isLoading } = useSWR<{
    store: StoreLite
    report: WeeklyReport | null
  }>(url, fetcher)

  const [aiSummary, setAiSummary] = useState<string>("")
  const [aiLoading, setAiLoading] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [reviewing, setReviewing] = useState(false)

  useEffect(() => {
    setAiSummary("")
  }, [week])

  const report = data?.report
  const store = data?.store

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      await fetch(`/api/stores/${storeId}/weekly-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week }),
      })
      await mutate()
    } finally {
      setRegenerating(false)
    }
  }

  const handleMarkReviewed = async () => {
    if (!report) return
    setReviewing(true)
    try {
      await fetch(`/api/stores/${storeId}/weekly-report/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week }),
      })
      await mutate()
    } finally {
      setReviewing(false)
    }
  }

  const generateAiBriefing = async () => {
    if (!report || !store) return
    setAiLoading(true)
    setAiSummary("")
    try {
      const messages = [
        {
          role: "user" as const,
          content: `Gere um briefing de 5 minutos para uma call de acompanhamento da loja "${store.store_name}".

Dados da semana ${fmtDate(report.week_start)} a ${fmtDate(report.week_end)}:
- Receita: ${fmtBRL(report.metrics.revenue.current)} (${report.metrics.revenue.change_pct >= 0 ? "+" : ""}${report.metrics.revenue.change_pct}% vs semana anterior)
- Campanhas enviadas: ${report.metrics.campaigns_sent}
- Taxa de abertura: ${(report.metrics.opens.rate * 100).toFixed(1)}%
- Taxa de clique: ${(report.metrics.clicks.rate * 100).toFixed(1)}%
- Top flow: ${report.metrics.flows.top_flows[0]?.flow_name ?? "N/A"} (${fmtBRL(report.metrics.flows.top_flows[0]?.revenue ?? 0)})

Highlights: ${report.highlights.join(" / ") || "—"}
Concerns: ${report.concerns.join(" / ") || "—"}
Suggestions: ${report.suggestions.join(" / ") || "—"}

Estrutura: contexto rapido, 2-3 pontos para parabenizar, 2-3 pontos de atencao, proximos passos sugeridos. Tom direto e pratico, em pt-BR.`,
        },
      ]
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          context: { store_id: storeId },
        }),
      })
      if (!res.ok || !res.body) {
        setAiSummary("Falha ao gerar briefing. Tente novamente.")
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ""
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue
          const payload = line.slice(6).trim()
          if (payload === "[DONE]") continue
          try {
            const j = JSON.parse(payload)
            if (j.text) {
              acc += j.text
              setAiSummary(acc)
            }
          } catch {
            // ignore
          }
        }
      }
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="max-w-[1100px] mx-auto space-y-5">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">
            Feedback semanal
          </p>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-slate-900 dark:text-white">
            {store?.store_name ?? "Carregando..."}
          </h1>
          {report && (
            <p className="mt-1 text-[13px] text-slate-500 dark:text-white/55">
              Semana de {fmtDate(report.week_start)} a {fmtDate(report.week_end)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeek((w) => shiftWeek(w, -1))}
            className="inline-flex items-center justify-center h-8 w-8 rounded-[6px] border border-black/[0.08] dark:border-white/[0.10] hover:bg-slate-50 dark:hover:bg-white/[0.04]"
            aria-label="Semana anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[12px] font-medium text-slate-600 dark:text-white/70 tabular-nums w-[100px] text-center">
            {fmtDate(week)}
          </span>
          <button
            type="button"
            onClick={() => setWeek((w) => shiftWeek(w, 1))}
            className="inline-flex items-center justify-center h-8 w-8 rounded-[6px] border border-black/[0.08] dark:border-white/[0.10] hover:bg-slate-50 dark:hover:bg-white/[0.04]"
            aria-label="Próxima semana"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerating}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] text-[12px] font-medium border border-black/[0.08] dark:border-white/[0.10] hover:bg-slate-50 dark:hover:bg-white/[0.04] disabled:opacity-50"
          >
            {regenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Recalcular
          </button>
          {report && !report.is_reviewed && (
            <button
              type="button"
              onClick={handleMarkReviewed}
              disabled={reviewing}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] text-[12px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {reviewing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Marcar como revisado
            </button>
          )}
          {report?.is_reviewed && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded">
              <CheckCircle2 className="h-3 w-3" />
              Revisado
            </span>
          )}
        </div>
      </header>

      {isLoading && (
        <div className="py-12 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      )}

      {!isLoading && !report && (
        <div className="rounded-[8px] border border-dashed border-slate-300 dark:border-white/[0.10] py-10 text-center">
          <p className="text-[13px] font-medium text-slate-700 dark:text-white/80">
            Sem dados para esta semana
          </p>
          <p className="mt-1 text-[12px] text-slate-500 dark:text-white/45">
            A loja não tem métricas Omnisend para o período selecionado.
          </p>
        </div>
      )}

      {report && <ReportBody report={report} onAI={generateAiBriefing} aiSummary={aiSummary} aiLoading={aiLoading} />}
    </div>
  )
}

function ReportBody({
  report,
  onAI,
  aiSummary,
  aiLoading,
}: {
  report: WeeklyReport
  onAI: () => void
  aiSummary: string
  aiLoading: boolean
}) {
  const m = report.metrics

  const openRatePts = useMemo(
    () => Math.round((m.opens.rate - m.opens.rate_previous) * 100),
    [m],
  )
  const clickRatePts = useMemo(
    () => Math.round((m.clicks.rate - m.clicks.rate_previous) * 100),
    [m],
  )

  return (
    <>
      {/* KPIs grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KpiCard
          label="Receita"
          value={fmtBRL(m.revenue.current)}
          changePct={m.revenue.change_pct}
        />
        <KpiCard
          label="Campanhas enviadas"
          value={String(m.campaigns_sent)}
          neutral
        />
        <KpiCard
          label="Taxa de abertura"
          value={`${(m.opens.rate * 100).toFixed(1)}%`}
          changePct={openRatePts}
          unit="pp"
        />
        <KpiCard
          label="Taxa de clique"
          value={`${(m.clicks.rate * 100).toFixed(1)}%`}
          changePct={clickRatePts}
          unit="pp"
        />
      </div>

      {/* Top flows */}
      <section className="rounded-[8px] border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#161922] overflow-hidden">
        <div className="px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.06] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-slate-900 dark:text-white">
            Top flows da semana
          </h2>
          <span className="text-[11px] text-slate-500 dark:text-white/45 tabular-nums">
            {fmtBRL(m.flows.revenue_total)} total
          </span>
        </div>
        {m.flows.top_flows.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12px] text-slate-500 dark:text-white/45">
            Nenhum flow gerou receita nesta semana.
          </div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead className="bg-slate-50/60 dark:bg-white/[0.02] text-[10px] uppercase tracking-wide text-slate-500 dark:text-white/45">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Flow</th>
                <th className="text-right px-4 py-2 font-semibold">Receita</th>
                <th className="text-right px-4 py-2 font-semibold">Conversões</th>
              </tr>
            </thead>
            <tbody>
              {m.flows.top_flows.map((f) => (
                <tr
                  key={f.flow_id}
                  className="border-t border-black/[0.04] dark:border-white/[0.04]"
                >
                  <td className="px-4 py-2 text-slate-800 dark:text-white/85">
                    {f.flow_name}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-900 dark:text-white">
                    {fmtBRL(f.revenue)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-white/70">
                    {f.conversions}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Insights grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <InsightCard
          title="Destaques"
          tone="success"
          items={report.highlights}
          emptyText="Sem destaques."
        />
        <InsightCard
          title="Pontos de atenção"
          tone="warn"
          items={report.concerns}
          emptyText="Sem pontos de atenção."
        />
        <InsightCard
          title="Sugestões para call"
          tone="info"
          items={report.suggestions}
          emptyText="Sem sugestões."
        />
      </div>

      {/* AI Briefing */}
      <section className="rounded-[8px] border border-violet-200 dark:border-violet-900/40 bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-950/20 dark:to-blue-950/20">
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-violet-100 dark:border-violet-900/30">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <div>
              <h2 className="text-[13px] font-semibold text-slate-900 dark:text-white">
                Briefing IA para call
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-white/55">
                Resumo de 5 minutos pronto pra abrir a reunião.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onAI}
            disabled={aiLoading}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] text-[12px] font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {aiLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {aiSummary ? "Regenerar" : "Gerar briefing"}
          </button>
        </div>
        {aiSummary && (
          <div className="px-4 py-3 text-[13px] text-slate-800 dark:text-white/85 leading-relaxed whitespace-pre-wrap">
            {aiSummary}
          </div>
        )}
      </section>
    </>
  )
}

function KpiCard({
  label,
  value,
  changePct,
  unit,
  neutral,
}: {
  label: string
  value: string
  changePct?: number
  unit?: "%" | "pp"
  neutral?: boolean
}) {
  const positive = changePct != null && changePct > 0
  const negative = changePct != null && changePct < 0
  const Icon = positive ? TrendingUp : negative ? TrendingDown : Minus
  const colorClass = neutral
    ? "text-slate-500 dark:text-white/55"
    : positive
      ? "text-emerald-600 dark:text-emerald-400"
      : negative
        ? "text-red-600 dark:text-red-400"
        : "text-slate-500 dark:text-white/55"

  return (
    <div className="rounded-[8px] border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#161922] p-3.5">
      <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-white/45">
        {label}
      </p>
      <p className="mt-1.5 text-[20px] font-semibold tracking-tight text-slate-900 dark:text-white tabular-nums">
        {value}
      </p>
      {!neutral && changePct != null && (
        <div
          className={
            "mt-1 inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums " +
            colorClass
          }
        >
          <Icon className="h-3 w-3" />
          {changePct > 0 ? "+" : ""}
          {changePct}
          {unit ?? "%"} vs semana anterior
        </div>
      )}
    </div>
  )
}

function InsightCard({
  title,
  tone,
  items,
  emptyText,
}: {
  title: string
  tone: "success" | "warn" | "info"
  items: string[]
  emptyText: string
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20"
      : tone === "warn"
        ? "border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20"
        : "border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20"

  const titleColor =
    tone === "success"
      ? "text-emerald-800 dark:text-emerald-300"
      : tone === "warn"
        ? "text-amber-800 dark:text-amber-300"
        : "text-blue-800 dark:text-blue-300"

  return (
    <div className={`rounded-[8px] border ${toneClass} p-3.5`}>
      <p className={`text-[12px] uppercase tracking-wide font-semibold ${titleColor}`}>
        {title}
      </p>
      {items.length === 0 ? (
        <p className="mt-2 text-[12px] text-slate-500 dark:text-white/45">
          {emptyText}
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((it, i) => (
            <li
              key={i}
              className="text-[12.5px] leading-relaxed text-slate-800 dark:text-white/85"
            >
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
