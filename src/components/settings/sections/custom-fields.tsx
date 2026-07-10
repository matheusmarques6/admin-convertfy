"use client"

/**
 * Secao de Configuracoes "custom-fields" — corpo extraido de
 * src/app/admin/settings/custom-fields/page.tsx (jul/2026) para ser
 * renderizavel tanto na pagina cheia (rota preservada) quanto no
 * SettingsModal global. Conteudo movido, nao reescrito.
 */

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Loader2, Plus, Sparkles } from "lucide-react"
import {
  CustomFieldFormDialog,
  CustomFieldListItem,
  NewCustomFieldButton,
  type CustomField,
  type EntityType,
} from "@/components/crm/custom-field-form-dialog"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const ENTITIES: Array<{ key: EntityType; label: string; hint: string }> = [
  {
    key: "lead",
    label: "Lead",
    hint: "Aparecem na ficha do lead e no mapeamento de formulários.",
  },
  { key: "deal", label: "Deal", hint: "Aparecem na ficha do deal." },
]

export function CustomFieldsSection() {
  const initialEntity =
    typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("entity") as
          | EntityType
          | null)
      : null
  const [entity, setEntity] = useState<EntityType>(
    initialEntity === "deal" || initialEntity === "lead"
      ? initialEntity
      : "lead",
  )
  const { data, mutate, isLoading } = useSWR<{ fields: CustomField[] }>(
    `/api/crm/custom-fields?entity=${entity}`,
    fetcher,
  )
  const fields = useMemo(() => data?.fields ?? [], [data])
  const [editing, setEditing] = useState<CustomField | "new" | null>(null)

  return (
    <div className="space-y-5 max-w-[860px]">
      <header>
        <h1 className="text-[20px] font-semibold text-slate-900 dark:text-white tracking-tight">
          Campos personalizados
        </h1>
        <p className="mt-1 text-[13px] text-slate-500 dark:text-white/55 leading-relaxed">
          Crie campos extras pra leads e deals (URL da loja, faturamento,
          segmento, etc). Eles ficam disponíveis no mapeamento de formulários e
          na ficha de cada registro.
        </p>
      </header>

      <div className="inline-flex gap-0.5 rounded-[6px] bg-slate-100 dark:bg-white/[0.04] p-0.5">
        {ENTITIES.map((e) => {
          const active = entity === e.key
          return (
            <button
              key={e.key}
              onClick={() => setEntity(e.key)}
              className={
                "h-8 px-4 rounded-[5px] text-[12px] font-medium transition-colors " +
                (active
                  ? "bg-white dark:bg-[#1A1D27] text-slate-900 dark:text-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                  : "text-slate-600 dark:text-white/55 hover:text-slate-900 dark:hover:text-white")
              }
            >
              {e.label}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-slate-500 dark:text-white/45 -mt-2">
        {ENTITIES.find((e) => e.key === entity)?.hint}
      </p>

      <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] pb-2">
        <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-slate-700 dark:text-white/75">
          {fields.length} campo{fields.length === 1 ? "" : "s"}
        </div>
        <NewCustomFieldButton onClick={() => setEditing("new")} />
      </div>

      {isLoading ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : fields.length === 0 ? (
        <EmptyState onAdd={() => setEditing("new")} />
      ) : (
        <ul className="space-y-1.5">
          {fields.map((f) => (
            <CustomFieldListItem
              key={f.id}
              field={f}
              onEdit={() => setEditing(f)}
              onDelete={async () => {
                if (
                  !confirm(
                    `Excluir o campo "${f.label}"? Os dados ja gravados serao preservados.`,
                  )
                )
                  return
                await fetch(`/api/crm/custom-fields/${f.id}`, {
                  method: "DELETE",
                })
                mutate()
              }}
            />
          ))}
        </ul>
      )}

      <CustomFieldFormDialog
        open={editing !== null}
        entity={entity}
        field={editing === "new" ? null : editing}
        onOpenChange={(v) => {
          if (!v) setEditing(null)
        }}
        onSaved={() => {
          setEditing(null)
          mutate()
        }}
        existingKeys={fields.map((f) => f.key)}
      />
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-[8px] border border-dashed border-slate-300 dark:border-white/[0.10] py-10 px-6 text-center">
      <div className="mx-auto h-10 w-10 rounded-full bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center text-slate-400 dark:text-white/40 mb-3">
        <Sparkles className="h-4 w-4" />
      </div>
      <p className="text-[13px] font-medium text-slate-700 dark:text-white/75">
        Nenhum campo personalizado ainda
      </p>
      <p className="mt-1 text-[12px] text-slate-500 dark:text-white/45 max-w-[320px] mx-auto leading-relaxed">
        Crie seu primeiro campo (ex: &quot;URL da loja&quot;, &quot;Faturamento
        mensal&quot;, &quot;Segmento&quot;). Depois mapeie os campos do
        formulário pra ele.
      </p>
      <button
        onClick={onAdd}
        className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold"
      >
        <Plus className="h-3.5 w-3.5" />
        Criar primeiro campo
      </button>
    </div>
  )
}
