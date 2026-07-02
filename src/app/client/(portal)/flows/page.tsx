import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPortalUser } from "@/lib/services/portal-auth.service"
import { buildPortalDashboard } from "@/lib/services/portal-dashboard.service"
import { FlowsClient } from "./flows-client"
import type { DashboardData } from "../dashboard/types"

export default async function PortalFlowsPage() {
  const portalUser = await getPortalUser()
  if (!portalUser) {
    redirect("/client/login")
  }

  const cookieStore = await cookies()
  const storeId = cookieStore.get("portal_active_store")?.value || null

  let initialData: DashboardData | null = null
  try {
    initialData = (await buildPortalDashboard({
      clientId: portalUser.client_id,
      portalUserEmail: portalUser.email,
      period: "30d",
      storeId,
      adminClient: createAdminClient(),
    })) as unknown as DashboardData
  } catch {
    // Sem dados iniciais o client component busca via API (comportamento antigo)
    initialData = null
  }

  return <FlowsClient initialData={initialData} initialStoreId={storeId} />
}
