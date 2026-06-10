"use client"

import { useState } from "react"
import useSWR from "swr"
import { Zap, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { CountryChip } from "./country-chip"
import { SuggestionCard } from "./suggestion-card"
import type { AttentionStore, CampaignSuggestion } from "@/types/campaign-central"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Props {
  suggestions: CampaignSuggestion[]
  onApprove: (id: string) => Promise<{ ok: boolean }>
  onDismiss: (id: string) => Promise<{ ok: boolean }>
  onUndo: (id: string) => Promise<{ ok: boolean }>
  onGenerateCopy: (s: CampaignSuggestion) => void
  onOpen: (s: CampaignSuggestion) => void
}

export function PerformanceTab({
  suggestions,
  onApprove,
  onDismiss,
  onUndo,
  onGenerateCopy,
  onOpen,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)

  const { data, isLoading } = useSWR<{ attention: AttentionStore[] }>(
    "/api/admin/campaign-central/insights",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300_000 },
  )
  const attention = data?.attention ?? []

  const perfSuggestions = suggestions.filter(
    (s) => s.type === "performance" && s.status !== "approved",
  )

  const toneVariant: Record<AttentionStore["tone"], "warning" | "negative" | "info"> = {
    warn: "warning",
    neg: "negative",
    purple: "info",
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
      {/* Tiles das lojas em atenção */}
      {isLoading ? (
        <div className="mb-6 flex items-center justify-center gap-2 rounded-[8px] border border-border bg-card py-8 text-muted-foreground">
          <Loader2 size={15} className="animate-spin" /> Carregando lojas em atenção…
        </div>
      ) : attention.length === 0 ? (
        <div className="mb-6 rounded-[8px] border border-dashed border-border bg-card/50 px-6 py-8 text-center text-[13px] text-muted-foreground">
          Nenhuma loja em atenção no momento. 🎉
        </div>
      ) : (
        <div className="mb-6 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {attention.map((a) => (
            <div
              key={a.store_id}
              className="rounded-[10px] border border-border bg-card px-4 py-4 shadow-sm"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="whitespace-nowrap text-[14px] font-semibold text-foreground">
                  {a.store_name}
                </span>
                <CountryChip code={a.country} size="sm" />
                <div className="min-w-2 flex-1" />
                <Badge variant={toneVariant[a.tone]} showDot>
                  {a.metric}
                </Badge>
              </div>
              <div className="mb-3 text-[12.5px] leading-snug text-muted-foreground">
                {[a.vertical, a.sub].filter(Boolean).join(" · ")}
              </div>
              <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary">
                <Zap size={13} />
                {a.ideas === 0
                  ? "Nenhuma ideia na fila ainda"
                  : a.ideas === 1
                    ? "1 ideia de campanha abaixo"
                    : `${a.ideas} ideias de campanha abaixo`}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cards tipo performance */}
      <div className="mb-3.5 flex items-center gap-2">
        <span className="text-[13px] font-semibold text-foreground/80">
          Ideias geradas pela IA para recuperar performance
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
      {perfSuggestions.length === 0 ? (
        <div className="rounded-[8px] border border-dashed border-border bg-card/50 px-6 py-8 text-center text-[13px] text-muted-foreground">
          Nenhuma sugestão de performance pendente neste ciclo.
        </div>
      ) : (
        <div className="flex max-w-[860px] flex-col gap-3.5">
          {perfSuggestions.map((s) => (
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
    </div>
  )
}
