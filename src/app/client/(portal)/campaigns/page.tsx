import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPortalUser } from "@/lib/services/portal-auth.service"
import { resolvePortalClientByClientId } from "@/lib/api/portal-auth"
import { getPortalCampaigns } from "@/lib/services/portal-campaigns.service"
import { CampaignsClient } from "./campaigns-client"
import type { PortalCampaignApiResponse } from "@/types/campaign"

export default async function PortalCampaignsPage() {
  const portalUser = await getPortalUser()
  if (!portalUser) {
    redirect("/client/login")
  }

  // Mesmo mês corrente que o hook usa no client (timezone do dashboard)
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  )
  const month = now.getMonth()
  const year = now.getFullYear()
  const lastDay = new Date(year, month + 1, 0).getDate()
  const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`
  const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`

  let initialCampaigns: PortalCampaignApiResponse[] | null = null
  let initialTotalCount = 0
  try {
    const adminClient = createAdminClient()
    const ctx = await resolvePortalClientByClientId(adminClient, portalUser.client_id)
    const result = await getPortalCampaigns({
      ctx,
      startDate,
      endDate,
      status: null,
      storeId: null,
      channel: null,
      limit: 500,
      offset: 0,
      adminClient,
    })
    initialCampaigns = result.campaigns as unknown as PortalCampaignApiResponse[]
    initialTotalCount = result.totalCount
  } catch {
    // Sem dados iniciais o client component busca via API (comportamento antigo)
    initialCampaigns = null
  }

  return (
    <CampaignsClient
      initialCampaigns={initialCampaigns}
      initialTotalCount={initialTotalCount}
      initialMonth={month}
      initialYear={year}
    />
  )
}
