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
  Pencil,
  X,
  ShoppingBag,
  Save,
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
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

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

  const handleSaveEdits = async (
    edits: Parameters<
      typeof saveWeeklyReportEdits
    >[2],
  ) => {
    if (!report) return
    setSaving(true)
    try {
      await saveWeeklyReportEdits(storeId, week, edits)
      await mutate()
      setEditing(false)
    } finally {
      setSaving(false)
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
          {report && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className={
                "inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] text-[12px] font-medium border " +
                (editing
                  ? "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-700"
                  : "border-black/[0.08] dark:border-white/[0.10] hover:bg-slate-50 dark:hover:bg-white/[0.04]")
              }
              title={
                editing
                  ? "Sair do modo de edicao (descarta alteracoes nao salvas)"
                  : "Editar dados manualmente"
              }
            >
              {editing ? (
                <>
                  <X className="h-3.5 w-3.5" />
                  Cancelar edicao
                </>
              ) : (
                <>
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </>
              )}
            </button>
          )}
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

      {report && (
        <ReportBody
          report={report}
          onAI={generateAiBriefing}
          aiSummary={aiSummary}
          aiLoading={aiLoading}
          editing={editing}
          saving={saving}
          onSave={handleSaveEdits}
        />
      )}
    </div>
  )
}

// ── Helper: salva edicao no backend ─────────────────────────────
interface ReportEdits {
  metrics_overrides?: {
    revenue?: { current?: number; previous?: number }
    campaigns_sent?: number
    opens?: { current?: number; rate?: number }
    clicks?: { current?: number; rate?: number }
    paid_orders?: {
      count?: number
      value?: number
      previous_count?: number
      previous_value?: number
    }
  }
  highlights?: string[]
  concerns?: string[]
  suggestions?: string[]
}

async function saveWeeklyReportEdits(
  storeId: string,
  week: string,
  edits: ReportEdits,
): Promise<void> {
  const res = await fetch(`/api/stores/${storeId}/weekly-report`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ week, ...edits }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message || body?.error || "Falha ao salvar")
  }
}

