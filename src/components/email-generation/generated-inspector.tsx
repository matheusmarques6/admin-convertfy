"use client"

/**
 * Aba "Geradas" — inspeção do Component Assembler por loja.
 * Mostra, por email, o blueprint extraído e o preview do HTML montado.
 */

import { useState } from "react"
import useSWR from "swr"
import { Loader2, RefreshCw, Store } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface BpBlock {
  type: string
  label?: string
  purpose?: string
  needs_image?: boolean
}
interface GeneratedItem {
  flow_type: string
  email_number: number
  blueprint: {
    blocks?: BpBlock[]
    objective?: string
    messaging?: string
    subject_hint?: string | null
    source?: string
    model?: string | null
  } | null
  reference: {
    html?: string
    variant_ids?: string[]
    source?: string
  } | null
  consumed?: {
    match: "loja" | "global" | "nenhum"
    html?: string | null
  }
}

function SourceBadge({ source }: { source?: string }) {
  if (!source) return null
  return (
    <span
      className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${
        source === "manual"
          ? "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
          : "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-white/50"
      }`}
    >
      {source}
    </span>
  )
}

function ConsumedBadge({
  match,
}: {
  match?: "loja" | "global" | "nenhum"
}) {
  if (!match) return null
  const cfg = {
    loja: {
      label: "HTML agent usa este ✓",
      cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    },
    global: {
      label: "HTML agent: template global ⚠",
      cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    },
    nenhum: {
      label: "HTML agent: sem reference ✕",
      cls: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300",
    },
  }[match]
  return (
    <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

export function GeneratedInspector() {
  const { data: storesData } = useSWR<{
    stores: Array<{ id: string; store_name: string }>
  }>("/api/admin/stores", fetcher)
  const stores = storesData?.stores ?? []

  const [storeId, setStoreId] = useState("")
  const [selKey, setSelKey] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [htmlView, setHtmlView] = useState<"preview" | "code">("preview")

  const { data, isLoading, mutate } = useSWR<{ items: GeneratedItem[] }>(
    storeId ? `/api/admin/stores/${storeId}/generated` : null,
    fetcher,
  )
  const items = data?.items ?? []
  const selected =
    items.find((i) => `${i.flow_type}:${i.email_number}` === selKey) ??
    items[0] ??
    null

  async function regenerate() {
    if (!storeId) return
    setRegenerating(true)
    setMsg(null)
    try {
      const res = await fetch(
        `/api/admin/stores/${storeId}/generate-blueprints`,
        { method: "POST" },
      )
      const json = (await res.json()) as { ok?: number; failed?: number }
      if (!res.ok) throw new Error()
      setMsg(`Gerados: ${json.ok ?? 0} ok, ${json.failed ?? 0} falha(s)`)
      await mutate()
    } catch {
      setMsg("Falha ao regenerar.")
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 dark:text-white/80">
            <Store className="h-3.5 w-3.5" /> Loja
          </span>
          <select
            value={storeId}
            onChange={(e) => {
              setStoreId(e.target.value)
              setSelKey(null)
              setMsg(null)
            }}
            className="rounded-[6px] border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] dark:border-white/[0.08] dark:bg-white/[0.03]"
          >
            <option value="">Selecione...</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.store_name}
              </option>
            ))}
          </select>
        </label>
        {storeId && (
          <button
            type="button"
            onClick={regenerate}
            disabled={regenerating}
            className="inline-flex h-8 items-center gap-1.5 rounded-[6px] bg-[#1F1F1F] px-3 text-[12px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {regenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Regenerar
          </button>
        )}
        {msg && <span className="text-[12px] text-slate-500">{msg}</span>}
      </div>

      {!storeId ? (
        <p className="text-[13px] text-slate-500 dark:text-white/45">
          Selecione uma loja para ver o blueprint e o HTML que o agente gerou.
        </p>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-[13px] text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-slate-500 dark:text-white/45">
          Nada gerado ainda para esta loja. Clique em <b>Regenerar</b> (requer
          outline + componentes cadastrados).
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-1">
            {items.map((i) => {
              const k = `${i.flow_type}:${i.email_number}`
              const active = selected
                ? `${selected.flow_type}:${selected.email_number}` === k
                : false
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSelKey(k)}
                  className={`block w-full rounded-[6px] border px-3 py-2 text-left text-[13px] ${
                    active
                      ? "border-slate-900 bg-slate-50 dark:border-white/40 dark:bg-white/[0.06]"
                      : "border-slate-200 hover:bg-slate-50 dark:border-white/[0.08] dark:hover:bg-white/[0.04]"
                  }`}
                >
                  {i.flow_type} #{i.email_number}
                </button>
              )
            })}
          </div>

          {selected && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-[6px] border border-slate-200 p-3 dark:border-white/[0.08]">
                <h4 className="mb-2 text-[13px] font-semibold">
                  Blueprint
                  <SourceBadge source={selected.blueprint?.source} />
                </h4>
                {selected.blueprint?.objective && (
                  <p className="mb-1 text-[12px] text-slate-600 dark:text-white/60">
                    <span className="font-semibold">Objetivo:</span>{" "}
                    {selected.blueprint.objective}
                  </p>
                )}
                {selected.blueprint?.messaging && (
                  <p className="mb-1 text-[12px] text-slate-500">
                    <span className="font-semibold">Mensagem:</span>{" "}
                    {selected.blueprint.messaging}
                  </p>
                )}
                {selected.blueprint?.subject_hint && (
                  <p className="mb-2 text-[12px] text-slate-500">
                    <span className="font-semibold">Subject:</span>{" "}
                    {selected.blueprint.subject_hint}
                  </p>
                )}
                <ol className="space-y-1 text-[12px]">
                  {(selected.blueprint?.blocks ?? []).map((b, i) => (
                    <li
                      key={i}
                      className="rounded bg-slate-50 px-2 py-1.5 dark:bg-white/[0.03]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-700 dark:text-white/80">
                          {b.type}
                        </span>
                        {b.needs_image && (
                          <span title="precisa de imagem">🖼</span>
                        )}
                        {b.label && (
                          <span className="truncate text-slate-400">{b.label}</span>
                        )}
                      </div>
                      {b.purpose && (
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {b.purpose}
                        </p>
                      )}
                    </li>
                  ))}
                  {(!selected.blueprint ||
                    (selected.blueprint.blocks ?? []).length === 0) && (
                    <li className="text-slate-400">Sem blueprint.</li>
                  )}
                </ol>
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-[13px] font-semibold">
                    HTML montado
                    <SourceBadge source={selected.reference?.source} />
                    <ConsumedBadge match={selected.consumed?.match} />
                  </h4>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setHtmlView("preview")}
                      className={`rounded-[4px] px-2 py-0.5 text-[11px] ${
                        htmlView === "preview"
                          ? "bg-slate-900 text-white dark:bg-white dark:text-black"
                          : "text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
                      }`}
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setHtmlView("code")}
                      className={`rounded-[4px] px-2 py-0.5 text-[11px] ${
                        htmlView === "code"
                          ? "bg-slate-900 text-white dark:bg-white dark:text-black"
                          : "text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
                      }`}
                    >
                      Código
                    </button>
                    {(selected.consumed?.html ?? selected.reference?.html) && (
                      <button
                        type="button"
                        onClick={() =>
                          navigator.clipboard
                            ?.writeText(
                              selected.consumed?.html ??
                                selected.reference?.html ??
                                "",
                            )
                            .catch(() => {})
                        }
                        title="Copiar HTML"
                        className="rounded-[4px] px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
                      >
                        Copiar
                      </button>
                    )}
                  </div>
                </div>
                {selected.consumed?.match === "global" && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    O Montador não gerou reference para este email — o HTML agent
                    cai no template global (mostrado abaixo).
                  </p>
                )}
                {selected.consumed?.match === "nenhum" && (
                  <p className="text-[11px] text-red-600 dark:text-red-400">
                    Sem reference (loja nem global) — o HTML agent gera do zero.
                  </p>
                )}
                <div className="overflow-hidden rounded-[6px] border border-slate-200 dark:border-white/[0.08]">
                  {htmlView === "preview" ? (
                    <iframe
                      title="reference"
                      srcDoc={
                        (selected.consumed?.html ?? selected.reference?.html) ||
                        "<p style='font-family:sans-serif;color:#94a3b8;padding:16px'>Sem reference — o HTML agent gera do zero.</p>"
                      }
                      className="h-[420px] w-full bg-white"
                    />
                  ) : (
                    <pre className="h-[420px] overflow-auto bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700 dark:bg-white/[0.02] dark:text-white/70">
                      {(selected.consumed?.html ?? selected.reference?.html) ||
                        "// Sem reference."}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
