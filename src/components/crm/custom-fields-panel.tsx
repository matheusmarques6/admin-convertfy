"use client"

/**
 * CustomFieldsPanel — renderiza os campos personalizados definidos em
 * `crm_custom_fields` (filtrados por entity_type) com seus respectivos
 * inputs e persiste no record (deal ou lead) via PATCH ao endpoint
 * correspondente.
 *
 * Reusado por deal-drawer e lead-drawer pra evitar duplicacao.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { Sparkles, Loader2, Check, ExternalLink } from "lucide-react"

type EntityType = "lead" | "deal"

interface CustomField {
  id: string
  key: string
  label: string
  field_type:
    | "text"
    | "textarea"
    | "number"
    | "select"
    | "multi_select"
    | "boolean"
    | "date"
    | "url"
    | "email"
    | "phone"
  options: string[] | null
  description: string | null
  required: boolean
  position: number
}

interface Props {
  entityType: EntityType
  entityId: string
  values: Record<string, unknown>
  onSaved?: () => void
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function CustomFieldsPanel({
  entityType,
  entityId,
  values,
  onSaved,
}: Props) {
  const { data, isLoading } = useSWR<{ fields: CustomField[] }>(
    `/api/crm/custom-fields?entity=${entityType}`,
    fetcher,
  )
  const fields = useMemo(() => data?.fields ?? [], [data])

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-slate-500 dark:text-white/45 py-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        Carregando campos...
      </div>
    )
  }

  if (fields.length === 0) {
    return (
      <Link
        href={`/admin/settings/custom-fields?entity=${entityType}`}
        className="block rounded-[6px] border border-dashed border-slate-300 dark:border-white/[0.10] bg-slate-50/50 dark:bg-white/[0.02] hover:bg-slate-100 dark:hover:bg-white/[0.04] p-3 transition-colors"
      >
        <div className="flex items-start gap-2">
          <Sparkles className="h-3.5 w-3.5 text-slate-400 dark:text-white/40 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-slate-700 dark:text-white/80">
              Nenhum campo personalizado
            </p>
            <p className="text-[11px] text-slate-500 dark:text-white/45 leading-relaxed mt-0.5">
              Crie campos extras pra capturar informacoes especificas.
              <span className="inline-flex items-center gap-0.5 ml-1 text-blue-600 dark:text-blue-400 font-semibold">
                Gerenciar
                <ExternalLink className="h-2.5 w-2.5" />
              </span>
            </p>
          </div>
        </div>
      </Link>
    )
  }

  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <CustomFieldRow
          key={f.id}
          field={f}
          entityType={entityType}
          entityId={entityId}
          value={values?.[f.key]}
          onSaved={onSaved}
        />
      ))}
    </div>
  )
}

function CustomFieldRow({
  field,
  entityType,
  entityId,
  value,
  onSaved,
}: {
  field: CustomField
  entityType: EntityType
  entityId: string
  value: unknown
  onSaved?: () => void
}) {
  const [local, setLocal] = useState<unknown>(value ?? defaultByType(field))
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // Re-sync quando o valor externo muda (ex: revalidacao apos save).
  useEffect(() => {
    setLocal(value ?? defaultByType(field))
  }, [value, field])

  const persist = async (next: unknown) => {
    setSaving(true)
    try {
      const url =
        entityType === "deal"
          ? `/api/crm/deals/${entityId}`
          : `/api/crm/leads/${entityId}`
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          custom_fields: { [field.key]: next },
        }),
      })
      if (res.ok) {
        setSavedAt(Date.now())
        onSaved?.()
      }
    } finally {
      setSaving(false)
    }
  }

  const handleBlur = () => {
    if (!equalish(local, value)) void persist(local)
  }
  const handleImmediate = (next: unknown) => {
    setLocal(next)
    void persist(next)
  }

  const inputClass =
    "w-full px-2.5 py-1.5 text-[12px] rounded-[5px] bg-white dark:bg-[#1A1D27] border border-black/[0.08] dark:border-white/[0.10] text-slate-900 dark:text-white/90 placeholder:text-slate-400 dark:placeholder:text-white/30 focus:outline-none focus:border-slate-400 dark:focus:border-white/30"

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <label className="text-[11px] font-medium text-slate-500 dark:text-white/55">
          {field.label}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin text-slate-400 dark:text-white/40" />
        ) : savedAt && Date.now() - savedAt < 1500 ? (
          <Check className="h-3 w-3 text-emerald-500" />
        ) : null}
      </div>

      {field.field_type === "textarea" && (
        <textarea
          rows={3}
          value={String(local ?? "")}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={handleBlur}
          className={inputClass + " resize-y"}
        />
      )}

      {(field.field_type === "text" ||
        field.field_type === "url" ||
        field.field_type === "email" ||
        field.field_type === "phone") && (
        <input
          type={
            field.field_type === "email"
              ? "email"
              : field.field_type === "url"
                ? "url"
                : field.field_type === "phone"
                  ? "tel"
                  : "text"
          }
          value={String(local ?? "")}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={handleBlur}
          className={inputClass}
        />
      )}

      {field.field_type === "number" && (
        <input
          type="number"
          value={local === undefined || local === null ? "" : String(local)}
          onChange={(e) => {
            const v = e.target.value
            setLocal(v === "" ? null : Number(v))
          }}
          onBlur={handleBlur}
          className={inputClass}
        />
      )}

      {field.field_type === "date" && (
        <input
          type="date"
          value={String(local ?? "")}
          onChange={(e) => handleImmediate(e.target.value)}
          className={inputClass}
        />
      )}

      {field.field_type === "select" && (
        <select
          value={String(local ?? "")}
          onChange={(e) => handleImmediate(e.target.value)}
          className={inputClass}
        >
          <option value="">—</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}

      {field.field_type === "multi_select" && (
        <div className="flex flex-wrap gap-1">
          {(field.options ?? []).map((opt) => {
            const arr = Array.isArray(local) ? (local as string[]) : []
            const checked = arr.includes(opt)
            return (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  const next = checked
                    ? arr.filter((x) => x !== opt)
                    : [...arr, opt]
                  handleImmediate(next)
                }}
                className={
                  "text-[11px] px-2 py-1 rounded-[4px] border transition-colors " +
                  (checked
                    ? "bg-blue-50 dark:bg-blue-500/15 border-blue-300 dark:border-blue-500/40 text-blue-700 dark:text-blue-300"
                    : "bg-white dark:bg-[#1A1D27] border-black/[0.08] dark:border-white/[0.10] text-slate-700 dark:text-white/70 hover:bg-slate-50 dark:hover:bg-white/[0.04]")
                }
              >
                {opt}
              </button>
            )
          })}
        </div>
      )}

      {field.field_type === "boolean" && (
        <label className="flex items-center gap-2 text-[12px] text-slate-700 dark:text-white/80 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(local)}
            onChange={(e) => handleImmediate(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 dark:border-white/20"
          />
          {Boolean(local) ? "Sim" : "Nao"}
        </label>
      )}

      {field.description && (
        <p className="mt-1 text-[10px] text-slate-400 dark:text-white/40 leading-relaxed">
          {field.description}
        </p>
      )}
    </div>
  )
}

function defaultByType(field: CustomField): unknown {
  switch (field.field_type) {
    case "boolean":
      return false
    case "multi_select":
      return []
    case "number":
      return null
    default:
      return ""
  }
}

function equalish(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((x, i) => x === b[i])
  }
  return false
}
