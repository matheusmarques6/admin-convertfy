import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPortalUser } from "@/lib/services/portal-auth.service"
import { buildPortalInvoices, getPortalInvoicesStatus } from "@/lib/services/portal-invoices.service"
import { InvoicesClient } from "./invoices-client"
import type { InvoicesResponse, InvoiceStatusData } from "./invoices-client"

export default async function PortalInvoicesPage() {
  const portalUser = await getPortalUser()
  if (!portalUser) {
    redirect("/client/login")
  }

  let initialData: InvoicesResponse | null = null
  let initialStatus: InvoiceStatusData | null = null
  try {
    const adminClient = createAdminClient()

    const { data: portalUserRow } = await adminClient
      .from("client_portal_users")
      .select("permissions")
      .eq("id", portalUser.id)
      .eq("is_active", true)
      .single()

    const permissions = portalUserRow?.permissions as { view_invoices?: boolean } | null
    if (permissions?.view_invoices) {
      const [invoicesResult, statusResult] = await Promise.all([
        buildPortalInvoices({
          clientId: portalUser.client_id,
          portalUserId: portalUser.id,
          status: null,
          year: null,
          adminClient,
        }),
        getPortalInvoicesStatus({
          clientId: portalUser.client_id,
          adminClient,
        }),
      ])
      initialData = invoicesResult as unknown as InvoicesResponse
      initialStatus = statusResult as InvoiceStatusData
    }
  } catch {
    // Sem dados iniciais o client component busca via API (comportamento antigo)
    initialData = null
    initialStatus = null
  }

  return <InvoicesClient initialData={initialData} initialStatus={initialStatus} />
}
