"use client"

import useSWR from "swr"
import type {
  AutomationIntegration,
  CampaignAutomationRun,
} from "@/types/campaign-automation"

export interface AutomationsResponse {
  runs: CampaignAutomationRun[]
  counts: Record<AutomationIntegration, number>
  count: number
}

async function fetcher(url: string): Promise<AutomationsResponse> {
  const res = await fetch(url, { credentials: "same-origin" })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
  return json as AutomationsResponse
}

export interface UseAutomations {
  runs: CampaignAutomationRun[]
  counts: Record<AutomationIntegration, number>
  count: number
  isLoading: boolean
  error: unknown
  mutate: () => Promise<unknown>
}

const EMPTY_COUNTS: Record<AutomationIntegration, number> = {
  clickup: 0,
  slack: 0,
  omnisend: 0,
  ga: 0,
  internal: 0,
}

export function useAutomations(enabled = true): UseAutomations {
  const { data, error, isLoading, mutate } = useSWR<AutomationsResponse>(
    enabled ? "/api/admin/campaign-central/automations" : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  return {
    runs: data?.runs ?? [],
    counts: data?.counts ?? EMPTY_COUNTS,
    count: data?.count ?? 0,
    isLoading,
    error,
    mutate,
  }
}
