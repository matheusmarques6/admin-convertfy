import { notFound } from "next/navigation"
import Link from "next/link"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { getStoreIntegrationStatus } from "@/lib/services/credentials.service"
import { StatusBadge } from "@/components/ui/status-badge"
import { PageHeader } from "@/components/ui/page-header"
import { BrandIcon } from "@/components/ui/icon"
import { ROUTES } from "@/lib/routes"
import { StoreDetailTabs } from "@/components/stores/store-detail-tabs"
import { StoreDeleteAction } from "@/components/stores/store-delete-action"
import { ExternalLink } from "lucide-react"

export const dynamic = "force-dynamic"

async function getStore(id: string) {
  let adminClient: ReturnType<typeof createAdminClient>
  try {
    adminClient = createAdminClient()
  } catch (err) {
    console.error("[StoreDetail] CRITICAL: createAdminClient() failed. Check SUPABASE_SERVICE_ROLE_KEY env var.", err)
    throw new Error("Erro de configuração do servidor. Verifique as variáveis de ambiente.")
  }

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
    integrationStatus = Object.fromEntries(
      Object.entries(status).filter(([, v]) => v !== undefined)
    )
  } catch (err) {
    console.error("[StoreDetail] Error fetching integration status (non-critical):", err)
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

  const { data: driveData } = await adminClient
    .from("client_onboardings")
    .select("drive_folder_url")
    .eq("store_id", id)
    .not("drive_folder_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  // Fetch revenue summary for KPIs (header da loja).
  // Inclui colunas omnisend_* com SELECT resiliente: se a migration 20260417
  // nao foi aplicada, faz retry sem essas colunas.
  async function fetchRevenueSummary(withOmnisend: boolean) {
    const cols = withOmnisend
      ? "klaviyo_total_revenue, klaviyo_campaign_revenue, klaviyo_flow_revenue, omnisend_total_revenue, store_total_revenue, store_orders, total_leads, engaged_leads, engagement_rate, currency, sync_status"
      : "klaviyo_total_revenue, klaviyo_campaign_revenue, klaviyo_flow_revenue, store_total_revenue, store_orders, total_leads, engaged_leads, engagement_rate, currency, sync_status"
    return adminClient
      .from("store_revenue_summary")
      .select(cols)
      .eq("store_id", id)
      .eq("period_label", "30d")
      .maybeSingle()
  }
  let revSumRes = await fetchRevenueSummary(true)
  if (revSumRes.error && /omnisend_/.test(revSumRes.error.message || "")) {
    revSumRes = await fetchRevenueSummary(false)
  }
  const revenueSummary = revSumRes.data

  return {
    ...store,
    integrationStatus,
    onboarding_form_complete: onboardingData?.is_complete || false,
    onboarding_status: onboarding?.status || null,
    onboarding_progress: onboarding?.progress_percent || 0,
    has_briefing: !!briefing,
    drive_folder_url: driveData?.drive_folder_url || null,
    revenueSummary,
  }
}

function getPlatformIcon(platform: string | null) {
  if (platform?.toLowerCase() === "shopify") return "/images/integrations/shopify.svg"
  return null
}

export default async function StoreDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const store = await getStore(id)
  if (!store) notFound()

  // Multi-tenant isolation
  if (store.org_id) {
    const userOrgId = await resolveOrgId(user.id)
    if (store.org_id !== userOrgId) {
      notFound()
    }
  }

  const integrationStatus = store.integrationStatus
  const _connectedCount = Object.values(integrationStatus).filter((s: unknown) => (s as Record<string, unknown>)?.connected).length
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientName = (store.clients as any)?.name || null
  const platformIcon = getPlatformIcon(store.platform)

  return (
    <div className="space-y-6">
      {/* Breadcrumbs + Header */}
      <PageHeader
        title={store.store_name}
        breadcrumb={[
          { label: "Lojas", href: ROUTES.ADMIN.STORES.LIST },
          { label: store.store_name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <StoreDeleteAction
              storeId={store.id}
              storeName={store.store_name}
            />
          </div>
        }
      />

      {/* Store Header Card */}
      <div className="rounded-[8px] border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* Left: brand icon + name + url + status */}
          <div className="flex items-start gap-3 min-w-0">
            {platformIcon ? (
              <BrandIcon src={platformIcon} alt={store.platform || "Platform"} size={32} className="mt-0.5" />
            ) : (
              <div className="w-8 h-8 rounded-[6px] bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-sm font-semibold text-muted-foreground">
                  {store.store_name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-foreground">{store.store_name}</h2>
                <StatusBadge status={store.is_active ? "active" : "inactive"} />
              </div>
              {store.store_url && (
                <a
                  href={store.store_url.startsWith("http") ? store.store_url : `https://${store.store_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-[#4E62D8] dark:text-[#7B8CEA] hover:underline mt-0.5"
                >
                  {store.store_url}
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              {clientName && (
                <Link
                  href={`/admin/clients/${store.client_id}`}
                  className="block text-sm text-muted-foreground hover:text-foreground mt-0.5"
                >
                  Cliente: {clientName}
                </Link>
              )}
            </div>
          </div>

          {/* Right: Mini KPIs */}
          {(() => {
            // "Receita 30d" reflete a receita TOTAL da loja (store_total_revenue),
            // nao o revenue atribuido a email. Para lojas Omnisend, preenchido pela
            // Statistics API (totalRevenue). Fallback para klaviyo_total_revenue +
            // omnisend_total_revenue quando store_total_revenue ainda nao foi
            // calculado (lojas em pre-sync).
            const rs = store.revenueSummary as Record<string, unknown> | null
            const storeRev = Number(rs?.store_total_revenue) || 0
            const klavRev = Number(rs?.klaviyo_total_revenue) || 0
            const omnRev = Number(rs?.omnisend_total_revenue) || 0
            const revenueValue = storeRev || (klavRev + omnRev)
            const currency = (rs?.currency as string | undefined) || "BRL"
            const currencySymbol = currency === "USD" ? "$"
              : currency === "EUR" ? "€"
              : currency === "GBP" ? "£"
              : "R$"
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <MiniKpi label="Receita 30d" value={revenueValue > 0 ? `${currencySymbol} ${revenueValue.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}` : "—"} />
                <MiniKpi label="Pedidos 30d" value={rs?.store_orders ? String(rs.store_orders) : "—"} />
                <MiniKpi label="Engajamento" value={rs?.engagement_rate ? `${Number(rs.engagement_rate).toFixed(1)}%` : "—"} />
                <MiniKpi label="Contatos" value={rs?.total_leads ? Number(rs.total_leads).toLocaleString("pt-BR") : "—"} />
              </div>
            )
          })()}
        </div>
      </div>

      {/* Detail Tabs */}
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

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center sm:text-left">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-lg font-semibold text-foreground font-mono tabular-nums">{value}</p>
    </div>
  )
}
