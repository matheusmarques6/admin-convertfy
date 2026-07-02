import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPortalUser } from "@/lib/services/portal-auth.service"
import { buildPortalTracking } from "@/lib/services/portal-tracking.service"
import { TrackingClient, type TrackingInitialData } from "./tracking-client"

export default async function PortalTrackingPage() {
  const portalUser = await getPortalUser()
  if (!portalUser) {
    redirect("/client/login")
  }

  const cookieStore = await cookies()
  const storeId = cookieStore.get("portal_active_store")?.value || null

  let initialData: TrackingInitialData | null = null
  try {
    initialData = (await buildPortalTracking({
      clientId: portalUser.client_id,
      storeId,
      adminClient: createAdminClient(),
    })) as unknown as TrackingInitialData | null
  } catch {
    // Sem dados iniciais o client component busca via API (comportamento antigo)
    initialData = null
  }

  return <TrackingClient initialData={initialData} initialStoreId={storeId} />
}
