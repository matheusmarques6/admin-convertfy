import { invokeRouteJson } from "@/lib/api/invoke-route"
import { GET as getSalesDashboard } from "@/app/api/crm/dashboard/sales/route"
import { SalesDashboardClient, type DashboardData } from "./sales-dashboard-client"

export const dynamic = "force-dynamic"

/**
 * RSC casca: pré-carrega o MESMO payload da rota /api/crm/dashboard/sales
 * (invocada in-process) e entrega como initialData — os dados chegam no HTML
 * da primeira resposta em vez de esperar hidratação → fetch. Falha no
 * prefetch → null → o client busca como antes. Refreshes (troca de janela)
 * continuam batendo na rota normalmente.
 */
export default async function SalesDashboardPage() {
  const initialData = await invokeRouteJson(
    getSalesDashboard,
    "/api/crm/dashboard/sales?days=30",
  )

  return <SalesDashboardClient initialData={initialData as DashboardData | null} />
}
