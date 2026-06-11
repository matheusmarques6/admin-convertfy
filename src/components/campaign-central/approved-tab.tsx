"use client"

import { useState } from "react"
import { CheckCircle2, Eye, Edit3, Layers } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SuggestionCard } from "./suggestion-card"
import { ApprovedCopiesModal } from "./approved-copies-modal"
import type { CampaignSuggestion, CopyResultEntry } from "@/types/campaign-central"

interface Props {
  suggestions: CampaignSuggestion[]
  onUndo: (id: string) => Promise<{ ok: boolean }>
  onOpen: (s: CampaignSuggestion) => void
  onGenerateCopy: (s: CampaignSuggestion) => void
}

function copyStats(s: CampaignSuggestion): {
  generated: number
  approved: number
  target: number
} {
  const allResults: CopyResultEntry[] = [
    ...Object.values(s.copy_results?.test ?? {}),
    ...Object.values(s.copy_results?.production ?? {}),
  ]
  return {
    generated: allResults.length,
    approved: allResults.filter((c) => c.quality === "good").length,
    target: s.targets.length,
  }
}

export function ApprovedTab({ suggestions, onUndo, onOpen, onGenerateCopy }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copiesModal, setCopiesModal] = useState<CampaignSuggestion | null>(null)

  const approved = suggestions.filter((s) => s.status === "approved")

  if (approved.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[6px] border border-dashed border-border bg-card/50 px-6 py-12 text-center">
        <CheckCircle2 size={28} className="text-muted-foreground/60" />
        <div className="text-[13.5px] font-medium text-muted-foreground">
          Nenhuma campanha aprovada ainda neste ciclo.
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        {approved.map((s) => {
          const stats = copyStats(s)
          const pct = stats.target > 0 ? Math.round((stats.generated / stats.target) * 100) : 0
          return (
            <div key={s.id} className="flex flex-col gap-2.5">
              <SuggestionCard
                suggestion={s}
                busy={busyId === s.id}
                onApprove={() => Promise.resolve({ ok: true })}
                onDismiss={() => Promise.resolve({ ok: true })}
                onUndo={async () => {
                  setBusyId(s.id)
                  try {
                    return await onUndo(s.id)
                  } finally {
                    setBusyId(null)
                  }
                }}
                onGenerateCopy={() => onGenerateCopy(s)}
                onOpen={() => onOpen(s)}
              />
              {/* Painel de copies */}
              <div className="rounded-[6px] border border-border bg-card px-3.5 py-2.5">
                <div className="mb-1.5 flex items-center gap-2">
                  <Layers size={13} className="text-primary" />
                  <span className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Copies por loja
                  </span>
                </div>
                <div className="mb-2 flex items-center gap-2 text-[12px]">
                  <span className="font-semibold tabular-nums text-foreground">
                    {stats.generated} de {stats.target}
                  </span>
                  <span className="text-muted-foreground">geradas</span>
                  {stats.approved > 0 && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <Badge variant="positive">{stats.approved} aprovadas</Badge>
                    </>
                  )}
                </div>
                <div className="mb-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full transition-all ${
                      pct === 100 ? "bg-emerald-500" : "bg-primary"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCopiesModal(s)}
                    disabled={stats.generated === 0}
                  >
                    <Eye size={13} className="mr-1" /> Ver copies
                  </Button>
                  <div className="flex-1" />
                  <Button variant="secondary" size="sm" onClick={() => onGenerateCopy(s)}>
                    <Edit3 size={13} className="mr-1" />
                    {stats.generated === 0 ? "Gerar copies" : "Continuar"}
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {copiesModal && (
        <ApprovedCopiesModal
          suggestion={copiesModal}
          onClose={() => setCopiesModal(null)}
          onContinueGenerating={() => {
            const s = copiesModal
            setCopiesModal(null)
            onGenerateCopy(s)
          }}
        />
      )}
    </>
  )
}
