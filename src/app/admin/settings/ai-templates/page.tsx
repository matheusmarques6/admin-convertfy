"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Sparkles,
} from "lucide-react"
import {
  TEMPLATE_CATEGORY_LABELS,
  TEMPLATE_CATEGORY_COLORS,
  type AiPromptTemplate,
  type AiTemplateCategory,
} from "@/types/ai"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function AiTemplatesPage() {
  const { data, mutate, isLoading } = useSWR<{
    templates: AiPromptTemplate[]
  }>("/api/ai/templates", fetcher)
  const [editing, setEditing] = useState<AiPromptTemplate | "new" | null>(null)
  const templates = data?.templates ?? []

  const grouped = templates.reduce<Record<string, AiPromptTemplate[]>>(
    (acc, t) => {
      acc[t.category] = acc[t.category] ?? []
      acc[t.category].push(t)
      return acc
    },
    {},
  )

  return (
    <div className="space-y-5 max-w-[960px]">
      <header>
        <h1 className="text-[20px] font-semibold text-slate-900 dark:text-white tracking-tight">
          Templates de Prompt IA
        </h1>
        <p className="mt-1 text-[13px] text-slate-500 dark:text-white/55 leading-relaxed">
          Crie templates reutilizáveis com variáveis. Use{" "}
          <code className="text-[12px] bg-slate-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded">
            {"{{nome}}"}
          </code>{" "}
          para placeholders. Eles aparecem como atalhos no chat IA.
        </p>
      </header>

      <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] pb-2">
        <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-slate-700 dark:text-white/75">
          {templates.length} template{templates.length === 1 ? "" : "s"}
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo template
        </button>
      </div>

      {isLoading && (
        <div className="py-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      )}

      {!isLoading && templates.length === 0 && (
        <EmptyState onAdd={() => setEditing("new")} />
      )}

      {!isLoading && templates.length > 0 && (
        <div className="space-y-5">
          {Object.entries(grouped).map(([cat, list]) => (
            <section key={cat}>
              <h2
                className="text-[11px] font-semibold uppercase tracking-wide mb-2 px-2 py-0.5 inline-block rounded"
                style={{
                  background: `${TEMPLATE_CATEGORY_COLORS[cat as AiTemplateCategory]}1A`,
                  color: TEMPLATE_CATEGORY_COLORS[cat as AiTemplateCategory],
                }}
              >
                {TEMPLATE_CATEGORY_LABELS[cat as AiTemplateCategory] ?? cat}
              </h2>
              <ul className="space-y-1.5">
                {list.map((t) => (
                  <li
                    key={t.id}
                    className="group flex items-start justify-between gap-3 rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-slate-900 dark:text-white">
                          {t.name}
                        </span>
                        {t.is_default && (
                          <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded">
                            Padrão
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[12px] text-slate-600 dark:text-white/65 line-clamp-2 whitespace-pre-wrap">
                        {t.template}
                      </p>
                      {t.variables.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {t.variables.map((v) => (
                            <code
                              key={v}
                              className="text-[10px] bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/60 px-1.5 py-0.5 rounded"
                            >
                              {v}
                            </code>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => setEditing(t)}
                        className="flex h-7 w-7 items-center justify-center rounded-[5px] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm(`Excluir "${t.name}"?`)) return
                          await fetch(`/api/ai/templates/${t.id}`, {
                            method: "DELETE",
                          })
                          mutate()
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-[5px] text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600"
                        title="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <TemplateDialog
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            mutate()
          }}
        />
      )}
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-[8px] border border-dashed border-slate-300 dark:border-white/[0.10] py-10 px-6 text-center">
      <div className="mx-auto h-10 w-10 rounded-full bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center text-slate-400 mb-3">
        <Sparkles className="h-4 w-4" />
      </div>
      <p className="text-[13px] font-medium text-slate-700 dark:text-white/75">
        Nenhum template ainda
      </p>
      <p className="mt-1 text-[12px] text-slate-500 dark:text-white/45 max-w-[400px] mx-auto leading-relaxed">
        Crie templates como &quot;Gerar copy de email para {"{{tema}}"} da loja{" "}
        {"{{nome_loja}}"} com tom {"{{voz_marca}}"}&quot;. Eles ficam disponíveis
        no chat IA pra você reutilizar.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold"
      >
        <Plus className="h-3.5 w-3.5" />
        Criar primeiro template
      </button>
    </div>
  )
}

function TemplateDialog({
  template,
  onClose,
  onSaved,
}: {
  template: AiPromptTemplate | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = template !== null
  const [name, setName] = useState(template?.name ?? "")
  const [category, setCategory] = useState<AiTemplateCategory>(
    template?.category ?? "campaign",
  )
  const [tpl, setTpl] = useState(template?.template ?? "")
  const [isDefault, setIsDefault] = useState(template?.is_default ?? false)
  const [submitting, setSubmitting] = useState(false)

  // Auto-extrai variaveis do template ({{nome}})
  const variables = Array.from(
    new Set(Array.from(tpl.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)).map((m) => m[1])),
  )

  useEffect(() => {
    setName(template?.name ?? "")
    setCategory((template?.category as AiTemplateCategory) ?? "campaign")
    setTpl(template?.template ?? "")
    setIsDefault(template?.is_default ?? false)
  }, [template])

  const save = async () => {
    if (!name.trim() || !tpl.trim()) return
    setSubmitting(true)
    try {
      const payload = {
        name: name.trim(),
        category,
        template: tpl,
        variables,
        is_default: isDefault,
      }
      const url = isEdit ? `/api/ai/templates/${template!.id}` : "/api/ai/templates"
      const method = isEdit ? "PATCH" : "POST"
      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-[600px] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogPrimitive.Title className="sr-only">
            {isEdit ? "Editar template" : "Novo template"}
          </DialogPrimitive.Title>
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
              {isEdit ? "Editar template" : "Novo template"}
            </h2>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Fechar"
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                Nome
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Copy de Black Friday"
                className="crm-input w-full"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                Categoria
              </label>
              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as AiTemplateCategory)
                }
                className="crm-input w-full"
              >
                {Object.entries(TEMPLATE_CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                Template (use {"{{nome}}"} para variáveis)
              </label>
              <textarea
                rows={6}
                value={tpl}
                onChange={(e) => setTpl(e.target.value)}
                placeholder="Gere uma copy de email para {{tipo_campanha}} da loja {{nome_loja}} com tom {{voz_marca}}."
                className="crm-input w-full font-mono text-[12px]"
              />
              {variables.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 dark:text-white/45">
                    Variáveis detectadas:
                  </span>
                  {variables.map((v) => (
                    <code
                      key={v}
                      className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded"
                    >
                      {v}
                    </code>
                  ))}
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-[12px] cursor-pointer">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              <span className="text-slate-700 dark:text-white/80">
                Marcar como template padrão (destacado no chat)
              </span>
            </label>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-[6px] text-[12px] font-medium text-slate-700 dark:text-white/75 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={submitting || !name.trim() || !tpl.trim()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "Salvar" : "Criar template"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
