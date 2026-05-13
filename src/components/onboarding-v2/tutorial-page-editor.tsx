"use client"

/**
 * Editor de tutorial: lista de blocks editaveis em ordem.
 * Tipos suportados: text, video, image, step, code, faq, cta_whatsapp.
 * Salva inline via PATCH em cada block. Botao publish toggla status.
 */

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import {
  ChevronLeft,
  Plus,
  Trash2,
  Save,
  Globe,
  Loader2,
  GripVertical,
  Upload,
  X,
  ArrowDown,
  ArrowUp,
} from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import { ROUTES } from "@/lib/routes"
import type {
  TutorialPage,
  TutorialBlock,
  TutorialBlockType,
} from "@/types/onboarding-pipeline"

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error?.message ?? `HTTP ${r.status}`)
  return j
}

const BLOCK_TYPES: { id: TutorialBlockType; label: string; default: Record<string, unknown> }[] = [
  { id: "text", label: "Texto", default: { text: "" } },
  { id: "step", label: "Passo", default: { title: "", description: "" } },
  { id: "image", label: "Imagem", default: { url: "", alt: "" } },
  { id: "video", label: "Video", default: { url: "" } },
  { id: "code", label: "Código", default: { language: "javascript", code: "" } },
  { id: "faq", label: "FAQ", default: { question: "", answer: "" } },
  { id: "cta_whatsapp", label: "CTA WhatsApp", default: { text: "Falar com a equipe", phone: "" } },
]

