import { invokeRouteJson } from "@/lib/api/invoke-route"
import { GET as getProductivity } from "@/app/api/productivity/route"
import { ProductivityPageClient } from "@/components/productivity/productivity-page-client"

export const dynamic = "force-dynamic"

/**
 * RSC casca: pré-carrega o payload de /api/productivity (handler invocado
 * in-process — byte-idêntico ao fetch do client) e hidrata o store zustand
 * no client. Mutations/refreshes continuam batendo na rota normalmente.
 */
export default async function ProductivityHomePage() {
  const initialData = await invokeRouteJson(getProductivity, "/api/productivity")

  return <ProductivityPageClient initialData={initialData} />
}
