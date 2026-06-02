"use client"

/**
 * Coluna direita: preview do reference template vinculado ao flow_type.
 *
 * Hoje a relação blueprint → reference é por matching automático em
 * email-copy-webhook.service.ts (filter flow_type + is_active=true, mais
 * novo primeiro). A UI espelha esse matching no default do dropdown e
 * permite trocar pra visualizar outras refs ativas — só visualização,
 * não persiste FK.
 */
import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { Loader2 } from "lucide-react"

interface ReferenceTemplate {
  id: string
  flow_type: string | null
  name: string
  html: string | null
  is_active: boolean
  created_at: string
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("fetch failed")
    return r.json()
  })

interface Props {
  flowType: string
}

export function BlueprintReferencePreview({ flowType }: Props) {
  const { data, isLoading, error } = useSWR<{ templates: ReferenceTemplate[] }>(
    `/api/admin/email-reference-templates?flow_type=${encodeURIComponent(flowType)}`,
    fetcher,
  )

  const active = useMemo(
    () => (data?.templates ?? []).filter((t) => t.is_active),
    [data?.templates],
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Default: primeira ref ativa (mais nova — endpoint ordena por created_at DESC)
  useEffect(() => {
    if (active.length > 0 && !active.some((t) => t.id === selectedId)) {
      setSelectedId(active[0].id)
    } else if (active.length === 0) {
      setSelectedId(null)
    }
  }, [active, selectedId])

  const selected = active.find((t) => t.id === selectedId) ?? null

  return (
    <div className="rounded-[6px] border border-slate-200 bg-white p-3 dark:border-white/[0.08] dark:bg-white/[0.02]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-white/60">
          Reference HTML
        </label>
        {isLoading && (
          <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
        )}
      </div>

      {error && (
        <p className="rounded-[4px] bg-red-50 px-2 py-2 text-[11px] text-red-700 dark:bg-red-500/10 dark:text-red-300">
          Erro ao carregar references.
        </p>
      )}

      <select
        value={selectedId ?? ""}
        onChange={(e) => setSelectedId(e.target.value || null)}
        disabled={active.length === 0}
        className="crm-input w-full text-[11px]"
      >
        {active.length === 0 ? (
          <option value="">Nenhum reference ativo</option>
        ) : (
          active.map((t, idx) => (
            <option key={t.id} value={t.id}>
              {t.name} {idx === 0 && "(mais nova — em uso)"}
            </option>
          ))
        )}
      </select>

      <div className="mt-3 overflow-hidden rounded-[4px] border border-slate-200 bg-white dark:border-white/[0.08]">
        {selected?.html ? (
          <iframe
            key={selected.id}
            title={`Reference: ${selected.name}`}
            srcDoc={selected.html}
            sandbox=""
            className="block h-[640px] w-full bg-white"
          />
        ) : (
          <div className="flex h-[200px] items-center justify-center px-3 text-center text-[11px] text-slate-400">
            {active.length === 0
              ? `Nenhum reference ativo pra "${flowType}".`
              : "Reference sem HTML."}
          </div>
        )}
      </div>

      <p className="mt-2 text-[10px] text-slate-400 dark:text-white/30">
        Visualização do reference que o dispatcher pegaria via matching
        automático. Trocar aqui não altera a escolha real do pipeline.
      </p>
    </div>
  )
}
