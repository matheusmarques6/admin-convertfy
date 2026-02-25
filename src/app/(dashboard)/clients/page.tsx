import { Suspense } from "react"
import Link from "next/link"
import { Plus } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { ClientsTable } from "@/components/clients/clients-table"
import { ClientsFilters } from "@/components/clients/clients-filters"
import { ImportAsaasButton } from "@/components/clients/import-asaas-button"
import { Skeleton } from "@/components/ui/skeleton"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"

export const dynamic = "force-dynamic"

async function getClients() {
  const supabase = await createClient()

  const { data: clients, error } = await supabase
    .from("clients")
    .select(`
      *,
      contracts (
        id,
        plan_name,
        monthly_value,
        status
      ),
      owner:profiles!clients_owner_id_fkey (
        id,
        name,
        avatar_url
      ),
      client_stores (
        id,
        store_name,
        platform,
        is_active
      )
    `)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching clients:", error)
    return []
  }

  return clients || []
}

function TableSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[400px] w-full" />
    </div>
  )
}

export default async function ClientsPage() {
  const clients = await getClients()

  return (
    <PagePermissionWrapper requiredFeatures={["create_clients"]}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">
          Gerencie sua carteira de clientes
        </p>
        <div className="flex items-center gap-2">
          <ImportAsaasButton />
          <Button asChild>
            <Link href="/clients/new">
              <Plus className="mr-2 h-4 w-4" />
              Novo Cliente
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <ClientsFilters />

      {/* Table */}
      <Suspense fallback={<TableSkeleton />}>
        <ClientsTable clients={clients} />
      </Suspense>
    </div>
    </PagePermissionWrapper>
  )
}
