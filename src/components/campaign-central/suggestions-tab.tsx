"use client"

import { useState } from "react"
import { Sparkles } from "lucide-react"
import { Loader2 } from "lucide-react"
import { SuggestionCard } from "./suggestion-card"
import type { CampaignSuggestion } from "@/types/campaign-central"

interface Props {
  suggestions: CampaignSuggestion[]
  onApprove: (id: string) => Promise<{ ok: boolean }>
  onDismiss: (id: string) => Promise<{ ok: boolean }>
  onUndo: (id: string) => Promise<{ ok: boolean }>
  onGenerateCopy: (s: CampaignSuggestion) => void
  onOpen: (s: CampaignSuggestion) => void
}

const FILTERS = [
  { key: "todas", label: "Todas" },
  { key: "data", label: "Datas" },
  { key: "tema", label: "Tendências" },
  { key: "email", label: "Emails campeões" },
  { key: "performance", label: "Performance" },
] as const

type FilterKey = (typeof FILTERS)[number]["key"]

export function SuggestionsTab({
  suggestions,
  onApprove,
  onDismiss,
  onUndo,
  onGenerateCopy,
  onOpen,
}: Props) {
  const [filter, setFilter] = useState<FilterKey>("todas")
  const [busyId, setBusyId] = useState<string | null>(null)

  const pending = suggestions.filter((s) => s.status === "suggested" || s.status === "dismissed")
  const filtered =
    filter === "todas" ? pending : pending.filter((s) => s.type === filter)

  const counts: Record<FilterKey, number> = {
    todas: pending.filter((s) => s.status === "suggested").length,
    data: 0,
    tema: 0,
    email: 0,
    performance: 0,
  }
  for (const s of pending) {
    if (s.status !== "suggested") continue
    if (s.type === "data") counts.data++
    else if (s.type === "tema") counts.tema++
    else if (s.type === "email") counts.email++
    else if (s.type === "performance") counts.performance++
  }

  const wrap = async (id: string, fn: () => Promise<{ ok: boolean }>) => {
    setBusyId(id)
    try {
      await fn()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => {
          const on = filter === f.key
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                on
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/30"
              }`}
            >
              {f.label}
              <span
                className={`inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-bold tabular-nums ${
                  on ? "bg-white/20 text-background" : "bg-muted text-muted-foreground"
                }`}
              >
                {counts[f.key]}
              </span>
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[6px] border border-dashed border-border bg-card/50 px-6 py-12 text-center">
          <Sparkles size={28} className="text-muted-foreground/60" />
          <div className="text-[13.5px] font-medium text-muted-foreground">
            Nenhuma sugestão pendente nesta categoria.
          </div>
        </div>
      ) : (
        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              busy={busyId === s.id}
              onApprove={() => wrap(s.id, () => onApprove(s.id))}
              onDismiss={() => wrap(s.id, () => onDismiss(s.id))}
              onUndo={() => wrap(s.id, () => onUndo(s.id))}
              onGenerateCopy={() => onGenerateCopy(s)}
              onOpen={() => onOpen(s)}
            />
          ))}
        </div>
      )}
      {busyId && (
        <div className="pointer-events-none fixed bottom-6 right-6 inline-flex items-center gap-2 rounded-md bg-foreground/90 px-3 py-1.5 text-[12px] text-background">
          <Loader2 size={14} className="animate-spin" /> processando…
        </div>
      )}
    </div>
  )
}
