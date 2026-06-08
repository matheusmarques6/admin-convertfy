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
  needs_image?: boolean
}
interface GeneratedItem {
  flow_type: string
  email_number: number
  blueprint: {
    blocks?: BpBlock[]
    objective?: string
    source?: string
    model?: string | null
  } | null
  reference: {
    html?: string
    variant_ids?: string[]
    source?: string
  } | null
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

export function GeneratedInspector() {
  const { data: storesData } = useSWR<{
    stores: Array<{ id: string; store_name: string }>
  }>("/api/admin/stores", fetcher)
  const stores = storesData?.stores ?? []

  const [storeId, setStoreId] = useState("")
  const [selKey, setSelKey] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

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
                  <p className="mb-2 text-[12px] text-slate-500">
                    {selected.blueprint.objective}
                  </p>
                )}
                <ol className="space-y-1 text-[12px]">
                  {(selected.blueprint?.blocks ?? []).map((b, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 rounded bg-slate-50 px-2 py-1 dark:bg-white/[0.03]"
                    >
                      <span className="font-mono text-slate-700 dark:text-white/80">
                        {b.type}
                      </span>
                      {b.needs_image && <span title="precisa de imagem">🖼</span>}
                      <span className="truncate text-slate-400">{b.label}</span>
                    </li>
                  ))}
                  {(!selected.blueprint ||
                    (selected.blueprint.blocks ?? []).length === 0) && (
                    <li className="text-slate-400">Sem blueprint.</li>
                  )}
                </ol>
              </div>

              <div className="space-y-1">
                <h4 className="text-[13px] font-semibold">
                  HTML montado
                  <SourceBadge source={selected.reference?.source} />
                </h4>
                <div className="overflow-hidden rounded-[6px] border border-slate-200 dark:border-white/[0.08]">
                  <iframe
                    title="reference"
                    srcDoc={
                      selected.reference?.html ||
                      "<p style='font-family:sans-serif;color:#94a3b8;padding:16px'>Sem reference montado (caiu no template global).</p>"
                    }
                    className="h-[420px] w-full bg-white"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
