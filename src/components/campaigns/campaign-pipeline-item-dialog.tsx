"use client"

import { useEffect, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X, Loader2, Trash2 } from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import {
  CAMPAIGN_TYPE_LABELS,
  STAGE_CONFIG,
  type CampaignPipelineItem,
  type CampaignPipelineType,
  type CampaignStage,
} from "@/types/campaign-pipeline"

interface Props {
  open: boolean
  item: CampaignPipelineItem | null
  onClose: () => void
  onSaved: () => void
}

export function CampaignPipelineItemDialog({
  open,
  item,
  onClose,
  onSaved,
}: Props) {
  const isEdit = item !== null
  const toast = useToast()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [campaignType, setCampaignType] = useState<CampaignPipelineType | "">("")
  const [stage, setStage] = useState<CampaignStage>("idea")
  const [subject, setSubject] = useState("")
  const [previewText, setPreviewText] = useState("")
  const [bodyHtml, setBodyHtml] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (item) {
      setTitle(item.title)
      setDescription(item.description ?? "")
      setCampaignType((item.campaign_type ?? "") as CampaignPipelineType | "")
      setStage(item.stage as CampaignStage)
      setSubject(item.subject_line ?? "")
      setPreviewText(item.preview_text ?? "")
      setBodyHtml(item.copy_data?.body_html ?? "")
      setDueDate(item.due_date ? item.due_date.slice(0, 10) : "")
    } else {
      setTitle("")
      setDescription("")
      setCampaignType("")
      setStage("idea")
      setSubject("")
      setPreviewText("")
      setBodyHtml("")
      setDueDate("")
    }
  }, [open, item])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        campaign_type: campaignType || null,
        stage,
        subject_line: subject.trim() || null,
        preview_text: previewText.trim() || null,
        copy_data: { body_html: bodyHtml || null },
        due_date: dueDate || null,
      }
      const url = isEdit
        ? `/api/campaign-pipeline/${item!.id}`
        : "/api/campaign-pipeline"
      const method = isEdit ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.toast({
          variant: "destructive",
          title: "Erro ao salvar campanha",
          description: j.error?.message ?? "Tente novamente.",
        })
        return
      }
      toast.toast({
        title: isEdit ? "Campanha atualizada" : "Campanha criada",
        description: title.trim(),
      })
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!item) return
    if (!confirm(`Excluir "${item.title}"?`)) return
    setDeleting(true)
    try {
      await fetch(`/api/campaign-pipeline/${item.id}`, { method: "DELETE" })
      onSaved()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-[640px] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] max-h-[90vh] overflow-hidden flex flex-col data-[state=open]:animate-in data-[state=open]:zoom-in-95">
          <DialogPrimitive.Title className="sr-only">
            {isEdit ? "Editar campanha" : "Nova campanha"}
          </DialogPrimitive.Title>

          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
              {isEdit ? "Editar campanha" : "Nova campanha"}
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

          <form
            onSubmit={handleSave}
            className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5"
          >
            <Field label="Título" required>
              <input
                autoFocus
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="crm-input w-full"
                placeholder="Black Friday 2026"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo">
                <select
                  value={campaignType}
                  onChange={(e) =>
                    setCampaignType(e.target.value as CampaignPipelineType | "")
                  }
                  className="crm-input w-full"
                >
                  <option value="">—</option>
                  {Object.entries(CAMPAIGN_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Estágio">
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value as CampaignStage)}
                  className="crm-input w-full"
                >
                  {STAGE_CONFIG.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.emoji} {s.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Descrição">
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="crm-input w-full"
                placeholder="Breve descrição da campanha"
              />
            </Field>

            <Field label="Assunto do email">
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="crm-input w-full"
                placeholder="🔥 Black Friday começou! 50% OFF"
              />
            </Field>

            <Field label="Preview text (preheader)">
              <input
                type="text"
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                className="crm-input w-full"
                placeholder="Aproveite enquanto dura..."
              />
            </Field>

            <Field label="Copy (HTML)">
              <textarea
                rows={5}
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                className="crm-input w-full font-mono text-[12px]"
                placeholder="<h1>Olá {{firstName}}...</h1>"
              />
            </Field>

            <Field label="Prazo">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="crm-input w-full"
              />
            </Field>
          </form>

          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
            <div>
              {isEdit && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-red-600 hover:text-red-700"
                >
                  {deleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Excluir
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="h-8 px-3 rounded-[6px] text-[12px] font-medium text-slate-700 dark:text-white/75 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={submitting || !title.trim()}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isEdit ? "Salvar" : "Criar"}
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
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
    </div>
  )
}
