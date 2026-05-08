"use client"

import { useState } from "react"
import Link from "next/link"
import useSWR, { mutate as globalMutate } from "swr"
import {
  Plus,
  FileText,
  ExternalLink,
  Trash2,
  Eye,
  EyeOff,
  Copy as CopyIcon,
  CheckCircle2,
} from "lucide-react"
import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { CrmEmptyState } from "@/components/crm/crm-empty-state"
import { PageSkeleton } from "@/components/ui/page-skeleton"
import { ROUTES } from "@/lib/routes"
import { NewFormDialog } from "@/components/crm/new-form-dialog"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface FormSummary {
  id: string
  name: string
  slug: string
  description: string | null
  status: "draft" | "published" | "archived"
  pipeline_id: string | null
  stage_id: string | null
  submissions_count: number
  views_count: number
  created_at: string
  pipeline: { id: string; name: string; color: string | null } | null
  stage: { id: string; name: string } | null
  theme: { primaryColor?: string }
}

export default function FormsListPage() {
  const [newOpen, setNewOpen] = useState(false)
  const { data, isLoading, mutate } = useSWR<{ forms: FormSummary[] }>(
    "/api/crm/forms",
    fetcher,
  )
  const forms = data?.forms ?? []

  return (
    <CrmPageShell
      title="Formulários"
      subtitle="Páginas de captação que criam leads e deals automaticamente."
      actions={
        <button
          onClick={() => setNewOpen(true)}
          className="crm-button-primary"
          style={{ display: "inline-flex", alignItems: "center", gap: "var(--crm-space-2)" }}
        >
          <Plus className="h-3.5 w-3.5" />
          Novo formulário
        </button>
      }
    >
      <div className="p-6">
        {isLoading ? (
          <PageSkeleton variant="list" showHeader={false} className="px-0 py-0" />
        ) : forms.length === 0 ? (
          <CrmEmptyState
            icon={<FileText className="h-5 w-5" />}
            title="Nenhum formulário criado ainda"
            description="Crie um formulário para capturar leads — eles caem direto no pipeline configurado, prontos pra serem trabalhados pelo time."
            action={
              <button
                className="crm-button-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: "var(--crm-space-2)" }}
                onClick={() => setNewOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Criar primeiro formulário
              </button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {forms.map((f) => (
              <FormCard key={f.id} form={f} onChange={() => mutate()} />
            ))}
          </div>
        )}
      </div>

      <NewFormDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(id) => {
          globalMutate("/api/crm/forms")
          window.location.href = ROUTES.ADMIN.COMERCIAL.FORM_DETAIL(id)
        }}
      />
    </CrmPageShell>
  )
}

function FormCard({
  form,
  onChange,
}: {
  form: FormSummary
  onChange: () => void
}) {
  const [copied, setCopied] = useState(false)
  const accent = form.theme?.primaryColor ?? form.pipeline?.color ?? "#2563EB"
  const publicUrl = `/forms/${form.slug}`

  const togglePublish = async () => {
    const next = form.status === "published" ? "draft" : "published"
    await fetch(`/api/crm/forms/${form.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    })
    onChange()
  }

  const remove = async () => {
    if (!window.confirm("Arquivar este formulário?")) return
    await fetch(`/api/crm/forms/${form.id}`, { method: "DELETE" })
    onChange()
  }

  const copyUrl = () => {
    const full = typeof window !== "undefined" ? `${window.location.origin}${publicUrl}` : publicUrl
    navigator.clipboard.writeText(full)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div
      className="relative flex flex-col rounded-[6px] border bg-white dark:bg-[#1A1D27] border-black/[0.06] dark:border-white/[0.08] overflow-hidden hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-shadow"
    >
      {/* Stripe colorida no topo */}
      <div className="h-1" style={{ background: accent }} aria-hidden />

      <div className="p-4 flex flex-col flex-1 gap-3">
        {/* Header com nome + status */}
        <div className="flex items-start justify-between gap-2">
          <Link
            href={ROUTES.ADMIN.COMERCIAL.FORM_DETAIL(form.id)}
            className="min-w-0 flex-1 group"
          >
            <h3 className="truncate text-[14px] font-semibold text-slate-900 dark:text-white group-hover:underline">
              {form.name}
            </h3>
            {form.description && (
              <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500 dark:text-white/55">
                {form.description}
              </p>
            )}
          </Link>
          <StatusBadge status={form.status} />
        </div>

        {/* Pipeline link */}
        {form.pipeline ? (
          <div className="text-[11px] text-slate-500 dark:text-white/55 flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ background: form.pipeline.color ?? "#94A3B8" }}
            />
            <span className="truncate">
              {form.pipeline.name}
              {form.stage && ` · ${form.stage.name}`}
            </span>
          </div>
        ) : (
          <div className="text-[11px] text-amber-600 dark:text-amber-400">
            ⚠ Sem pipeline configurado — leads não criam deals.
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-[4px] bg-slate-50 dark:bg-white/[0.04] px-2 py-2">
            <div className="text-[16px] font-semibold tabular-nums text-slate-900 dark:text-white">
              {form.submissions_count}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-white/55">
              Envios
            </div>
          </div>
          <div className="rounded-[4px] bg-slate-50 dark:bg-white/[0.04] px-2 py-2">
            <div className="text-[16px] font-semibold tabular-nums text-slate-900 dark:text-white">
              {form.views_count}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-white/55">
              Visitas
            </div>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-1 border-t border-black/[0.04] dark:border-white/[0.06] px-3 py-2">
        <button
          onClick={copyUrl}
          title="Copiar URL pública"
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-[4px] text-slate-600 dark:text-white/65 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
        >
          {copied ? (
            <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <CopyIcon className="h-3 w-3" />
          )}
          {copied ? "Copiado" : "URL"}
        </button>

        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir página pública"
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-[4px] text-slate-600 dark:text-white/65 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
        >
          <ExternalLink className="h-3 w-3" />
          Abrir
        </a>

        <button
          onClick={togglePublish}
          title={form.status === "published" ? "Despublicar" : "Publicar"}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-[4px] text-slate-600 dark:text-white/65 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
        >
          {form.status === "published" ? (
            <>
              <EyeOff className="h-3 w-3" />
              Despublicar
            </>
          ) : (
            <>
              <Eye className="h-3 w-3" />
              Publicar
            </>
          )}
        </button>

        <button
          onClick={remove}
          title="Arquivar"
          aria-label="Arquivar formulário"
          className="ml-auto flex items-center justify-center px-2 py-1 rounded-[4px] text-slate-400 hover:text-red-600 hover:bg-red-50 dark:text-white/40 dark:hover:text-red-400 dark:hover:bg-red-900/20"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: "draft" | "published" | "archived" }) {
  const map = {
    draft: { label: "Rascunho", cls: "bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-white/65" },
    published: { label: "Publicado", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
    archived: { label: "Arquivado", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  } as const
  const m = map[status]
  return (
    <span
      className={`shrink-0 text-[9px] font-semibold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded-[3px] ${m.cls}`}
    >
      {m.label}
    </span>
  )
}
