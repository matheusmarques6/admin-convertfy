import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Breadcrumbs } from "@/components/ui/breadcrumbs"
import { ClientHeader } from "@/components/clients/client-header"
import { ClientDetailTabs } from "@/components/clients/client-detail-tabs"
import { ROUTES } from "@/lib/routes"

export const dynamic = "force-dynamic"

async function getClient(id: string) {
  const supabase = await createClient()

  const { data: client, error } = await supabase
    .from("clients")
    .select(`
      *,
      owner:profiles!clients_owner_id_fkey (
        id,
        name,
        email,
        avatar_url
      ),
      contracts (
        id,
        plan_name,
        monthly_value,
        status,
        start_date,
        end_date
      ),
      client_stores (
        id,
        store_name,
        platform,
        is_active
      )
    `)
    .eq("id", id)
    .single()

  if (error || !client) {
    return null
  }

  return client
}

async function getClientLtv(clientId: string): Promise<number> {
  const supabase = await createClient()

  // LTV = soma de tudo já pago (unified_invoices + client_charges com status paid)
  const [invoicesRes, chargesRes] = await Promise.all([
    supabase
      .from("unified_invoices")
      .select("amount")
      .eq("client_id", clientId)
      .eq("status", "paid"),
    supabase
      .from("client_charges")
      .select("value")
      .eq("client_id", clientId)
      .eq("status", "paid"),
  ])

  const invoicesTotal =
    invoicesRes.data?.reduce((sum, i) => sum + Number(i.amount ?? 0), 0) ?? 0
  const chargesTotal =
    chargesRes.data?.reduce((sum, c) => sum + Number(c.value ?? 0), 0) ?? 0

  return invoicesTotal + chargesTotal
}

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [client, ltv] = await Promise.all([getClient(id), getClientLtv(id)])

  if (!client) {
    notFound()
  }

  return (
    <div className="space-y-5">
      <Breadcrumbs
        items={[
          { label: "Clientes", href: ROUTES.ADMIN.CLIENTS.LIST },
          { label: client.name },
        ]}
      />

      <ClientHeader client={client} ltv={ltv} />

      <ClientDetailTabs client={client} ltv={ltv} />
    </div>
  )
}
