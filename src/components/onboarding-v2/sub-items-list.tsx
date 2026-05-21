"use client"

import { useState } from "react"
import { Check, Download, Sparkles } from "lucide-react"

export interface SubItem {
  slug: string
  label: string
  from_preview?: string
  completed?: boolean
  preview_deliverable_id?: string | null
  preview_file_url?: string | null
  completed_at?: string | null
  completed_by?: string | null
}

interface SubItemsListProps {
  taskId: string
  items: SubItem[]
  onMutate: () => void
}

/**
 * Sub-checklist renderizado dentro de uma task da Etapa 05 (emails finais).
 * Cada sub_item vira um email do flow; badges destacam emails pre-completados
 * pelos pilotos da Etapa 03 (from_preview).
 */
export function SubItemsList({ taskId, items, onMutate }: SubItemsListProps) {
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [local, setLocal] = useState<SubItem[]>(items)

  if (!items || items.length === 0) return null

  const completed = local.filter((i) => i.completed).length
  const total = local.length

  async function toggle(slug: string, next: boolean) {
    setPending((p) => new Set(p).add(slug))
    setLocal((prev) =>
      prev.map((i) => (i.slug === slug ? { ...i, completed: next } : i)),
    )
    try {
      const res = await fetch(
        `/api/tasks/${taskId}/sub-items/${slug}/toggle`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completed: next }),
        },
      )
      if (!res.ok) throw new Error("Falha")
      onMutate()
    } catch {
      // Rollback otimista
      setLocal((prev) =>
        prev.map((i) => (i.slug === slug ? { ...i, completed: !next } : i)),
      )
    } finally {
      setPending((p) => {
        const n = new Set(p)
        n.delete(slug)
        return n
      })
    }
  }

  return (
    <div className="mt-2 ml-7 rounded-[4px] border border-slate-200 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.02] overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 dark:border-white/[0.06] flex items-center justify-between bg-white/40 dark:bg-white/[0.02]">
        <span className="text-[11px] font-medium text-slate-600 dark:text-white/65">
          Emails do flow
        </span>
        <span className="text-[11px] font-mono tabular-nums text-slate-500">
          {completed}/{total}
        </span>
      </div>
      <ul className="divide-y divide-slate-200 dark:divide-white/[0.06]">
        {local.map((item) => {
          const isPending = pending.has(item.slug)
          const fromPreview = !!item.from_preview
          return (
            <li
              key={item.slug}
              className="px-3 py-2 flex items-center gap-2.5"
            >
              <button
                type="button"
                disabled={isPending}
                onClick={() => toggle(item.slug, !item.completed)}
                className={[
                  "h-4 w-4 rounded-[3px] border flex items-center justify-center transition-colors shrink-0",
                  item.completed
                    ? "bg-brand-500 border-brand-500 text-white"
                    : "border-slate-300 dark:border-white/15 hover:border-brand-400",
                  isPending && "opacity-50",
                ].filter(Boolean).join(" ")}
                aria-label={
                  item.completed ? "Desmarcar" : "Marcar como concluido"
                }
              >
                {item.completed && <Check className="h-3 w-3" />}
              </button>
              <span
                className={[
                  "text-[12px] flex-1",
                  item.completed
                    ? "text-slate-400 dark:text-white/40 line-through"
                    : "text-slate-700 dark:text-white/80",
                ].join(" ")}
              >
                {item.label}
              </span>
              {fromPreview && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] bg-purple-50 dark:bg-purple-500/[0.12] text-purple-700 dark:text-purple-300 text-[10px] font-medium">
                  <Sparkles className="h-2.5 w-2.5" />
                  Piloto
                </span>
              )}
              {item.preview_file_url && (
                <a
                  href={item.preview_file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-brand-500 dark:text-white/55 dark:hover:text-brand-400"
                  title="Baixar arquivo do piloto"
                >
                  <Download className="h-3 w-3" />
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