function ReportBody({
  report,
  onAI,
  aiSummary,
  aiLoading,
  editing,
  saving,
  onSave,
}: {
  report: WeeklyReport
  onAI: () => void
  aiSummary: string
  aiLoading: boolean
  editing: boolean
  saving: boolean
  onSave: (edits: ReportEdits) => Promise<void>
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

  // ── Edit state (so usado quando editing=true) ──
  const [editRevenue, setEditRevenue] = useState<string>("")
  const [editCampaigns, setEditCampaigns] = useState<string>("")
  const [editOpenRate, setEditOpenRate] = useState<string>("")
  const [editClickRate, setEditClickRate] = useState<string>("")
  const [editPaidCount, setEditPaidCount] = useState<string>("")
  const [editPaidValue, setEditPaidValue] = useState<string>("")
  const [editHighlights, setEditHighlights] = useState<string>("")
  const [editConcerns, setEditConcerns] = useState<string>("")
  const [editSuggestions, setEditSuggestions] = useState<string>("")

  useEffect(() => {
    if (!editing) return
    setEditRevenue(String(m.revenue.current))
    setEditCampaigns(String(m.campaigns_sent))
    setEditOpenRate((m.opens.rate * 100).toFixed(2))
    setEditClickRate((m.clicks.rate * 100).toFixed(2))
    setEditPaidCount(String(m.paid_orders?.count ?? 0))
    setEditPaidValue(String(m.paid_orders?.value ?? 0))
    setEditHighlights(report.highlights.join("\n"))
    setEditConcerns(report.concerns.join("\n"))
    setEditSuggestions(report.suggestions.join("\n"))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  async function submitEdits() {
    const num = (s: string): number | undefined => {
      const v = parseFloat(s.replace(",", "."))
      return Number.isFinite(v) ? v : undefined
    }
    const intnum = (s: string): number | undefined => {
      const v = parseInt(s, 10)
      return Number.isFinite(v) ? v : undefined
    }
    const splitLines = (s: string): string[] =>
      s.split("\n").map((l) => l.trim()).filter(Boolean)

    const overrides: ReportEdits["metrics_overrides"] = {}
    const rev = num(editRevenue)
    if (rev !== undefined && rev !== m.revenue.current) {
      overrides.revenue = { current: rev }
    }
    const camp = intnum(editCampaigns)
    if (camp !== undefined && camp !== m.campaigns_sent) {
      overrides.campaigns_sent = camp
    }
    const orate = num(editOpenRate)
    if (orate !== undefined) {
      const v = +(orate / 100).toFixed(4)
      if (Math.abs(v - m.opens.rate) > 0.0001) {
        overrides.opens = { rate: v }
      }
    }
    const crate = num(editClickRate)
    if (crate !== undefined) {
      const v = +(crate / 100).toFixed(4)
      if (Math.abs(v - m.clicks.rate) > 0.0001) {
        overrides.clicks = { rate: v }
      }
    }
    const pcount = intnum(editPaidCount)
    const pvalue = num(editPaidValue)
    if (
      pcount !== undefined &&
      pvalue !== undefined &&
      (pcount !== (m.paid_orders?.count ?? 0) ||
        pvalue !== (m.paid_orders?.value ?? 0))
    ) {
      overrides.paid_orders = { count: pcount, value: pvalue }
    }

    await onSave({
      metrics_overrides: Object.keys(overrides).length ? overrides : undefined,
      highlights: splitLines(editHighlights),
      concerns: splitLines(editConcerns),
      suggestions: splitLines(editSuggestions),
    })
  }

  return (
    <>
      {editing && (
        <div className="rounded-[8px] border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 flex items-center justify-between gap-3">
          <div className="text-[12.5px] text-amber-900 dark:text-amber-200">
            <b>Modo edição</b> · ajuste qualquer campo abaixo. Os valores
            sobrescrevem o auto-gerado e ficam marcados como manuais.
          </div>
          <button
            type="button"
            onClick={submitEdits}
            disabled={saving}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] text-[12px] font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Salvar edições
          </button>
        </div>
      )}

      {/* KPIs grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KpiCard
          label="Receita"
          value={fmtBRL(m.revenue.current)}
          changePct={m.revenue.change_pct}
          editing={editing}
          editValue={editRevenue}
          onEdit={setEditRevenue}
          editPrefix="R$ "
        />
        <KpiCard
          label="Campanhas enviadas"
          value={String(m.campaigns_sent)}
          neutral
          editing={editing}
          editValue={editCampaigns}
          onEdit={setEditCampaigns}
        />
        <KpiCard
          label="Taxa de abertura"
          value={`${(m.opens.rate * 100).toFixed(1)}%`}
          changePct={openRatePts}
          unit="pp"
          editing={editing}
          editValue={editOpenRate}
          onEdit={setEditOpenRate}
          editSuffix="%"
        />
        <KpiCard
          label="Taxa de clique"
          value={`${(m.clicks.rate * 100).toFixed(1)}%`}
          changePct={clickRatePts}
          unit="pp"
          editing={editing}
          editValue={editClickRate}
          onEdit={setEditClickRate}
          editSuffix="%"
        />
      </div>

      {/* Pedidos pagos */}
      <PaidOrdersSection
        report={report}
        editing={editing}
        editCount={editPaidCount}
        editValue={editPaidValue}
        onEditCount={setEditPaidCount}
        onEditValue={setEditPaidValue}
      />

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
          editing={editing}
          editValue={editHighlights}
          onEdit={setEditHighlights}
        />
        <InsightCard
          title="Pontos de atenção"
          tone="warn"
          items={report.concerns}
          emptyText="Sem pontos de atenção."
          editing={editing}
          editValue={editConcerns}
          onEdit={setEditConcerns}
        />
        <InsightCard
          title="Sugestões para call"
          tone="info"
          items={report.suggestions}
          emptyText="Sem sugestões."
          editing={editing}
          editValue={editSuggestions}
          onEdit={setEditSuggestions}
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
  editing,
  editValue,
  onEdit,
  editPrefix,
  editSuffix,
}: {
  label: string
  value: string
  changePct?: number
  unit?: "%" | "pp"
  neutral?: boolean
  editing?: boolean
  editValue?: string
  onEdit?: (v: string) => void
  editPrefix?: string
  editSuffix?: string
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
    <div
      className={
        "rounded-[8px] border bg-white dark:bg-[#161922] p-3.5 " +
        (editing
          ? "border-amber-300 dark:border-amber-700"
          : "border-black/[0.06] dark:border-white/[0.08]")
      }
    >
      <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-white/45">
        {label}
      </p>
      {editing && onEdit ? (
        <div className="mt-1.5 inline-flex items-center gap-1 text-[16px] font-semibold tabular-nums">
          {editPrefix && (
            <span className="text-slate-500 dark:text-white/55">
              {editPrefix}
            </span>
          )}
          <input
            type="text"
            inputMode="decimal"
            value={editValue ?? ""}
            onChange={(e) => onEdit(e.target.value)}
            className="w-full text-[20px] font-semibold tracking-tight bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-[4px] px-2 py-0.5 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-400"
            style={{ minWidth: 0 }}
          />
          {editSuffix && (
            <span className="text-slate-500 dark:text-white/55">
              {editSuffix}
            </span>
          )}
        </div>
      ) : (
        <p className="mt-1.5 text-[20px] font-semibold tracking-tight text-slate-900 dark:text-white tabular-nums">
          {value}
        </p>
      )}
      {!neutral && changePct != null && !editing && (
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

function PaidOrdersSection({
  report,
  editing,
  editCount,
  editValue,
  onEditCount,
  onEditValue,
}: {
  report: WeeklyReport
  editing: boolean
  editCount: string
  editValue: string
  onEditCount: (v: string) => void
  onEditValue: (v: string) => void
}) {
  const po = report.metrics.paid_orders
  const count = po?.count ?? 0
  const value = po?.value ?? 0
  const prevCount = po?.previous_count ?? 0
  const source = po?.source ?? "none"

  const countDelta = prevCount > 0 ? Math.round(((count - prevCount) / prevCount) * 100) : 0

  const sourceLabel = {
    tracking: { label: "Automático (Shopify)", color: "emerald" },
    manual: { label: "Manual", color: "amber" },
    estimated: { label: "Estimado", color: "blue" },
    none: { label: "Sem fonte automática", color: "slate" },
  }[source]

  const avgTicket = count > 0 ? value / count : 0

  return (
    <section
      className={
        "rounded-[8px] border bg-white dark:bg-[#161922] overflow-hidden " +
        (editing
          ? "border-amber-300 dark:border-amber-700"
          : "border-black/[0.06] dark:border-white/[0.08]")
      }
    >
      <div className="px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
            <ShoppingBag className="h-3.5 w-3.5" />
          </span>
          <div>
            <h2 className="text-[13px] font-semibold text-slate-900 dark:text-white">
              Pedidos pagos
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-white/55">
              Total de pedidos com status <code>paid</code> no período
            </p>
          </div>
        </div>
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-[4px] bg-${sourceLabel.color}-50 dark:bg-${sourceLabel.color}-900/20 text-${sourceLabel.color}-700 dark:text-${sourceLabel.color}-300`}
        >
          {sourceLabel.label}
        </span>
      </div>
      <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-white/45">
            Quantidade
          </p>
          {editing ? (
            <input
              type="number"
              min={0}
              value={editCount}
              onChange={(e) => onEditCount(e.target.value)}
              className="mt-1.5 w-full text-[22px] font-semibold tracking-tight bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-[4px] px-2 py-0.5 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-400 tabular-nums"
            />
          ) : (
            <p className="mt-1.5 text-[22px] font-semibold tracking-tight text-slate-900 dark:text-white tabular-nums">
              {count}
            </p>
          )}
          {!editing && countDelta !== 0 && (
            <p
              className={
                "mt-1 text-[11px] font-semibold tabular-nums " +
                (countDelta > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400")
              }
            >
              {countDelta > 0 ? "+" : ""}
              {countDelta}% vs semana anterior
            </p>
          )}
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-white/45">
            Receita total
          </p>
          {editing ? (
            <div className="mt-1.5 inline-flex items-center gap-1 w-full">
              <span className="text-slate-500 dark:text-white/55">R$</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={editValue}
                onChange={(e) => onEditValue(e.target.value)}
                className="flex-1 text-[22px] font-semibold tracking-tight bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-[4px] px-2 py-0.5 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-400 tabular-nums"
              />
            </div>
          ) : (
            <p className="mt-1.5 text-[22px] font-semibold tracking-tight text-slate-900 dark:text-white tabular-nums">
              {fmtBRL(value)}
            </p>
          )}
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-white/45">
            Ticket médio
          </p>
          <p className="mt-1.5 text-[22px] font-semibold tracking-tight text-slate-900 dark:text-white tabular-nums">
            {count > 0 ? fmtBRL(avgTicket) : "—"}
          </p>
          {!editing && (
            <p className="mt-1 text-[11px] text-slate-500 dark:text-white/45">
              {prevCount > 0
                ? `${prevCount} pedidos · ${fmtBRL(po?.previous_value ?? 0)} na semana anterior`
                : "Sem comparativo da semana anterior"}
            </p>
          )}
        </div>
      </div>
      {source === "none" && !editing && (
        <div className="px-4 py-2.5 border-t border-black/[0.04] dark:border-white/[0.06] text-[11.5px] text-slate-500 dark:text-white/55 bg-slate-50/60 dark:bg-white/[0.02]">
          Sem integração de tracking Shopify pra essa loja. Use{" "}
          <b>Editar</b> pra preencher manualmente.
        </div>
      )}
    </section>
  )
}

function InsightCard({
  title,
  tone,
  items,
  emptyText,
  editing,
  editValue,
  onEdit,
}: {
  title: string
  tone: "success" | "warn" | "info"
  items: string[]
  emptyText: string
  editing?: boolean
  editValue?: string
  onEdit?: (v: string) => void
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
      {editing && onEdit ? (
        <textarea
          value={editValue ?? ""}
          onChange={(e) => onEdit(e.target.value)}
          placeholder="1 item por linha"
          rows={Math.max(4, items.length + 1)}
          className="mt-2 w-full bg-white/70 dark:bg-black/20 border border-amber-300 dark:border-amber-700 rounded-[4px] px-2 py-1.5 text-[12.5px] leading-relaxed text-slate-800 dark:text-white/85 outline-none focus:ring-2 focus:ring-amber-400 resize-y font-mono"
        />
      ) : items.length === 0 ? (
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
