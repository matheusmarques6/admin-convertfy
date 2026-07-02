import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPortalUser } from "@/lib/services/portal-auth.service"
import { listPortalStores } from "@/lib/services/portal-stores.service"
import { StoresClient, type StoreData } from "./stores-client"

export default async function PortalStoresPage() {
  const portalUser = await getPortalUser()
  if (!portalUser) {
    redirect("/client/login")
  }

  const adminClient = createAdminClient()

  let initialData: StoreData[] | null = null
  try {
    const { data: permissionsRow } = await adminClient
      .from("client_portal_users")
      .select("permissions")
      .eq("id", portalUser.id)
      .single()

    const permissions = permissionsRow?.permissions as { view_reports?: boolean } | null
    if (permissions?.view_reports) {
      initialData = await listPortalStores(portalUser.client_id, adminClient)
    }
  } catch {
    // Sem dados iniciais o client component busca via API (comportamento antigo)
    initialData = null
  }

  return <StoresClient initialData={initialData} />
}
