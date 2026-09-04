"use client"

/**
 * ConvertIA · Feedback — card do dashboard de Custo de IA.
 *
 * Mostra a taxa de respostas marcadas como "Útil" 👍 por MODELO e por
 * SKILL na janela selecionada (mesma janela dos demais cards). Fonte:
 * GET /api/ai/convertia/feedback-stats (agrega ai_chat_messages.meta).
 */

import useSWR from "swr"
import { ThumbsUp } from "lucide-react"

interface Bucket {
  key: string
  responses: number
  useful: number
}

interface StatsPayload {
  window_days: number
  totals: { responses: number; useful: number }
  by_model: Bucket[]
  by_skill: Bucket[]
  truncated: boolean
}

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    const j = await r.json()
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
    return j
  })

const TH_CLASS =
  "text-left text-[11px] uppercase tracking-[0.05em] text-slate-500 dark:text-white/50 font-medium px-3 py-2"
const TD_CLASS = "px-3 py-1.5 text-[12px] text-slate-700 dark:text-white/75"

function rate(b: { responses: number; useful: number }): string {
  if (b.responses === 0) return "—"
  return `${Math.round((b.useful / b.responses) * 100)}%`
}

function BucketTable({ title, rows }: { title: string; rows: Bucket[] }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="px-3 pb-1 text-[11px] font-medium text-slate-500 dark:text-white/50">
        {title}
      </p>
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-100 dark:border-white/[0.06]">
            <th className={TH_CLASS}>{title === "Por modelo" ? "Modelo" : "Skill"}</th>
            <th className={TH_CLASS}>Respostas</th>
            <th className={TH_CLASS}>Úteis</th>
            <th className={TH_CLASS}>Taxa</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className={`${TD_CLASS} text-slate-400 dark:text-white/40`}>
                Sem dados na janela.
              </td>
            </tr>
          )}
          {rows.slice(0, 8).map((b) => (
            <tr key={b.key} className="border-b border-slate-50 dark:border-white/[0.03]">
              <td className={`${TD_CLASS} font-mono text-[11px] max-w-[220px] truncate`}>
                {b.key}
              </td>
              <td className={TD_CLASS}>{b.responses.toLocaleString("pt-BR")}</td>
              <td className={TD_CLASS}>{b.useful.toLocaleString("pt-BR")}</td>
              <td className={`${TD_CLASS} font-medium`}>{rate(b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ConvertiaFeedbackCard({ windowDays }: { windowDays: string }) {
  const { data, error } = useSWR<{ data?: StatsPayload } | StatsPayload>(
    `/api/ai/convertia/feedback-stats?days=${windowDays}`,
    fetcher,
    { refreshInterval: 120_000 },
  )
  const payload: StatsPayload | undefined =
    data && "totals" in data
      ? (data as StatsPayload)
      : (data as { data?: StatsPayload } | undefined)?.data

  if (error) return null

  return (
    <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] overflow-x-auto">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">
          ConvertIA · Feedback
        </h3>
        {payload && (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-white/50">
            <ThumbsUp className="h-3 w-3" />
            {payload.totals.useful.toLocaleString("pt-BR")} de{" "}
            {payload.totals.responses.toLocaleString("pt-BR")} respostas marcadas como úteis (
            {rate(payload.totals)})
          </span>
        )}
      </div>
      {payload ? (
        <div className="flex flex-col gap-4 pb-2 md:flex-row">
          <BucketTable title="Por modelo" rows={payload.by_model} />
          <BucketTable title="Por skill" rows={payload.by_skill} />
        </div>
      ) : (
        <p className="px-4 pb-4 text-[12px] text-slate-400 dark:text-white/40">Carregando…</p>
      )}
    </div>
  )
}
