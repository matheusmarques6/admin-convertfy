"use client"

import { useCallback } from "react"
import useSWR from "swr"
import { useToast } from "@/lib/hooks/use-toast"
import type { ProductionResponse } from "@/types/campaign-production"

async function fetcher(url: string): Promise<ProductionResponse> {
  const res = await fetch(url, { credentials: "same-origin" })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
  return json as ProductionResponse
}

export function useProduction(enabled: boolean) {
  const { toast } = useToast()

  const { data, error, isLoading, mutate } = useSWR<ProductionResponse>(
    enabled ? "/api/admin/campaign-central/production" : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  const updateStore = useCallback(
    async (
      itemId: string,
      storeId: string,
      patch: { prod_stage?: number; designer_id?: string | null },
    ): Promise<{ ok: boolean }> => {
      try {
        const res = await fetch(`/api/admin/campaign-central/production/${itemId}`, {
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

  return {
    productions: data?.productions ?? [],
    designers: data?.designers ?? [],
    isLoading,
    error,
    mutate,
    updateStore,
  }
}
