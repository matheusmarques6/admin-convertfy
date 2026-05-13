"use client"

/**
 * Renderer publico do tutorial. Recebe blocks com variaveis ja substituidas
 * pelo backend e renderiza por tipo (text/step/image/video/code/faq/cta_whatsapp).
 */

import { useEffect, useState } from "react"
import {
  Loader2,
  AlertTriangle,
  MessageCircle,
  Sparkles,
  CheckCircle2,
} from "lucide-react"
import type { TutorialBlock, TutorialPage } from "@/types/onboarding-pipeline"

interface RenderedTutorial {
  page: TutorialPage
  context: {
    client_name: string
    store_name: string
    platform_name: string
  }
}

export function PublicTutorialRenderer({ token }: { token: string }) {
  const [data, setData] = useState<RenderedTutorial | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/onboarding-help/${token}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) setError(j.error ?? "Tutorial não disponível")
        else setData({ page: j.page, context: j.context })
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md text-center">
          <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <h1 className="text-[18px] font-semibold text-slate-900 mb-1">
            Tutorial indisponível
          </h1>
          <p className="text-[13px] text-slate-600">
            {error ?? "Tente novamente mais tarde."}
          </p>
        </div>
      </div>
    )
  }

  const { page, context } = data
  const blocks = [...(page.blocks ?? [])].sort((a, b) => a.position - b.position)
  let stepIdx = 0

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-5 py-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-violet-100 text-violet-600">
              <Sparkles className="h-3 w-3" />
            </span>
            <p className="text-[11px] font-bold uppercase tracking-wide text-violet-600">
              Tutorial · {context.store_name}
            </p>
          </div>
          <h1 className="text-[22px] font-bold tracking-tight text-slate-900">
            {page.name}
          </h1>
          {page.description && (
            <p className="text-[13px] text-slate-600 mt-1">{page.description}</p>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 py-6 space-y-4">
        {blocks.map((b) => {
          if (b.type === "step") stepIdx += 1
          return <BlockRenderer key={b.id} block={b} stepIdx={stepIdx} />
        })}
        {blocks.length === 0 && (
          <div className="text-center py-16">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
              <Sparkles className="h-6 w-6" />
            </div>
            <p className="text-[14px] font-semibold text-slate-700">
              Conteúdo em preparação
            </p>
            <p className="text-[13px] text-slate-500 mt-1">
              Nossa equipe está finalizando seu tutorial. Volte em breve.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function BlockRenderer({
  block,
  stepIdx,
}: {
  block: TutorialBlock
  stepIdx: number
}) {
  const c = block.content as Record<string, unknown>

  if (block.type === "text") {
    return (
      <div className="bg-white rounded-[8px] border border-slate-200 p-5">
        <p className="text-[14px] text-slate-800 whitespace-pre-wrap leading-relaxed">
          {String(c.text ?? "")}
        </p>
      </div>
    )
  }

  if (block.type === "step") {
    return (
      <div className="bg-white rounded-[8px] border border-slate-200 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-violet-700 text-[13px] font-bold shrink-0">
            {stepIdx}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-slate-900 mb-1">
              {String(c.title ?? "")}
            </h2>
            <p className="text-[13px] text-slate-700 whitespace-pre-wrap leading-relaxed">
              {String(c.description ?? "")}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (block.type === "image" && c.url) {
    return (
      <div className="bg-white rounded-[8px] border border-slate-200 p-2 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={String(c.url)}
          alt={String(c.alt ?? "")}
          className="w-full h-auto rounded-[6px]"
        />
      </div>
    )
  }

  if (block.type === "video" && c.url) {
    const url = String(c.url)
    const embedUrl = toEmbedUrl(url)
    return (
      <div className="bg-white rounded-[8px] border border-slate-200 overflow-hidden">
        {embedUrl ? (
          <div className="aspect-video">
            <iframe
              src={embedUrl}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="p-4">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-violet-600 hover:underline"
            >
              Ver video: {url}
            </a>
          </div>
        )}
      </div>
    )
  }

  if (block.type === "code") {
    return (
      <div className="rounded-[8px] border border-slate-200 bg-slate-900 overflow-hidden">
        <div className="px-3 py-1.5 border-b border-slate-700 text-[10px] font-mono uppercase tracking-wide text-slate-400">
          {String(c.language ?? "code")}
        </div>
        <pre className="p-4 text-[12.5px] font-mono text-slate-100 overflow-x-auto whitespace-pre-wrap">
          {String(c.code ?? "")}
        </pre>
      </div>
    )
  }

  if (block.type === "faq") {
    return (
      <details className="bg-white rounded-[8px] border border-slate-200 p-4 group">
        <summary className="text-[13.5px] font-semibold text-slate-900 cursor-pointer flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-violet-500 shrink-0" />
          {String(c.question ?? "")}
        </summary>
        <p className="mt-2 pl-6 text-[13px] text-slate-700 whitespace-pre-wrap leading-relaxed">
          {String(c.answer ?? "")}
        </p>
      </details>
    )
  }

  if (block.type === "cta_whatsapp") {
    const phone = String(c.phone ?? "").replace(/\D/g, "")
    const text = String(c.text ?? "Falar com a equipe")
    const href = phone ? `https://wa.me/${phone}` : "#"
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block bg-emerald-500 hover:bg-emerald-600 text-white rounded-[8px] p-4 text-center"
      >
        <span className="inline-flex items-center gap-2 text-[14px] font-semibold">
          <MessageCircle className="h-4 w-4" />
          {text}
        </span>
      </a>
    )
  }

  return null
}

function toEmbedUrl(url: string): string | null {
  // YouTube
  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/,
  )
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  // Loom
  const loom = url.match(/loom\.com\/share\/([\w-]+)/)
  if (loom) return `https://www.loom.com/embed/${loom[1]}`
  // Vimeo
  const vimeo = url.match(/vimeo\.com\/(\d+)/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`
  return null
}
