"use client"

import { useEffect, useMemo, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import useSWR from "swr"
import { X } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface PipelineLite {
  id: string
  name: string
  color: string | null
  stages: Array<{ id: string; name: string; stage_type: string | null; position?: number; order?: number }>
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (formId: string) => void
  /**
   * Escopo do form. Define quais pipelines aparecem no seletor e em
   * qual area o form sera listado.
   *   - "sales" (default): pipelines de vendas, listado em /comercial/forms
   *   - "cs": pipelines de CS, listado em /operacional/forms
   *   - "either": form generico, aparece nas duas listagens
   */
  scope?: "sales" | "cs" | "either"
}

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

export function NewFormDialog({ open, onClose, onCreated, scope = "sales" }: Props) {
  // Quando scope='either', mostra ambos os tipos de pipeline (sales+cs).
  // Pra simplificar, default 'cs' nesse caso (mais comum em forms genericos
  // criados a partir do CS). Usuario pode trocar manualmente.
  const pipelineScope = scope === "either" ? "cs" : scope
  const { data: pipelinesData } = useSWR<{ pipelines: PipelineLite[] }>(
    open ? `/api/crm/pipelines?scope=${pipelineScope}` : null,
    fetcher,
  )
  const pipelines = useMemo(() => pipelinesData?.pipelines ?? [], [pipelinesData])

  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugDirty, setSlugDirty] = useState(false)
  const [description, setDescription] = useState("")
  const [pipelineId, setPipelineId] = useState<string>("")
  const [stageId, setStageId] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setName("")
      setSlug("")
      setSlugDirty(false)
      setDescription("")
      setPipelineId("")
      setStageId("")
      setError(null)
    }
  }, [open])

  // Auto-slug do nome enquanto user nao toca no slug.
  useEffect(() => {
    if (!slugDirty) setSlug(slugify(name))
  }, [name, slugDirty])

  // Quando muda pipeline, escolhe primeiro stage open por default.
  useEffect(() => {
    if (!pipelineId) {
      setStageId("")
      return
    }
    const p = pipelines.find((x) => x.id === pipelineId)
    const firstOpen = p?.stages
      .filter((s) => (s.stage_type || "open") === "open")
      .sort((a, b) => (a.position ?? a.order ?? 0) - (b.position ?? b.order ?? 0))[0]
    setStageId(firstOpen?.id ?? "")
  }, [pipelineId, pipelines])

  const submit = async () => {
    if (!name.trim()) {
      setError("Informe um nome.")
      return
    }
    if (!slug.trim() || slug.length < 2) {
      setError("Informe um slug válido (mínimo 2 chars).")
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/crm/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || null,
          pipeline_id: pipelineId || null,
          stage_id: stageId || null,
          scope,
          // Fields padrão pra começar.
          fields: [
            {
              field_type: "text",
              label: "Nome",
              placeholder: "Seu nome completo",
              required: true,
              position: 0,
              map_to_lead_field: "name",
            },
            {
              field_type: "email",
              label: "Email",
              placeholder: "voce@email.com",
              required: true,
              position: 1,
              map_to_lead_field: "email",
            },
            {
              field_type: "phone",
              label: "WhatsApp",
              placeholder: "(11) 99999-9999",
              required: false,
              position: 2,
              map_to_lead_field: "phone",
            },
          ],
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error?.message || "Erro ao criar formulário")
        return
      }
      onCreated(json.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setSubmitting(false)
    }
  }

  const stages = pipelines.find((p) => p.id === pipelineId)?.stages ?? []

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[8px] bg-white dark:bg-[#0F1117] text-slate-900 dark:text-white/90 shadow-[0_12px_32px_rgba(15,23,42,0.20)] data-[state=open]:animate-in data-[state=open]:zoom-in-95"
        >
          <div className="flex items-start justify-between border-b border-black/[0.06] dark:border-white/[0.08] px-5 py-4">
            <DialogPrimitive.Title className="text-[15px] font-semibold">
              Novo formulário
            </DialogPrimitive.Title>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="text-slate-400 hover:text-slate-700 dark:text-white/40 dark:hover:text-white/80"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4">
            <Field label="Nome do formulário *">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Captação landing page"
                className="crm-input w-full"
                autoFocus
              />
            </Field>

            <Field
              label="Slug (URL pública) *"
              hint={`/forms/${slug || "seu-slug"}`}
            >
              <input
                type="text"
                value={slug}
                onChange={(e) => {
                  setSlug(slugify(e.target.value))
                  setSlugDirty(true)
                }}
                placeholder="ex-captacao-lp"
                className="crm-input w-full"
              />
            </Field>

            <Field label="Descrição (interna)">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Pra que serve este formulário? (opcional)"
                rows={2}
                className="crm-input w-full"
                style={{ minHeight: 56 }}
              />
            </Field>

            <Field label="Pipeline (opcional)" hint="Leads enviados criam deal automaticamente.">
              <select
                value={pipelineId}
                onChange={(e) => setPipelineId(e.target.value)}
                className="crm-input w-full"
              >
                <option value="">Sem pipeline (só cria lead)</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>

            {pipelineId && stages.length > 0 && (
              <Field label="Etapa inicial">
                <select
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  className="crm-input w-full"
                >
                  {stages
                    .filter((s) => (s.stage_type || "open") === "open")
                    .sort((a, b) => (a.position ?? a.order ?? 0) - (b.position ?? b.order ?? 0))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}

            {error && (
              <div className="text-[12px] text-red-600 dark:text-red-400">{error}</div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-black/[0.06] dark:border-white/[0.08] px-5 py-3">
            <button
              onClick={onClose}
              className="crm-button-ghost"
              style={{ height: 32, padding: "0 12px" }}
            >
              Cancelar
            </button>
            <button
              onClick={submit}
              disabled={submitting || !name.trim() || !slug.trim()}
              className="crm-button-primary"
              style={{ height: 32, padding: "0 12px" }}
            >
              {submitting ? "Criando..." : "Criar formulário"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-medium text-slate-700 dark:text-white/70">
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-[10px] text-slate-500 dark:text-white/45 font-mono">
          {hint}
        </p>
      )}
    </div>
  )
}
