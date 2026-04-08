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
        status
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

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const client = await getClient(id)

  if (!client) {
    notFound()
  }

  return (
    <div className="space-y-5">
      {/* Breadcrumbs — resolve Problema #12 */}
      <Breadcrumbs
        items={[
          { label: "Clientes", href: ROUTES.ADMIN.CLIENTS.LIST },
          { label: client.name },
        ]}
      />

      {/* Client Header Card — resolve Problema #11 (Editar em 1 clique) */}
      <ClientHeader client={client} />

      {/* Tabs — DS v3.0 Rule 18 (underline variant) */}
      <ClientDetailTabs client={client} />
    </div>
  )
}
