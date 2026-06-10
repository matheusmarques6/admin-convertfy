"use client"

import { useState } from "react"
import { CheckCircle2 } from "lucide-react"
import { SuggestionCard } from "./suggestion-card"
import type { CampaignSuggestion } from "@/types/campaign-central"

interface Props {
  suggestions: CampaignSuggestion[]
  onUndo: (id: string) => Promise<{ ok: boolean }>
  onOpen: (s: CampaignSuggestion) => void
  onGenerateCopy: (s: CampaignSuggestion) => void
}

export function ApprovedTab({ suggestions, onUndo, onOpen, onGenerateCopy }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
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
    <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
      {approved.map((s) => (
        <SuggestionCard
          key={s.id}
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
      ))}
    </div>
  )
}
