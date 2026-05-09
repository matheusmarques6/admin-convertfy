"use client"

/**
 * Componentes reutilizaveis pra gerenciar custom fields (CRUD).
 *
 * `CustomFieldFormDialog` — modal Radix para criar/editar um campo.
 * Usa DialogPrimitive proprio (com Portal/Overlay/Content) pra que o
 * Radix gerencie corretamente o aninhamento quando abre por cima de
 * outro Dialog (ex: PipelineSettingsDialog). Sem isso, o focus trap
 * + inert do Dialog pai bloqueia interacao no filho.
 *
 * `CustomFieldListItem` — linha individual da lista de campos.
 *
 * `SystemFieldListItem` — linha read-only para campos nativos do
 * schema (nome, email, phone, etc) com badge "Sistema".
 */

import { useEffect, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronDown,
  Lock,
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

// Campos nativos do schema do deal — nao podem ser deletados ou
// renomeados; existem por design no banco. Listados pra dar
// visibilidade junto dos custom fields.
export const SYSTEM_DEAL_FIELDS: Array<{
  key: string
  label: string
  type: FieldType
  hint?: string
}> = [
  { key: "title", label: "Título do deal", type: "text" },
  { key: "value", label: "Valor", type: "number", hint: "Em centavos" },
  { key: "currency", label: "Moeda", type: "text" },
  { key: "probability", label: "Probabilidade", type: "number", hint: "0–100" },
  { key: "expected_close_date", label: "Data esperada de fechamento", type: "date" },
  { key: "source", label: "Origem", type: "text" },
  { key: "tags", label: "Tags", type: "multi_select" },
  { key: "notes", label: "Notas", type: "textarea" },
]

// Campos do lead (vinculado ao deal). Sempre que um deal vem de um
// formulario, esses campos sao preenchidos no lead linkado.
export const SYSTEM_LEAD_FIELDS: Array<{
  key: string
  label: string
  type: FieldType
  hint?: string
}> = [
  { key: "name", label: "Nome", type: "text" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Telefone / WhatsApp", type: "phone" },
  { key: "company", label: "Empresa", type: "text" },
  { key: "role", label: "Cargo", type: "text" },
]

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
// Linha — campo personalizado (custom)
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
          <code className="text-slate-400 dark:text-white/30">{field.key}</code>
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
// Linha — campo do sistema (read-only)
// ────────────────────────────────────────────────────────────────────

export function SystemFieldListItem({
  label,
  fieldKey,
  type,
  hint,
  compact = false,
}: {
  label: string
  fieldKey: string
  type: FieldType
  hint?: string
  compact?: boolean
}) {
  return (
    <li
      className={
        "flex items-center justify-between gap-3 rounded-[6px] border border-dashed border-slate-200 dark:border-white/[0.06] bg-slate-50/40 dark:bg-white/[0.01] " +
        (compact ? "px-2.5 py-2" : "px-3 py-2.5")
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={
              "font-medium text-slate-700 dark:text-white/75 truncate " +
              (compact ? "text-[12px]" : "text-[13px]")
            }
          >
            {label}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 dark:text-white/45 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/[0.05]">
            <Lock className="h-2.5 w-2.5" />
            Sistema
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-white/45 font-mono">
          <code className="text-slate-400 dark:text-white/30">{fieldKey}</code>
          <span className="text-slate-300 dark:text-white/20">·</span>
          <span>{FIELD_TYPE_LABELS[type]}</span>
          {hint && (
            <>
              <span className="text-slate-300 dark:text-white/20">·</span>
              <span className="font-sans text-slate-400 dark:text-white/35">
                {hint}
              </span>
            </>
          )}
        </div>
      </div>
    </li>
  )
}

// ────────────────────────────────────────────────────────────────────
// Dialog — criar/editar campo (Radix Dialog Primitive)
// ────────────────────────────────────────────────────────────────────

export function CustomFieldFormDialog({
  open,
  entity,
  field,
  onOpenChange,
  onSaved,
  existingKeys,
}: {
  open: boolean
  entity: EntityType
  field: CustomField | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  existingKeys: string[]
}) {
  const isEdit = field !== null
  const toast = useToast()

  const [label, setLabel] = useState("")
  const [key, setKey] = useState("")
  const [keyTouched, setKeyTouched] = useState(false)
  const [fieldType, setFieldType] = useState<FieldType>("text")
  const [optionsText, setOptionsText] = useState("")
  const [description, setDescription] = useState("")
  const [required, setRequired] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-sincroniza form com prop quando abrir/trocar de campo.
  useEffect(() => {
    if (!open) return
    setLabel(field?.label ?? "")
    setKey(field?.key ?? "")
    setKeyTouched(field !== null)
    setFieldType(field?.field_type ?? "text")
    setOptionsText(
      field
        ? (field.options ?? [])
            .map((o) => (typeof o === "string" ? o : o.label))
            .join("\n")
        : "",
    )
    setDescription(field?.description ?? "")
    setRequired(field?.required ?? false)
    setError(null)
  }, [open, field])

  const showOptions = fieldType === "select" || fieldType === "multi_select"

  const onLabelChange = (v: string) => {
    setLabel(v)
    if (!keyTouched) setKey(toSlug(v))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!label.trim()) {
      setError("O nome do campo é obrigatório.")
      return
    }
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      setError(
        'Identificador deve usar apenas letras minúsculas, números e _, começando com letra (ex: "url_da_loja").',
      )
      return
    }
    if (!isEdit && existingKeys.includes(key)) {
      setError(`Já existe um campo com o identificador "${key}".`)
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

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
        />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[60] w-full max-w-[540px] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] max-h-[90vh] overflow-hidden flex flex-col data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:zoom-out-95"
          onOpenAutoFocus={(e) => {
            // Permite default behavior — focus no primeiro input.
            void e
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {isEdit ? "Editar campo" : "Novo campo personalizado"}
          </DialogPrimitive.Title>

          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white tracking-tight">
                {isEdit ? "Editar campo" : "Novo campo"}
              </h2>
              <p className="mt-0.5 text-[12px] text-slate-500 dark:text-white/55">
                {entity === "lead"
                  ? "Aparece na ficha do lead e nos formulários."
                  : "Aparece na ficha do deal e nos formulários."}
              </p>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Fechar"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-slate-500 dark:text-white/55 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogPrimitive.Close>
          </div>

          {/* Body */}
          <form
            id="custom-field-form"
            onSubmit={handleSubmit}
            className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
          >
            <FormField label="Nome do campo" required>
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
              label="Identificador interno"
              hint='Snake_case automático a partir do nome. Usado no JSON salvo. Ex: "url_da_loja".'
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
                className="crm-input w-full font-mono text-[12px] disabled:opacity-60"
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
                hint="Uma por linha."
              >
                <textarea
                  rows={4}
                  value={optionsText}
                  onChange={(e) => setOptionsText(e.target.value)}
                  className="crm-input w-full text-[12px]"
                  placeholder={"Até R$ 50k\nR$ 50k–200k\nR$ 200k–1M\nR$ 1M+"}
                />
              </FormField>
            )}

            <FormField
              label="Descrição"
              hint="Aparece como hint quando o campo é exibido em formulários."
            >
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="crm-input w-full"
                placeholder="Opcional"
              />
            </FormField>

            <label className="flex items-center gap-2 text-[12px] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 dark:border-white/20 cursor-pointer"
              />
              <span className="text-slate-700 dark:text-white/80">
                Campo obrigatório
              </span>
            </label>

            {error && (
              <div className="flex items-start gap-2 rounded-[6px] border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-[11px] text-red-700 dark:text-red-300">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </form>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                disabled={submitting}
                className="h-8 px-3 rounded-[6px] text-[12px] font-medium text-slate-700 dark:text-white/75 hover:bg-slate-100 dark:hover:bg-white/[0.06] disabled:opacity-50"
              >
                Cancelar
              </button>
            </DialogPrimitive.Close>
            <button
              type="submit"
              form="custom-field-form"
              disabled={submitting || !label.trim()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {isEdit ? "Salvar alterações" : "Criar campo"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
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
    <div className="space-y-1.5">
      <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
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
// Botao "Novo campo"
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
