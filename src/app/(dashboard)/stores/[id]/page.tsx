import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { StoreDetailTabs } from "@/components/stores/store-detail-tabs"

export const dynamic = "force-dynamic"

async function getStore(id: string) {
  const supabase = await createClient()

  const { data: store, error } = await supabase
    .from("client_stores")
    .select(`
      id,
      store_name,
      store_url,
      platform,
      is_active,
      niche,
      country,
      language,
      integration_status,
      created_at,
      updated_at,
      client_id,
      clients (
        id,
        name
      )
    `)
    .eq("id", id)
    .single()

  if (error || !store) {
    return null
  }

  return store
}

export default async function StoreDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const store = await getStore(id)

  if (!store) {
    notFound()
  }

  const integrationStatus = (store.integration_status as Record<string, { connected: boolean }>) || {}
  const connectedCount = Object.values(integrationStatus).filter(s => s?.connected).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/stores">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{store.store_name}</h1>
              <Badge variant={store.is_active ? "success" : "secondary"}>
                {store.is_active ? "Ativa" : "Inativa"}
              </Badge>
              {store.platform && (
                <Badge variant="outline">{store.platform}</Badge>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
              {store.store_url && <span>{store.store_url}</span>}
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(store.clients as any)?.name && (
                <Link
                  href={`/clients/${store.client_id}`}
                  className="text-primary hover:underline"
                >
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  Cliente: {(store.clients as any).name}
                </Link>
              )}
              <span>{connectedCount} integração(ões) conectada(s)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <StoreDetailTabs
        storeId={store.id}
        storeName={store.store_name}
        storeUrl={store.store_url}
        platform={store.platform}
        niche={store.niche}
        country={store.country}
        language={store.language}
        integrationStatus={integrationStatus}
        clientId={store.client_id}
      />
    </div>
  )
}
