"use client"

/**
 * Aba Performance — KPIs internos, tabelas de campanhas e flows.
 *
 * Reusa o hook useStorePerformance + StorePerformanceKPIs +
 * StorePerformanceTables que ja consomem Klaviyo (e Omnisend quando
 * conectado) via /api/email-platform/* endpoints.
 *
 * O detalhe importante: precisamos saber se a loja tem email platform
 * conectado pra o hook nao bater nos endpoints quando nao ha credencial.
 */

import useSWR from "swr"
import { Loader2 } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { StorePerformanceContext, useStorePerformance } from "@/lib/hooks/use-store-performance"
import { StorePerformanceKPIs } from "@/components/stores/store-performance-kpis"
import { StorePerformanceTables } from "@/components/stores/store-performance-tables"

interface IntegrationStatus {
  connected: boolean
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function TabPerformance({ storeId }: { storeId: string }) {
  // Resolve email platform connection antes de ativar os hooks de dados.
  // Sem isso, useStorePerformance bate em endpoints que retornam 400/404
  // quando a loja nao tem klaviyo/omnisend configurado.
  const { data: credData, isLoading: credLoading } = useSWR(
    `/api/client-stores/credentials?store_id=${storeId}`,
    fetcher,
    { revalidateOnFocus: false },
  )

  const status = (credData?.status ?? {}) as Record<string, IntegrationStatus>
  const klaviyoConnected = !!status.klaviyo?.connected
  const omnisendConnected = !!status.omnisend?.connected
  const emailPlatformConnected = klaviyoConnected || omnisendConnected

  const performance = useStorePerformance(storeId, emailPlatformConnected)

  if (credLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Icon icon={Loader2} customSize={32} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!emailPlatformConnected) {
    return (
      <div className="bg-white border rounded-[10px] p-8 text-center" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
        <h3 className="text-[14px] font-bold text-slate-900 mb-2">Sem plataforma de email conectada</h3>
        <p className="text-[12px] text-slate-500 mb-4">
          Conecte Klaviyo ou Omnisend na aba <strong>Setup</strong> pra ver os dados de performance.
        </p>
      </div>
    )
  }

  return (
    <StorePerformanceContext.Provider value={performance}>
      <div className="flex flex-col gap-4">
        <StorePerformanceKPIs />
        <StorePerformanceTables />
      </div>
    </StorePerformanceContext.Provider>
  )
}
