import { notFound } from "next/navigation"
import Link from "next/link"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { getStoreIntegrationStatus } from "@/lib/services/credentials.service"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/ui/page-header"
import { ROUTES } from "@/lib/routes"
import { StoreDetailTabs } from "@/components/stores/store-detail-tabs"
import { StoreDeleteAction } from "@/components/stores/store-delete-action"

export const dynamic = "force-dynamic"

async function getStore(id: string) {
  let adminClient
  try {
    adminClient = createAdminClient()
  } catch (err) {
    // SERVICE_ROLE_KEY missing — this is a server configuration error, not a data issue
    console.error("[StoreDetail] CRITICAL: createAdminClient() failed. Check SUPABASE_SERVICE_ROLE_KEY env var.", err)
    throw new Error("Erro de configuração do servidor. Verifique as variáveis de ambiente.")
  }

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
      client_id,
      org_id,
      clients (
        id,
        name
      )
    `)
    .eq("id", id)
    .single()

  if (error) {
    console.error("[StoreDetail] Error fetching store:", { message: error.message, code: error.code, details: error.details, hint: error.hint })
    return null
  }

  if (!store) {
    return null
  }

  // Get integration status from centralized service (uses real validation fields)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let integrationStatus: Record<string, any> = {}
  try {
    const status = await getStoreIntegrationStatus(id)
    // Convert typed IntegrationStatus to Record for the component
    integrationStatus = Object.fromEntries(
      Object.entries(status).filter(([, v]) => v !== undefined)
    )
  } catch (err) {
    console.error("[StoreDetail] Error fetching integration status (non-critical):", err)
  }

  // Fetch extra onboarding data — Supabase queries return {data, error}, they don't throw
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

  const { data: driveData } = await adminClient
    .from("client_onboardings")
    .select("drive_folder_url")
    .eq("store_id", id)
    .not("drive_folder_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    ...store,
    integrationStatus,
    onboarding_form_complete: onboardingData?.is_complete || false,
    onboarding_status: onboarding?.status || null,
    onboarding_progress: onboarding?.progress_percent || 0,
    has_briefing: !!briefing,
    drive_folder_url: driveData?.drive_folder_url || null,
  }
}

export default async function StoreDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Validate user has access to this store's org
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const store = await getStore(id)
  if (!store) notFound()

  // Multi-tenant isolation: verify store belongs to user's org
  if (store.org_id) {
    const userOrgId = await resolveOrgId(user.id)
    if (store.org_id !== userOrgId) {
      notFound()
    }
  }

  const integrationStatus = store.integrationStatus
  const connectedCount = Object.values(integrationStatus).filter(s => s?.connected).length
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientName = (store.clients as any)?.name || null

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={store.store_name}
        breadcrumb={[
          { label: "Lojas", href: ROUTES.ADMIN.STORES.LIST },
          { label: store.store_name },
        ]}
        actions={
          <StoreDeleteAction
            storeId={store.id}
            storeName={store.store_name}
          />
        }
      />

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={store.is_active ? "success" : "secondary"}>
          {store.is_active ? "Ativa" : "Inativa"}
        </Badge>
        {store.platform && (
          <Badge variant="outline">{store.platform}</Badge>
        )}
        <span className="text-sm text-muted-foreground">{connectedCount} integração(ões) conectada(s)</span>
      </div>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4 text-sm text-muted-foreground">
        {store.store_url && <span className="truncate">{store.store_url}</span>}
        {store.client_id && clientName && (
          <Link
            href={`/admin/clients/${store.client_id}`}
            className="text-primary hover:underline"
          >
            Cliente: {clientName}
          </Link>
        )}
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
        driveFolderUrl={store.drive_folder_url}
        currency={undefined}
      />
    </div>
  )
}
