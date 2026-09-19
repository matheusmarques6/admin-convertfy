import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPortalUser } from "@/lib/services/portal-auth.service"
import { buildPortalSettings } from "@/lib/services/portal-settings.service"
import { SettingsClient, type SettingsInitialData } from "./settings-client"

export default async function PortalSettingsPage() {
  const portalUser = await getPortalUser()
  if (!portalUser) {
    redirect("/client/login")
  }

  let initialData: SettingsInitialData | null = null
  try {
    initialData = (await buildPortalSettings(
      { portalUserId: portalUser.id },
      createAdminClient()
    )) as unknown as SettingsInitialData | null
  } catch {
    // Sem dados iniciais o client component busca via API (comportamento antigo)
    initialData = null
  }

  return <SettingsClient initialData={initialData} />
}
