"use client"

/**
 * Auto-sync silencioso pra pipelines CS canonicos.
 *
 * Detecta o pipeline aberto via /api/crm/pipelines/[id] e, se for
 * "Gestao de Carteira" e estiver vazia (0 deals), dispara
 * /api/admin/cs-carteira/sync-now em background. UI fica IDENTICA a
 * qualquer outro pipeline — sem banners, sem botoes, sem ruido visual.
 *
 * Logica:
 *  - Roda 1x por mount/troca de pipeline
 *  - Pula se nao for um pipeline com auto-sync conhecido
 *  - Pula se ja tem deals (cron diario ja deve ter populado)
 *  - Apos sync, revalida cache SWR pra refletir os novos deals
 *
 * Renderizado no /admin/operacional/pipelines/[id]/page.tsx mas sem
 * output visual (return null).
 */

import { useEffect, useRef } from "react"
import useSWR, { useSWRConfig } from "swr"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface PipelineLite {
  id: string
  name: string
}

interface DealsCount {
  total?: number
  deals?: unknown[]
}

interface Props {
  pipelineId: string
}

const AUTO_SYNC_RULES: Array<{
  pipelineName: string
  endpoint: string
}> = [
  {
    pipelineName: "Gestao de Carteira",
    endpoint: "/api/admin/cs-carteira/sync-now",
  },
]

export function CsPipelineAutoSync({ pipelineId }: Props) {
  const { mutate } = useSWRConfig()

  const { data: pipelineData } = useSWR<{
    pipeline: PipelineLite & DealsCount
    data?: { pipeline: PipelineLite & DealsCount }
  }>(`/api/crm/pipelines/${pipelineId}`, fetcher, {
    revalidateOnFocus: false,
  })

  const pipeline = pipelineData?.data?.pipeline ?? pipelineData?.pipeline
  const pipelineName = pipeline?.name ?? ""
  const dealsArr = pipeline?.deals
  const dealsCount = Array.isArray(dealsArr) ? dealsArr.length : pipeline?.total ?? 0

  // Garante que o auto-sync roda no maximo 1x por (pipelineId, browser tab)
  const syncedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!pipelineName || syncedRef.current.has(pipelineId)) return

    const rule = AUTO_SYNC_RULES.find((r) => r.pipelineName === pipelineName)
    if (!rule) return

    // So roda se pipeline esta vazia (cron de 5h UTC ja popula em prod —
    // o auto-sync e fallback pra primeira vez/demo)
    if (dealsCount > 0) {
      syncedRef.current.add(pipelineId)
      return
    }

    syncedRef.current.add(pipelineId)

    // Fire-and-forget. Apos completar, revalida o pipeline pra mostrar deals.
    void fetch(rule.endpoint, {
      method: "POST",
      credentials: "include",
    })
      .then((r) => r.json())
      .then(() => {
        void mutate(`/api/crm/pipelines/${pipelineId}`)
      })
      .catch(() => {
        /* falha silenciosa — proxima visita ou cron eventualmente popula */
      })
  }, [pipelineId, pipelineName, dealsCount, mutate])

  return null
}
