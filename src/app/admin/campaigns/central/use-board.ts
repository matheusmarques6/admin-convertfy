"use client"

import { useCallback } from "react"
import useSWR from "swr"
import { useToast } from "@/lib/hooks/use-toast"
import type { BoardCard, BoardColumnKey, BoardResponse } from "@/types/campaign-board"
import type { CampaignSuggestion } from "@/types/campaign-central"

async function fetcher(url: string): Promise<BoardResponse> {
  const res = await fetch(url, { credentials: "same-origin" })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
  return json as BoardResponse
}

export interface UseBoard {
  cards: BoardCard[]
  designers: BoardResponse["designers"]
  isLoading: boolean
  error: unknown
  mutate: () => Promise<unknown>
  /** Move um card pra coluna `to` com optimistic update + rollback. */
  moveCard: (cardId: string, to: BoardColumnKey) => Promise<{ ok: boolean }>
  /** Atualiza estágio/designer de UMA loja (DesignerModal aberto do card). */
  updateStore: (
    pipelineItemId: string,
    storeId: string,
    patch: { prod_stage?: number; designer_id?: string | null },
  ) => Promise<{ ok: boolean }>
  /** Busca a CampaignSuggestion completa pra abrir CopyPanel/DetailModal. */
  fetchSuggestion: (suggestionId: string) => Promise<CampaignSuggestion | null>
  /** Garante uma suggestion 'suggested' atrelada a um pipeline_item (reopen). */
  reopenForCopy: (pipelineItemId: string) => Promise<CampaignSuggestion | null>
}

export function useBoard(enabled = true): UseBoard {
  const { toast } = useToast()

  const { data, error, isLoading, mutate } = useSWR<BoardResponse>(
    enabled ? "/api/admin/campaign-central/board" : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  const cards = data?.cards ?? []
  const designers = data?.designers ?? []

  const moveCard = useCallback(
    async (cardId: string, to: BoardColumnKey): Promise<{ ok: boolean }> => {
      // Optimistic: move o card pra coluna de destino na lista local. O server
      // é autoritativo — a revalidação re-deriva a coluna identicamente
      // (board-mapping é a mesma fonte da verdade nos dois lados).
      let prevColumn: BoardColumnKey | null = null
      await mutate(
        (current) => {
          if (!current) return current
          return {
            ...current,
            cards: current.cards.map((c) => {
              if (c.id !== cardId) return c
              prevColumn = c.column
              return { ...c, column: to }
            }),
          }
        },
        { revalidate: false },
      )

      try {
        const res = await fetch(
          `/api/admin/campaign-central/board/${encodeURIComponent(cardId)}/move`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to }),
          },
        )
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
        // Revalida pra refletir o estado real (prod_stage por loja etc.).
        await mutate()
        return { ok: true }
      } catch (err) {
        // Rollback otimista + revalida pra garantir consistência.
        if (prevColumn) {
          await mutate(
            (current) =>
              current
                ? {
                    ...current,
                    cards: current.cards.map((c) =>
                      c.id === cardId ? { ...c, column: prevColumn as BoardColumnKey } : c,
                    ),
                  }
                : current,
            { revalidate: false },
          )
        }
        await mutate()
        const msg = err instanceof Error ? err.message : "Erro desconhecido"
        toast({ title: "Não foi possível mover o card", description: msg, variant: "destructive" })
        return { ok: false }
      }
    },
    [mutate, toast],
  )

  const updateStore = useCallback(
    async (
      pipelineItemId: string,
      storeId: string,
      patch: { prod_stage?: number; designer_id?: string | null },
    ): Promise<{ ok: boolean }> => {
      try {
        const res = await fetch(`/api/admin/campaign-central/production/${pipelineItemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ store_id: storeId, ...patch }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
        await mutate()
        return { ok: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido"
        toast({ title: "Falha ao atualizar produção", description: msg, variant: "destructive" })
        return { ok: false }
      }
    },
    [mutate, toast],
  )

  const fetchSuggestion = useCallback(
    async (suggestionId: string): Promise<CampaignSuggestion | null> => {
      try {
        const res = await fetch(
          `/api/admin/campaign-central/suggestions/${suggestionId}`,
          { credentials: "same-origin" },
        )
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
        return (json.suggestion ?? null) as CampaignSuggestion | null
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido"
        toast({ title: "Falha ao abrir campanha", description: msg, variant: "destructive" })
        return null
      }
    },
    [toast],
  )

  const reopenForCopy = useCallback(
    async (pipelineItemId: string): Promise<CampaignSuggestion | null> => {
      try {
        const res = await fetch(
          `/api/admin/campaign-central/production/${pipelineItemId}/reopen`,
          { method: "POST" },
        )
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
        await mutate()
        return (json.suggestion ?? null) as CampaignSuggestion | null
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido"
        toast({ title: "Falha ao abrir copy", description: msg, variant: "destructive" })
        return null
      }
    },
    [mutate, toast],
  )

  return {
    cards,
    designers,
    isLoading,
    error,
    mutate,
    moveCard,
    updateStore,
    fetchSuggestion,
    reopenForCopy,
  }
}