export function TutorialPageEditor({ id }: { id: string }) {
  const { data, mutate, isLoading } = useSWR<{ page: TutorialPage }>(
    `/api/tutorial-pages/${id}`,
    fetcher,
  )
  const toast = useToast()
  const [savingMeta, setSavingMeta] = useState(false)

  if (isLoading || !data?.page) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }
  const page = data.page
  const blocks = [...(page.blocks ?? [])].sort((a, b) => a.position - b.position)

  async function addBlock(type: TutorialBlockType) {
    const tpl = BLOCK_TYPES.find((b) => b.id === type)?.default ?? {}
    const res = await fetch(`/api/tutorial-pages/${id}/blocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, content: tpl }),
    })
    if (!res.ok) {
      toast.toast({ variant: "destructive", title: "Falha ao criar bloco" })
      return
    }
    mutate()
  }

  async function deleteBlock(blockId: string) {
    if (!confirm("Excluir esse bloco?")) return
    await fetch(`/api/tutorial-pages/${id}/blocks/${blockId}`, {
      method: "DELETE",
    })
    mutate()
  }

  async function saveBlock(blockId: string, content: Record<string, unknown>) {
    await fetch(`/api/tutorial-pages/${id}/blocks/${blockId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    })
    mutate()
  }

  async function moveBlock(blockId: string, dir: "up" | "down") {
    const idx = blocks.findIndex((b) => b.id === blockId)
    if (idx < 0) return
    const target = dir === "up" ? idx - 1 : idx + 1
    if (target < 0 || target >= blocks.length) return
    const cur = blocks[idx]
    const swap = blocks[target]
    // Troca positions
    await Promise.all([
      fetch(`/api/tutorial-pages/${id}/blocks/${cur.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: swap.position }),
      }),
      fetch(`/api/tutorial-pages/${id}/blocks/${swap.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: cur.position }),
      }),
    ])
    mutate()
  }

  async function togglePublish() {
    setSavingMeta(true)
    try {
      const newStatus = page.status === "published" ? "draft" : "published"
      const res = await fetch(`/api/tutorial-pages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        toast.toast({
          title:
            newStatus === "published" ? "Publicado" : "Despublicado (rascunho)",
        })
        mutate()
      }
    } finally {
      setSavingMeta(false)
    }
  }

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div>
        <Link
          href={ROUTES.ADMIN.ONBOARDING_HELP.LIST}
          className="inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-700"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Voltar
        </Link>
      </div>

      {/* Meta */}
      <div className="rounded-[8px] bg-white dark:bg-[#0F1117] border border-slate-200 dark:border-white/[0.08] p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-[18px] font-semibold text-slate-900 dark:text-white">
              {page.name}
            </h1>
            <p className="text-[12px] font-mono text-slate-500 dark:text-white/55">
              /{page.slug}
            </p>
          </div>
          <button
            type="button"
            onClick={togglePublish}
            disabled={savingMeta}
            className={
              "inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-semibold rounded-[6px] disabled:opacity-50 " +
              (page.status === "published"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                : "bg-[#1F1F1F] text-white hover:bg-black")
            }
          >
            {savingMeta && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <Globe className="h-3.5 w-3.5" />
            {page.status === "published" ? "Publicado" : "Publicar"}
          </button>
        </div>
        <p className="text-[12.5px] text-slate-600 dark:text-white/70 leading-relaxed">
          Use variáveis no conteúdo:{" "}
          <code className="text-[11px] font-mono bg-slate-100 dark:bg-white/[0.06] px-1 py-0.5 rounded">
            &#123;&#123;client_name&#125;&#125;
          </code>{" "}
          ·{" "}
          <code className="text-[11px] font-mono bg-slate-100 dark:bg-white/[0.06] px-1 py-0.5 rounded">
            &#123;&#123;store_name&#125;&#125;
          </code>{" "}
          ·{" "}
          <code className="text-[11px] font-mono bg-slate-100 dark:bg-white/[0.06] px-1 py-0.5 rounded">
            &#123;&#123;platform_name&#125;&#125;
          </code>
        </p>
      </div>

      {/* Blocks */}
      <div className="space-y-3">
        {blocks.map((b, idx) => (
          <BlockEditor
            key={b.id}
            block={b}
            pageId={id}
            isFirst={idx === 0}
            isLast={idx === blocks.length - 1}
            onSave={(c) => saveBlock(b.id, c)}
            onDelete={() => deleteBlock(b.id)}
            onMoveUp={() => moveBlock(b.id, "up")}
            onMoveDown={() => moveBlock(b.id, "down")}
          />
        ))}
        {blocks.length === 0 && (
          <p className="text-[12.5px] text-slate-500 dark:text-white/55 italic text-center py-6">
            Nenhum bloco. Adicione um abaixo.
          </p>
        )}
      </div>

      {/* Add block */}
      <div className="rounded-[8px] bg-white dark:bg-[#0F1117] border border-dashed border-slate-300 dark:border-white/[0.10] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/55 mb-2">
          Adicionar bloco
        </p>
        <div className="flex flex-wrap gap-2">
          {BLOCK_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => addBlock(t.id)}
              className="inline-flex items-center gap-1 h-7 px-2.5 text-[11.5px] font-medium text-slate-700 dark:text-white/80 bg-slate-50 dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/[0.08] rounded-[5px] border border-slate-200 dark:border-white/[0.08]"
            >
              <Plus className="h-3 w-3" />
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function BlockEditor({
  block,
  pageId,
  isFirst,
  isLast,
  onSave,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  block: TutorialBlock
  pageId: string
  isFirst: boolean
  isLast: boolean
  onSave: (content: Record<string, unknown>) => Promise<void>
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const [content, setContent] = useState<Record<string, unknown>>(block.content)
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(content) !== JSON.stringify(block.content)

  async function save() {
    setSaving(true)
    try {
      await onSave(content)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-[8px] bg-white dark:bg-[#0F1117] border border-slate-200 dark:border-white/[0.08] p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <GripVertical className="h-3.5 w-3.5 text-slate-300" />
          <span className="text-[10px] font-bold uppercase tracking-wide font-mono text-slate-500 dark:text-white/55 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/[0.06]">
            {block.type}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            className="h-7 w-7 inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-[5px] disabled:opacity-30 disabled:hover:bg-transparent"
            title="Mover pra cima"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            className="h-7 w-7 inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-[5px] disabled:opacity-30 disabled:hover:bg-transparent"
            title="Mover pra baixo"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          {dirty && (
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1 h-7 px-2.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-[5px] border border-emerald-200"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              Salvar
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="h-7 w-7 inline-flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-[5px]"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <BlockFields
        type={block.type}
        content={content}
        onChange={setContent}
        pageId={pageId}
      />
    </div>
  )
}

function BlockFields({
  type,
  content,
  onChange,
  pageId,
}: {
  type: TutorialBlockType
  content: Record<string, unknown>
  onChange: (c: Record<string, unknown>) => void
  pageId: string
}) {
  const set = (k: string, v: unknown) => onChange({ ...content, [k]: v })

  if (type === "text") {
    return (
      <textarea
        value={String(content.text ?? "")}
        onChange={(e) => set("text", e.target.value)}
        rows={5}
        placeholder="Texto do bloco. Aceita Markdown e variáveis {{client_name}}."
        className="w-full px-3 py-2 text-[13px] rounded-[5px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
      />
    )
  }
  if (type === "step") {
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={String(content.title ?? "")}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Título do passo"
          className="w-full h-9 px-3 text-[13px] rounded-[5px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27] font-semibold"
        />
        <textarea
          value={String(content.description ?? "")}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
          placeholder="Descrição do passo"
          className="w-full px-3 py-2 text-[12.5px] rounded-[5px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
        />
      </div>
    )
  }
  if (type === "image") {
    return <ImageBlockField content={content} onChange={onChange} pageId={pageId} />
  }
  if (type === "video") {
    return (
      <input
        type="url"
        value={String(content.url ?? "")}
        onChange={(e) => set("url", e.target.value)}
        placeholder="URL do video (YouTube, Loom, etc.)"
        className="w-full h-9 px-3 text-[12.5px] rounded-[5px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
      />
    )
  }
  if (type === "code") {
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={String(content.language ?? "")}
          onChange={(e) => set("language", e.target.value)}
          placeholder="Linguagem (javascript, html, ...)"
          className="w-full h-9 px-3 text-[12.5px] rounded-[5px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27] font-mono"
        />
        <textarea
          value={String(content.code ?? "")}
          onChange={(e) => set("code", e.target.value)}
          rows={5}
          className="w-full px-3 py-2 text-[12px] font-mono rounded-[5px] border border-slate-200 dark:border-white/[0.10] bg-slate-50 dark:bg-[#1A1D27]"
        />
      </div>
    )
  }
  if (type === "faq") {
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={String(content.question ?? "")}
          onChange={(e) => set("question", e.target.value)}
          placeholder="Pergunta"
          className="w-full h-9 px-3 text-[13px] rounded-[5px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27] font-semibold"
        />
        <textarea
          value={String(content.answer ?? "")}
          onChange={(e) => set("answer", e.target.value)}
          rows={3}
          placeholder="Resposta"
          className="w-full px-3 py-2 text-[12.5px] rounded-[5px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
        />
      </div>
    )
  }
  if (type === "cta_whatsapp") {
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={String(content.text ?? "")}
          onChange={(e) => set("text", e.target.value)}
          placeholder="Texto do botão"
          className="w-full h-9 px-3 text-[12.5px] rounded-[5px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
        />
        <input
          type="tel"
          value={String(content.phone ?? "")}
          onChange={(e) => set("phone", e.target.value)}
          placeholder="Telefone (com DDI: 5511...)"
          className="w-full h-9 px-3 text-[12.5px] rounded-[5px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27] font-mono"
        />
      </div>
    )
  }
  return null
}

function ImageBlockField({
  content,
  onChange,
  pageId,
}: {
  content: Record<string, unknown>
  onChange: (c: Record<string, unknown>) => void
  pageId: string
}) {
  const [uploading, setUploading] = useState(false)
  const url = String(content.url ?? "")
  const alt = String(content.alt ?? "")

  async function upload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("scope", "tutorial")
      fd.append("ref_id", pageId)
      const res = await fetch("/api/upload/onboarding", {
        method: "POST",
        body: fd,
      })
      const j = await res.json().catch(() => ({}))
      const result = j.data ?? j
      if (res.ok && (result.url || result.path)) {
        onChange({
          ...content,
          url: result.url ?? `/api/upload/onboarding?path=${result.path}`,
          storage_path: result.path,
        })
      }
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      {url ? (
        <div className="relative rounded-[6px] border border-slate-200 dark:border-white/[0.08] overflow-hidden bg-slate-50 dark:bg-white/[0.02]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={alt}
            className="w-full max-h-[200px] object-contain"
          />
          <button
            type="button"
            onClick={() =>
              onChange({ ...content, url: "", storage_path: undefined })
            }
            className="absolute top-2 right-2 h-7 w-7 inline-flex items-center justify-center rounded-[5px] bg-white/90 text-slate-700 hover:bg-white shadow-sm"
            title="Remover imagem"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <label className="flex items-center justify-center gap-1.5 h-20 rounded-[6px] border border-dashed border-slate-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.02] cursor-pointer hover:border-violet-400">
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          ) : (
            <>
              <Upload className="h-4 w-4 text-slate-400" />
              <span className="text-[12px] text-slate-600 dark:text-white/55">
                Upload de imagem
              </span>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void upload(f)
            }}
          />
        </label>
      )}
      <input
        type="url"
        value={url}
        onChange={(e) => onChange({ ...content, url: e.target.value })}
        placeholder="Ou cole uma URL externa"
        className="w-full h-9 px-3 text-[12.5px] rounded-[5px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
      />
      <input
        type="text"
        value={alt}
        onChange={(e) => onChange({ ...content, alt: e.target.value })}
        placeholder="Texto alternativo (acessibilidade)"
        className="w-full h-9 px-3 text-[12.5px] rounded-[5px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
      />
    </div>
  )
}
