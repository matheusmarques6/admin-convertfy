import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/server"
import { getStoreIntegrationStatus } from "@/lib/services/credentials.service"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { StoreDetailTabs } from "@/components/stores/store-detail-tabs"
import { StoreLinkBadge } from "@/components/stores/store-link-badge"
import { StoreLinkActions } from "@/components/stores/store-link-actions"

export const dynamic = "force-dynamic"

async function getStore(id: string) {
  const adminClient = createAdminClient()

  // Use admin client to bypass RLS — admin/agent users may not have RLS access to client_stores
  const { data: store, error } = await adminClient
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
      created_at,
      updated_at,
      client_id,
      org_id,
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

  // Get integration status from centralized service (infers from credentials if field is null)
  let integrationStatus: Record<string, { connected: boolean; connected_at?: string }> = {}
  try {
    const status = await getStoreIntegrationStatus(id)
    // Convert typed IntegrationStatus to Record for the component
    integrationStatus = Object.fromEntries(
      Object.entries(status).filter(([, v]) => v !== undefined)
    ) as Record<string, { connected: boolean; connected_at?: string }>
  } catch {
    // If store not found in service, leave empty
  }

  // Fetch extra onboarding data
  const { data: onboardingData } = await adminClient
    .from("store_onboarding_data")
    .select("is_complete, filled_at")
    .eq("store_id", id)
    .single()

  const { data: onboarding } = await adminClient
    .from("client_onboardings")
    .select("status, progress_percent")
    .eq("store_id", id)
    .in("status", ["not_started", "in_progress", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  const { data: briefing } = await adminClient
    .from("store_briefings")
    .select("id")
    .eq("store_id", id)
    .eq("status", "current")
    .limit(1)
    .single()

  return {
    ...store,
    integrationStatus,
    onboarding_form_complete: onboardingData?.is_complete || false,
    onboarding_status: onboarding?.status || null,
    onboarding_progress: onboarding?.progress_percent || 0,
    has_briefing: !!briefing,
  }
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

  const integrationStatus = store.integrationStatus
  const connectedCount = Object.values(integrationStatus).filter(s => s?.connected).length
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientName = (store.clients as any)?.name || null

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
              {store.client_id && (store.clients as any)?.name ? (
                <Link
                  href={`/clients/${store.client_id}`}
                  className="text-primary hover:underline"
                >
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  Cliente: {(store.clients as any).name}
                </Link>
              ) : (
                <span>Loja Avulsa — Sem cliente vinculado</span>
              )}
              <StoreLinkBadge
                clientId={store.client_id}
                clientName={clientName}
              />
              <span>{connectedCount} integração(ões) conectada(s)</span>
            </div>
          </div>
        </div>
        <StoreLinkActions
          storeId={store.id}
          storeName={store.store_name}
          orgId={store.org_id || ""}
          clientId={store.client_id}
          clientName={clientName}
        />
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
        onboardingFormComplete={store.onboarding_form_complete}
        onboardingStatus={store.onboarding_status}
        onboardingProgress={store.onboarding_progress}
        hasBriefing={store.has_briefing}
      />
    </div>
  )
}
