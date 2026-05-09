"use client"

/**
 * Componentes reutilizaveis pra gerenciar custom fields (CRUD).
 *
 * `CustomFieldFormDialog` — modal para criar/editar um campo. Persiste
 * via POST/PATCH em `/api/crm/custom-fields[/id]` e dispara `onSaved`.
 *
 * `CustomFieldListItem` — linha individual da lista de campos com
 * acoes de editar/deletar.
 *
 * Reusado pela pagina standalone em `/admin/settings/custom-fields/`
 * e pelo PipelineSettingsDialog (para gerenciamento contextual sem
 * sair do scope comercial — evita o sidebar mudar de "Comercial" pra
 * "Geral" quando o usuario gerencia campos no fluxo da pipeline).
 */

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronDown,
} from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"

export type EntityType = "lead" | "deal"

export type FieldType =
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

export interface CustomField {
  id: string
  entity_type: EntityType
  key: string
  label: string
  field_type: FieldType
  options: Array<string | { label: string; value: string }>
  description: string | null
  required: boolean
  position: number
  is_active: boolean
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Texto curto",
  textarea: "Texto longo",
  number: "Número",
  select: "Seleção (dropdown)",
  multi_select: "Múltipla seleção",
  boolean: "Sim/Não",
  date: "Data",
  url: "URL",
  email: "Email",
  phone: "Telefone",
}

export function toSlug(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60)
}

// ────────────────────────────────────────────────────────────────────
// Lista — linha individual
// ────────────────────────────────────────────────────────────────────

