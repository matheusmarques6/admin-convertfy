"use client"

/**
 * ConvertIA · Avaliação — card do dashboard de Custo de IA.
 *
 * Conjunto de avaliação (perguntas reais dos 👍) rodado em 2–3 modelos
 * com nota do juiz: compara nota média × custo por modelo e por lote,
 * lista os casos (ativar/desativar, adicionar à mão) e permite rodar
 * um lote agora. Fonte: /api/ai/convertia/eval.
 */

import { useState } from "react"
import useSWR from "swr"
import { FlaskConical, Loader2, Plus, RefreshCw } from "lucide-react"
import { fmtMs } from "@/lib/ai/convertia/telemetry"

interface ModelAgg {
  model: string
  runs: number
  errors: number
  avg_score: number | null
  avg_cost_cents: number
  avg_duration_ms: number
  avg_tool_calls: number
}
interface Payload {
  schema_missing: boolean
  models: string[]
  cases: Array<{
    id: string
    prompt: string
    workspace: string
    is_active: boolean
    created_at: string
    latest: Array<{ model: string; score: number | string | null; status: string; comentario: string | null }>
  }>
  batches: Array<{ batch_id: string; started_at: string; models: ModelAgg[] }>
  by_model: ModelAgg[]
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

function score(v: number | string | null | undefined): string {
  if (v == null || v === "") return "—"
  return Number(v).toFixed(1).replace(".", ",")
}

export function ConvertiaEvalCard() {
  const { data, error, mutate } = useSWR<{ data?: Payload } | Payload>("/api/ai/convertia/eval", fetcher)
  const p: Payload | undefined = data && "cases" in data ? (data as Payload) : (data as { data?: Payload } | undefined)?.data
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [prompt, setPrompt] = useState("")
  const [expectations, setExpectations] = useState("")
  const [showCases, setShowCases] = useState(false)

  const act = async (body: Record<string, unknown>, label: string) => {
    setBusy(label)
    setMsg(null)
    try {
      const r = await fetch("/api/ai/convertia/eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown> & { data?: Record<string, unknown> }
      if (!r.ok) throw new Error((j as { error?: string }).error || `HTTP ${r.status}`)
      const d = (j.data ?? j) as Record<string, unknown>
      if (body.action === "import") setMsg(`${d.imported ?? 0} caso(s) importado(s) dos 👍.`)
      if (body.action === "run") setMsg(`Lote rodado: ${d.runs ?? 0} execução(ões), ${d.errors ?? 0} erro(s)${Number(d.skipped_budget) > 0 ? `, ${d.skipped_budget} fora do orçamento (rode de novo)` : ""}.`)
      await mutate()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falhou")
    } finally {
      setBusy(null)
    }
  }

  if (error) return null

  return (
    <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] overflow-x-auto">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-2">
        <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">ConvertIA · Avaliação</h3>
        {p && (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-white/50">
            <FlaskConical className="h-3 w-3" />
            {p.cases.filter((c) => c.is_active).length} casos ativos · {p.batches.length} lotes · roda toda segunda 05h UTC
          </span>
        )}
        <span className="flex-1" />
        <button
          onClick={() => void act({ action: "import" }, "import")}
          disabled={busy !== null}
          className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-slate-200 dark:border-white/[0.1] px-2.5 text-[11.5px] font-medium text-slate-700 dark:text-white/80 disabled:opacity-50"
        >
          {busy === "import" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Importar dos 👍
        </button>
        <button
          onClick={() => setAdding(!adding)}
          className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-slate-200 dark:border-white/[0.1] px-2.5 text-[11.5px] font-medium text-slate-700 dark:text-white/80"
        >
          <Plus className="h-3 w-3" /> Caso à mão
        </button>
        <button
          onClick={() => void act({ action: "run" }, "run")}
          disabled={busy !== null || !p || p.cases.filter((c) => c.is_active).length === 0}
          className="inline-flex h-7 items-center gap-1 rounded-[6px] bg-slate-900 dark:bg-white px-2.5 text-[11.5px] font-semibold text-white dark:text-slate-900 disabled:opacity-50"
          title="Roda os casos ativos nos modelos do conjunto (até ~4 min)"
        >
          {busy === "run" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FlaskConical className="h-3 w-3" />} Rodar lote agora
        </button>
      </div>
      {msg && <p className="px-4 pb-2 text-[11.5px] text-slate-600 dark:text-white/60">{msg}</p>}
      {p?.schema_missing && (
        <p className="px-4 pb-3 text-[12px] text-amber-700 dark:text-amber-300">Avaliação indisponível — aplique a migration 20261114.</p>
      )}
      {adding && (
        <div className="mx-4 mb-3 rounded-[6px] border border-slate-200 dark:border-white/[0.08] p-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            placeholder="Pergunta real que a ConvertIA precisa responder bem"
            className="w-full rounded-[6px] border border-slate-200 dark:border-white/[0.1] bg-transparent px-2.5 py-1.5 text-[12px] text-slate-900 dark:text-white outline-none"
          />
          <textarea
            value={expectations}
            onChange={(e) => setExpectations(e.target.value)}
            rows={2}
            placeholder="O que uma resposta boa precisa ter (opcional — o juiz lê)"
            className="mt-2 w-full rounded-[6px] border border-slate-200 dark:border-white/[0.1] bg-transparent px-2.5 py-1.5 text-[12px] text-slate-900 dark:text-white outline-none"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="h-7 rounded-[6px] border border-slate-200 dark:border-white/[0.1] px-2.5 text-[11.5px]">Cancelar</button>
            <button
              onClick={async () => {
                await act({ action: "add", prompt: prompt.trim(), expectations: expectations.trim() || undefined }, "add")
                setPrompt("")
                setExpectations("")
                setAdding(false)
              }}
              disabled={prompt.trim().length < 5 || busy !== null}
              className="h-7 rounded-[6px] bg-slate-900 dark:bg-white px-2.5 text-[11.5px] font-semibold text-white dark:text-slate-900 disabled:opacity-50"
            >
              Salvar caso
            </button>
          </div>
        </div>
      )}
      {p && !p.schema_missing && (
        <>
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                <th className={TH_CLASS}>Modelo</th>
                <th className={TH_CLASS}>Nota média (0–10)</th>
                <th className={TH_CLASS}>Execuções</th>
                <th className={TH_CLASS}>Tools/execução</th>
                <th className={TH_CLASS}>Duração</th>
                <th className={TH_CLASS}>Custo/execução</th>
              </tr>
            </thead>
            <tbody>
              {p.by_model.map((m) => (
                <tr key={m.model} className="border-b border-slate-50 dark:border-white/[0.03]">
                  <td className={`${TD_CLASS} font-mono text-[11px]`}>{m.model}</td>
                  <td className={`${TD_CLASS} font-semibold text-slate-900 dark:text-white`}>{score(m.avg_score)}</td>
                  <td className={TD_CLASS}>
                    {m.runs}
                    {m.errors > 0 && <span className="ml-1 text-red-600 dark:text-red-400">({m.errors} erro)</span>}
                  </td>
                  <td className={TD_CLASS}>{String(m.avg_tool_calls).replace(".", ",")}</td>
                  <td className={TD_CLASS}>{fmtMs(m.avg_duration_ms)}</td>
                  <td className={TD_CLASS}>${(m.avg_cost_cents / 100).toFixed(3)}</td>
                </tr>
              ))}
              {p.by_model.length === 0 && (
                <tr>
                  <td colSpan={6} className={`${TD_CLASS} text-slate-400`}>
                    Nenhum lote ainda. Importe casos dos 👍 (ou crie à mão) e rode um lote.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {p.batches.length > 1 && (
            <div className="px-4 pt-3 pb-1 text-[11px] text-slate-500 dark:text-white/50">
              Lotes:{" "}
              {p.batches.slice(0, 6).map((b) => (
                <span key={b.batch_id} className="mr-3">
                  {new Date(b.started_at).toLocaleDateString("pt-BR")} → {b.models.map((m) => `${m.model.split("/").pop()} ${score(m.avg_score)}`).join(" · ")}
                </span>
              ))}
            </div>
          )}
          <button onClick={() => setShowCases(!showCases)} className="px-4 py-2 text-[11.5px] font-medium text-slate-600 dark:text-white/60">
            {showCases ? "Ocultar casos" : `Ver casos (${p.cases.length})`}
          </button>
          {showCases && (
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                  <th className={TH_CLASS}>Pergunta</th>
                  <th className={TH_CLASS}>Último lote</th>
                  <th className={TH_CLASS}>Ativo</th>
                </tr>
              </thead>
              <tbody>
                {p.cases.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 dark:border-white/[0.03]">
                    <td className={`${TD_CLASS} max-w-[420px]`} title={c.prompt}>
                      <span className="line-clamp-2">{c.prompt}</span>
                    </td>
                    <td className={TD_CLASS}>
                      {c.latest.length === 0
                        ? "—"
                        : c.latest.map((l) => `${l.model.split("/").pop()} ${l.status === "error" ? "erro" : score(l.score)}`).join(" · ")}
                    </td>
                    <td className={TD_CLASS}>
                      <button
                        onClick={() => void act({ action: "toggle", id: c.id, is_active: !c.is_active }, `t-${c.id}`)}
                        className={c.is_active ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}
                      >
                        {c.is_active ? "sim" : "não"}
                      </button>
                      <button onClick={() => void act({ action: "delete", id: c.id }, `d-${c.id}`)} className="ml-3 text-red-600 dark:text-red-400">
                        excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}
