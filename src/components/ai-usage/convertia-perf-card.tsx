"use client"

/**
 * ConvertIA · Desempenho — card do dashboard de Custo de IA.
 *
 * Telemetria por rodada e por tool (ai_usage_events.context): quanto
 * do input veio do cache de prompt, rodadas por turno, roteamento
 * econômico, e a tabela de tools com tempo médio e taxa de erro.
 * Fonte: GET /api/ai/convertia/perf-stats.
 */

import useSWR from "swr"
import { Gauge } from "lucide-react"
import { fmtMs, fmtTokens } from "@/lib/ai/convertia/telemetry"

interface Payload {
  window_days: number
  turns: number
  with_telemetry: number
  cache: { tokens_input: number; tokens_cached: number; tokens_cache_write: number; hit_ratio: number }
  rounds: { total: number; avg_per_turn: number; cheap: number; rerouted: number; nudged: number }
  by_model: Array<{
    model: string
    turns: number
    avg_rounds: number | null
    avg_duration_ms: number
    tokens_input: number
    tokens_output: number
    cache_ratio: number
    avg_cost_cents: number
    errors: number
    cancelled: number
    continued: number
  }>
  by_tool: Array<{ name: string; connector: string; calls: number; avg_ms: number; error_rate: number; retries: number; codes: string }>
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

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[6px] border border-slate-100 dark:border-white/[0.06] px-3 py-2">
      <p className="text-[10.5px] uppercase tracking-[0.05em] text-slate-500 dark:text-white/50">{label}</p>
      <p className="text-[18px] font-semibold text-slate-900 dark:text-white">{value}</p>
      {sub && <p className="text-[10.5px] text-slate-400 dark:text-white/40">{sub}</p>}
    </div>
  )
}

export function ConvertiaPerfCard({ windowDays }: { windowDays: string }) {
  const { data, error } = useSWR<{ data?: Payload } | Payload>(
    `/api/ai/convertia/perf-stats?days=${windowDays}`,
    fetcher,
    { refreshInterval: 120_000 },
  )
  const p: Payload | undefined = data && "turns" in data ? (data as Payload) : (data as { data?: Payload } | undefined)?.data
  if (error) return null

  return (
    <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] overflow-x-auto">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">ConvertIA · Desempenho</h3>
        {p && (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-white/50">
            <Gauge className="h-3 w-3" />
            {p.turns.toLocaleString("pt-BR")} turnos · {p.with_telemetry.toLocaleString("pt-BR")} com telemetria por rodada
          </span>
        )}
      </div>
      {!p ? (
        <p className="px-4 pb-4 text-[12px] text-slate-400 dark:text-white/40">Carregando…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 px-4 pb-3 md:grid-cols-4">
            <Stat
              label="Input em cache"
              value={`${Math.round(p.cache.hit_ratio * 100)}%`}
              sub={`${fmtTokens(p.cache.tokens_cached)} de ${fmtTokens(p.cache.tokens_input)} tokens`}
            />
            <Stat label="Rodadas por turno" value={p.rounds.avg_per_turn ? String(p.rounds.avg_per_turn).replace(".", ",") : "—"} sub={`${p.rounds.total} rodadas`} />
            <Stat
              label="Modo econômico"
              value={String(p.rounds.cheap)}
              sub={`rodadas baratas · ${p.rounds.rerouted} refeitas no forte`}
            />
            <Stat label="Guard de consulta" value={String(p.rounds.nudged)} sub="respostas de memória descartadas" />
          </div>
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                <th className={TH_CLASS}>Modelo</th>
                <th className={TH_CLASS}>Turnos</th>
                <th className={TH_CLASS}>Rodadas</th>
                <th className={TH_CLASS}>Duração</th>
                <th className={TH_CLASS}>Cache</th>
                <th className={TH_CLASS}>Custo/turno</th>
                <th className={TH_CLASS}>Erros · parados · continuados</th>
              </tr>
            </thead>
            <tbody>
              {p.by_model.map((m) => (
                <tr key={m.model} className="border-b border-slate-50 dark:border-white/[0.03]">
                  <td className={`${TD_CLASS} font-mono text-[11px]`}>{m.model}</td>
                  <td className={TD_CLASS}>{m.turns}</td>
                  <td className={TD_CLASS}>{m.avg_rounds != null ? String(m.avg_rounds).replace(".", ",") : "—"}</td>
                  <td className={TD_CLASS}>{fmtMs(m.avg_duration_ms)}</td>
                  <td className={TD_CLASS}>{Math.round(m.cache_ratio * 100)}%</td>
                  <td className={TD_CLASS}>${(m.avg_cost_cents / 100).toFixed(3)}</td>
                  <td className={TD_CLASS}>
                    {m.errors} · {m.cancelled} · {m.continued}
                  </td>
                </tr>
              ))}
              {p.by_model.length === 0 && (
                <tr>
                  <td colSpan={7} className={`${TD_CLASS} text-slate-400`}>Sem turnos na janela.</td>
                </tr>
              )}
            </tbody>
          </table>
          {p.by_tool.length > 0 && (
            <>
              <p className="px-4 pt-3 pb-1 text-[11px] font-medium text-slate-500 dark:text-white/50">Por ferramenta</p>
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                    <th className={TH_CLASS}>Tool</th>
                    <th className={TH_CLASS}>Conector</th>
                    <th className={TH_CLASS}>Chamadas</th>
                    <th className={TH_CLASS}>Tempo médio</th>
                    <th className={TH_CLASS}>Erros</th>
                    <th className={TH_CLASS}>Retries</th>
                  </tr>
                </thead>
                <tbody>
                  {p.by_tool.slice(0, 15).map((t) => (
                    <tr key={t.name} className="border-b border-slate-50 dark:border-white/[0.03]">
                      <td className={`${TD_CLASS} font-mono text-[11px] max-w-[260px] truncate`}>{t.name}</td>
                      <td className={TD_CLASS}>{t.connector}</td>
                      <td className={TD_CLASS}>{t.calls}</td>
                      <td className={TD_CLASS}>{fmtMs(t.avg_ms)}</td>
                      <td className={TD_CLASS}>
                        {t.error_rate > 0 ? (
                          <span className="text-red-600 dark:text-red-400">
                            {Math.round(t.error_rate * 100)}%{t.codes ? ` (${t.codes})` : ""}
                          </span>
                        ) : (
                          "0%"
                        )}
                      </td>
                      <td className={TD_CLASS}>{t.retries}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </div>
  )
}
