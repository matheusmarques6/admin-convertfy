"use client"

import { useCallback } from "react"
import useSWR from "swr"
import { useToast } from "@/lib/hooks/use-toast"
import type {
  CampaignCycle,
  CampaignSuggestion,
  CampaignTrend,
  EmailDraft,
} from "@/types/campaign-central"

interface CycleResponse {
  success?: boolean
  cycle: CampaignCycle | null
  suggestions: CampaignSuggestion[]
  trends: CampaignTrend[]
  counts: {
    pending: number
    approved: number
    dismissed: number
    dates_upcoming: number
    attention: number
  }
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin" })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
  return json as T
}

export function useCampaignCentral() {
  const { toast } = useToast()

  const { data, error, isLoading, mutate } = useSWR<CycleResponse>(
    "/api/admin/campaign-central/cycle",
    fetcher,
    {
      revalidateOnFocus: false,
      // Polling 5s enquanto o ciclo está gerando
      refreshInterval: (latest) =>
        latest?.cycle?.status === "generating" ? 5000 : 0,
    },
  )

  const cycle = data?.cycle ?? null
  const suggestions = data?.suggestions ?? []
  const trends = data?.trends ?? []
  const counts = data?.counts ?? {
    pending: 0,
    approved: 0,
    dismissed: 0,
    dates_upcoming: 0,
    attention: 0,
  }

  const patchSuggestion = useCallback(
    async (
      id: string,
      body: Record<string, unknown>,
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch(`/api/admin/campaign-central/suggestions/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
        await mutate()
        return { ok: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido"
        toast({ title: "Falha ao atualizar sugestão", description: msg, variant: "destructive" })
        return { ok: false, error: msg }
      }
    },
    [mutate, toast],
  )

  const approve = useCallback(
    (id: string, draft?: EmailDraft) => patchSuggestion(id, { action: "approve", email_draft: draft }),
    [patchSuggestion],
  )
  const dismiss = useCallback((id: string) => patchSuggestion(id, { action: "dismiss" }), [
    patchSuggestion,
  ])
  const undo = useCallback((id: string) => patchSuggestion(id, { action: "undo" }), [
    patchSuggestion,
  ])
  const updateDraft = useCallback(
    (id: string, draft?: EmailDraft, angle?: string) =>
      patchSuggestion(id, { action: "update_draft", email_draft: draft, angle }),
    [patchSuggestion],
  )

  const regenerate = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/admin/campaign-central/cycle/regenerate", {
        method: "POST",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      toast({
        title: "Ciclo re-gerado",
        description: `${json.suggestionsCreated ?? 0} sugestões criadas.`,
      })
      await mutate()
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido"
      toast({ title: "Falha ao re-gerar ciclo", description: msg, variant: "destructive" })
      return false
    }
  }, [mutate, toast])

  return {
    cycle,
    suggestions,
    trends,
    counts,
    isLoading,
    error,
    mutate,
    approve,
    dismiss,
    undo,
    updateDraft,
    regenerate,
  }
}
