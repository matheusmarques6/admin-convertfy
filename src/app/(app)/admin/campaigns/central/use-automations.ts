"use client"

import useSWR from "swr"
import type { CampaignAutomationRunView } from "@/types/campaign-automation"

export interface AutomationsResponse {
  runs: CampaignAutomationRunView[]
  count: number
}

async function fetcher(url: string): Promise<AutomationsResponse> {
  const res = await fetch(url, { credentials: "same-origin" })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
  return json as AutomationsResponse
}

export interface UseAutomations {
  runs: CampaignAutomationRunView[]
  count: number
  isLoading: boolean
  error: unknown
  mutate: () => Promise<unknown>
}

export function useAutomations(enabled = true): UseAutomations {
  const { data, error, isLoading, mutate } = useSWR<AutomationsResponse>(
    enabled ? "/api/admin/campaign-central/automations" : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  return {
    runs: data?.runs ?? [],
    count: data?.count ?? 0,
    isLoading,
    error,
    mutate,
  }
}