export function CustomFieldListItem({
  field,
  onEdit,
  onDelete,
  compact = false,
}: {
  field: CustomField
  onEdit: () => void
  onDelete: () => void
  compact?: boolean
}) {
  return (
    <li
      className={
        "group flex items-center justify-between gap-3 rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] " +
        (compact ? "px-2.5 py-2" : "px-3 py-2.5")
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={
              "font-semibold text-slate-900 dark:text-white truncate " +
              (compact ? "text-[12px]" : "text-[13px]")
            }
          >
            {field.label}
          </span>
          {field.required && (
            <span className="text-[10px] font-medium text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20">
              Obrigatório
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-white/45 font-mono">
          <span className="text-slate-400 dark:text-white/30">key:</span>
          <code>{field.key}</code>
          <span className="text-slate-300 dark:text-white/20">·</span>
          <span>{FIELD_TYPE_LABELS[field.field_type]}</span>
          {(field.field_type === "select" ||
            field.field_type === "multi_select") && (
            <>
              <span className="text-slate-300 dark:text-white/20">·</span>
              <span>{field.options.length} opções</span>
            </>
          )}
        </div>
        {field.description && !compact && (
          <p className="mt-1 text-[11px] text-slate-500 dark:text-white/55 truncate">
            {field.description}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center justify-center h-7 w-7 rounded-[5px] text-slate-500 dark:text-white/55 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
          title="Editar"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center justify-center h-7 w-7 rounded-[5px] text-slate-400 dark:text-white/40 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400"
          title="Excluir"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  )
}

// ────────────────────────────────────────────────────────────────────
// Dialog — criar/editar campo
// ────────────────────────────────────────────────────────────────────

export function CustomFieldFormDialog({
  entity,
  field,
  onClose,
  onSaved,
  existingKeys,
}: {
  entity: EntityType
  field: CustomField | null
  onClose: () => void
  onSaved: () => void
  existingKeys: string[]
}) {
  const isEdit = field !== null
  const toast = useToast()

  const [label, setLabel] = useState(field?.label ?? "")
  const [key, setKey] = useState(field?.key ?? "")
  const [keyTouched, setKeyTouched] = useState(isEdit)
  const [fieldType, setFieldType] = useState<FieldType>(
    field?.field_type ?? "text",
  )
  const [optionsText, setOptionsText] = useState(
    field
      ? (field.options ?? [])
          .map((o) => (typeof o === "string" ? o : o.label))
          .join("\n")
      : "",
  )
  const [description, setDescription] = useState(field?.description ?? "")
  const [required, setRequired] = useState(field?.required ?? false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const showOptions = fieldType === "select" || fieldType === "multi_select"

  // Portal so monta no client. SSR retorna null pra evitar hidration
  // mismatch e pra escapar do scope do Radix Dialog pai (que adiciona
  // pointer-events:none/inert no body, bloqueando interacao do nosso
  // modal quando renderizado dentro da arvore do Dialog Root).
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // Esc fecha o dialog (Radix nao escapa pra dialogs aninhados em portal manual).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [onClose])

  const onLabelChange = (v: string) => {
    setLabel(v)
    if (!keyTouched) setKey(toSlug(v))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!label.trim()) {
      setError("Label e obrigatorio")
      return
    }
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      setError(
        "Key deve usar apenas letras minúsculas, números e _, começando com letra (ex: url_da_loja)",
      )
      return
    }
    if (!isEdit && existingKeys.includes(key)) {
      setError(`Já existe um campo com a key "${key}"`)
      return
    }

    const options = showOptions
      ? optionsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
      : []

    setSubmitting(true)
    try {
      const payload = {
        ...(isEdit ? {} : { entity_type: entity, key }),
        label: label.trim(),
        field_type: fieldType,
        options,
        description: description.trim() || null,
        required,
      }
      const res = isEdit
        ? await fetch(`/api/crm/custom-fields/${field!.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/crm/custom-fields`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error?.message || "Erro ao salvar")
        return
      }
      toast.toast({
        title: isEdit ? "Campo atualizado" : "Campo criado",
        description: label.trim(),
      })
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  if (!mounted) return null

  // Portal direto em document.body com pointer-events:auto explicito
  // — escapa do focus trap / inert do Radix Dialog pai que bloqueia
  // interacao quando o modal aparece sobreposto.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4"
      style={{ pointerEvents: "auto" }}
      onPointerDownCapture={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[520px] bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] max-h-[90vh] overflow-hidden flex flex-col"
        style={{ pointerEvents: "auto" }}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
              {isEdit ? "Editar campo" : "Novo campo personalizado"}
            </h2>
            <p className="mt-0.5 text-[12px] text-slate-500 dark:text-white/55">
              Pra {entity === "lead" ? "leads" : "deals"}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-slate-500 dark:text-white/55 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
          <FormField label="Nome do campo (label)" required>
            <input
              autoFocus
              type="text"
              value={label}
              onChange={(e) => onLabelChange(e.target.value)}
              placeholder="Ex: URL da loja"
              className="crm-input w-full"
            />
          </FormField>

          <FormField
            label="Identificador interno (key)"
            hint="Usado no JSON. Snake_case automático a partir do label."
          >
            <input
              type="text"
              value={key}
              onChange={(e) => {
                setKeyTouched(true)
                setKey(
                  e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
                )
              }}
              disabled={isEdit}
              className="crm-input w-full font-mono text-[12px]"
              placeholder="url_da_loja"
            />
          </FormField>

          <FormField label="Tipo">
            <div className="relative">
              <select
                value={fieldType}
                onChange={(e) => setFieldType(e.target.value as FieldType)}
                className="crm-input w-full appearance-none pr-8"
              >
                {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            </div>
          </FormField>

          {showOptions && (
            <FormField
              label="Opções"
              hint="Uma por linha. Ex: 'Até R$ 50k', 'R$ 50k–200k'."
            >
              <textarea
                rows={4}
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                className="crm-input w-full text-[12px]"
                placeholder="Opção 1&#10;Opção 2&#10;Opção 3"
              />
            </FormField>
          )}

          <FormField label="Descrição (opcional)">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="crm-input w-full"
              placeholder="Aparece como hint no formulário"
            />
          </FormField>

          <label className="flex items-center gap-2 text-[12px] cursor-pointer">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer"
            />
            <span className="text-slate-700 dark:text-white/75">
              Campo obrigatório
            </span>
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-[6px] border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-[11px] text-red-700 dark:text-red-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-8 px-3 rounded-[6px] text-[12px] font-medium text-slate-700 dark:text-white/75 hover:bg-slate-100 dark:hover:bg-white/[0.06] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting || !label.trim()}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {isEdit ? "Salvar" : "Criar campo"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}

function FormField({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label className="block text-[12px] font-medium text-slate-700 dark:text-white/75">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && (
        <p className="text-[11px] text-slate-500 dark:text-white/45 leading-relaxed">
          {hint}
        </p>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Botao "Novo campo" — atalho consistente
// ────────────────────────────────────────────────────────────────────

export function NewCustomFieldButton({
  onClick,
  size = "md",
}: {
  onClick: () => void
  size?: "sm" | "md"
}) {
  const isSm = size === "sm"
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black font-semibold " +
        (isSm ? "h-7 px-2.5 text-[11px]" : "h-8 px-3 text-[12px]")
      }
    >
      <Plus className={isSm ? "h-3 w-3" : "h-3.5 w-3.5"} />
      Novo campo
    </button>
  )
}
