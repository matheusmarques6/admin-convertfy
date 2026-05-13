"use client"

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { Plus, FileText, Loader2, BookOpen } from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import { ROUTES } from "@/lib/routes"
import type { TutorialPage } from "@/types/onboarding-pipeline"

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error?.message ?? `HTTP ${r.status}`)
  return j
}

export function TutorialPagesList() {
  const { data, mutate, isLoading } = useSWR<{ pages: TutorialPage[] }>(
    "/api/tutorial-pages",
    fetcher,
  )
  const [creating, setCreating] = useState(false)

  const pages = data?.pages ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-brand-100 dark:bg-brand-500/15 text-brand-400 dark:text-brand-300">
              <BookOpen className="h-3.5 w-3.5" />
            </span>
            <h1 className="text-[20px] font-semibold tracking-tight text-slate-900 dark:text-white">
              Tutorial do cliente
            </h1>
          </div>
          <p className="text-[13px] text-slate-500 dark:text-white/55 max-w-2xl">
            Páginas de ajuda enviadas pelos onboardings com links públicos
            tokenizados. Use variáveis como{" "}
            <code className="text-[11px] font-mono bg-slate-100 dark:bg-white/[0.06] px-1 rounded">
              &#123;&#123;client_name&#125;&#125;
            </code>{" "}
            no conteúdo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo tutorial
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : pages.length === 0 ? (
        <div className="text-center py-16 rounded-[8px] bg-white dark:bg-[#0F1117] border border-dashed border-slate-300 dark:border-white/[0.10]">
          <FileText className="h-10 w-10 text-slate-300 dark:text-white/20 mx-auto mb-3" />
          <p className="text-[14px] font-semibold text-slate-700 dark:text-white mb-1">
            Nenhum tutorial criado ainda
          </p>
          <p className="text-[12.5px] text-slate-500 dark:text-white/55">
            Crie a primeira página pra começar.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {pages.map((p) => (
            <Link
              key={p.id}
              href={ROUTES.ADMIN.ONBOARDING_HELP.EDIT_PAGE(p.id)}
              className="block rounded-[8px] bg-white dark:bg-[#0F1117] border border-slate-200 dark:border-white/[0.08] p-4 hover:border-slate-300 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">
                  {p.name}
                </h3>
                <span
                  className={
                    "text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 " +
                    (p.status === "published"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : "bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-white/55")
                  }
                >
                  {p.status}
                </span>
              </div>
              {p.description && (
                <p className="text-[12px] text-slate-500 dark:text-white/55 line-clamp-2">
                  {p.description}
                </p>
              )}
              <p className="mt-2 text-[10.5px] font-mono text-slate-400">
                /{p.slug}
              </p>
            </Link>
          ))}
        </div>
      )}

      {creating && (
        <NewTutorialDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            mutate()
          }}
        />
      )}
    </div>
  )
}

function NewTutorialDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [description, setDescription] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()

  async function submit() {
    if (!name.trim() || !slug.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/tutorial-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, description }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.toast({
          variant: "destructive",
          title: "Falha ao criar",
          description: j.error?.message ?? "Tente novamente.",
        })
      } else {
        toast.toast({ title: "Tutorial criado" })
        onCreated()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[460px] bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] overflow-hidden">
        <div className="px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
            Novo tutorial
          </h2>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80 mb-1">
              Nome
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (!slug.length || slug === slugify(name))
                  setSlug(slugify(e.target.value))
              }}
              placeholder="Ex: Como dar acesso ao Klaviyo"
              className="w-full h-9 px-3 text-[12.5px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80 mb-1">
              Slug
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              placeholder="acesso-klaviyo"
              className="w-full h-9 px-3 text-[12.5px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27] font-mono"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80 mb-1">
              Descrição (opcional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-[12.5px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 text-[12px] font-medium text-slate-700 hover:bg-slate-100 rounded-[6px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !name.trim() || !slug.trim()}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-semibold bg-[#1F1F1F] dark:bg-white text-white dark:text-black rounded-[6px] disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Criar
          </button>
        </div>
      </div>
    </div>
  )
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}
