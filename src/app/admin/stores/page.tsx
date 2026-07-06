import { Metadata } from "next"
import { Store } from "lucide-react"
import {
  StoresPageTabs,
  type StoresPageTabsProps,
} from "@/components/stores/stores-page-tabs"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
import { PageHeader } from "@/components/ui/page-header"
import { invokeRouteJson } from "@/lib/api/invoke-route"
import { GET as getStoresControl } from "@/app/api/stores/control/route"
import { GET as getAlertsSummary } from "@/app/api/stores/alerts/summary/route"

export const metadata: Metadata = {
  title: "Lojas | Convertfy Admin",
  description: "Gerencie as lojas dos clientes, integrações e alertas",
}

export const dynamic = "force-dynamic"

/** Prefetch com teto de tempo: /api/stores/control tem live-fallback de
 * revenue (fetch externo Klaviyo) que pode segurar o TTFB — acima do teto,
 * devolve null e o client busca como antes. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

export default async function StoresControlPage() {
  const [initialStores, initialAlertsSummary] = await Promise.all([
    withTimeout(
      invokeRouteJson(getStoresControl, "/api/stores/control?page=1&per_page=15"),
      3_000,
    ),
    withTimeout(invokeRouteJson(getAlertsSummary, "/api/stores/alerts/summary"), 3_000),
  ])

  return (
    <PagePermissionWrapper requiresStoreAccess>
      <div className="flex-1 space-y-6">
        <PageHeader
          icon={Store}
          title="Lojas"
          description="Gerencie lojas, integrações e acompanhe métricas"
        />

        <StoresPageTabs
          initialStores={initialStores as StoresPageTabsProps["initialStores"]}
          initialAlertsSummary={
            initialAlertsSummary as StoresPageTabsProps["initialAlertsSummary"]
          }
        />
      </div>
    </PagePermissionWrapper>
  )
}
