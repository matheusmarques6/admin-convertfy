import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPortalUser } from "@/lib/services/portal-auth.service"
import { buildPortalIntegrations } from "@/lib/services/portal-integrations.service"
import { IntegrationsClient, type IntegrationsInitialData } from "./integrations-client"

export default async function PortalIntegrationsPage() {
  const portalUser = await getPortalUser()
  if (!portalUser) {
    redirect("/client/login")
  }

  const cookieStore = await cookies()
  const storeId = cookieStore.get("portal_active_store")?.value || null

  let initialData: IntegrationsInitialData | null = null
  if (storeId) {
    try {
      initialData = (await buildPortalIntegrations({
        clientId: portalUser.client_id,
        storeId,
        adminClient: createAdminClient(),
      })) as unknown as IntegrationsInitialData | null
    } catch {
      // Sem dados iniciais o client component busca via API (comportamento antigo)
      initialData = null
    }
  }

  return <IntegrationsClient initialData={initialData} initialStoreId={storeId} />
}
