import Link from "next/link"
import { notFound } from "next/navigation"
import { Mail } from "lucide-react"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { getStoreIntegrationStatus } from "@/lib/services/credentials.service"
import { convertToBRL } from "@/lib/services/exchange-rate.service"
import { PageHeader } from "@/components/ui/page-header"
import { ROUTES } from "@/lib/routes"
import { StoreDetailTabsV2 } from "@/components/stores/v2/store-detail-tabs-v2"
import { StoreDeleteAction } from "@/components/stores/store-delete-action"
import { StoreForceResyncAction } from "@/components/stores/store-force-resync-action"

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
      countries,
      language,
      created_at,
      client_id,
      org_id,
      mrr_cents,
      health_score,
      contract_start_date,
      contract_end_date,
      clients (
        id,
        name,
        owner_id,
        owner:profiles!clients_owner_id_fkey(id, name, avatar_url)
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
    .from("onboardings")
    .select(
      "status, current_column:operational_pipeline_columns(position, slug, name)",
    )
    .eq("store_id", id)
    .eq("status", "in_progress")
    .order("last_column_change_at", { ascending: false })
    .limit(1)
    .single()

  const { data: briefing } = await adminClient
    .from("store_briefings")
    .select("id")
    .eq("store_id", id)
    .eq("status", "current")
    .limit(1)
    .single()

  // drive_folder_url legado: pipeline v2 nao tem esse campo direto.
  // Mantemos null pra nao quebrar header da loja.
  const driveData = null as { drive_folder_url: string | null } | null

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
    onboarding_progress: (() => {
      const rawCol = (onboarding as unknown as { current_column?: unknown })
        ?.current_column
      const col = Array.isArray(rawCol)
        ? (rawCol[0] as { position?: number } | undefined)
        : (rawCol as { position?: number } | null | undefined)
      if (!col?.position && col?.position !== 0) return 0
      return Math.round(((col.position + 1) / 7) * 100)
    })(),
    has_briefing: !!briefing,
    drive_folder_url: driveData?.drive_folder_url || null,
    revenueSummary,
  }
}

function _getPlatformIcon(platform: string | null) {
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
  // clientName e platformIcon nao sao mais usados — StoreDetailTabsV2
  // ja consome store.clients direto e renderiza logo via initials.

  // Header sempre em BRL: pra lojas em outras moedas (USD, JPY, CNY, etc)
  // converte usando exchange rate atual (open.er-api.com via cache 1h).
  // Sem isso, lojas JPY mostravam valor cru (ex: JP¥ 21M) com simbolo "R$"
  // dando "R$ 21M" enganoso. Converter padroniza comparacao entre lojas.
  const rs = store.revenueSummary as Record<string, unknown> | null
  const storeCurrency = (rs?.currency as string | undefined) || "BRL"
  const storeRevenue = Number(rs?.store_total_revenue) || 0
  const klavRevenue = Number(rs?.klaviyo_total_revenue) || 0
  const omnRevenue = Number(rs?.omnisend_total_revenue) || 0
  const revenueLocal = storeRevenue || (klavRevenue + omnRevenue)
  const revenueBRL = revenueLocal > 0 && storeCurrency !== "BRL"
    ? await convertToBRL(revenueLocal, storeCurrency)
    : revenueLocal

  // Resolve client + CSM (owner do cliente) pro hero
  const clientObj = store.clients
    ? Array.isArray(store.clients)
      ? store.clients[0]
      : store.clients
    : null
  const ownerRaw = (clientObj as Record<string, unknown> | null)?.owner
  const cmName = (() => {
    if (!ownerRaw) return null
    const o = Array.isArray(ownerRaw) ? ownerRaw[0] : ownerRaw
    return (o as { name?: string } | null)?.name ?? null
  })()

  // Calcula KPIs pro hero (compativeis com StoreDetailTabsV2)
  const heroKpis = [
    {
      label: "Receita 30d",
      value: revenueBRL > 0
        ? `R$ ${revenueBRL.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
        : "—",
    },
    {
      label: "Pedidos 30d",
      value: rs?.store_orders ? String(rs.store_orders) : "—",
    },
    {
      label: "Engajamento",
      value: rs?.engagement_rate ? `${Number(rs.engagement_rate).toFixed(1)}%` : "—",
    },
    {
      label: "Contatos",
      value: rs?.total_leads ? Number(rs.total_leads).toLocaleString("pt-BR") : "—",
    },
  ]

  return (
    <div className="space-y-4">
      {/* Breadcrumbs + Header (acima do StoreDetailTabsV2 que tem hero proprio) */}
      <PageHeader
        title="Lojas"
        breadcrumb={[
          { label: "Lojas", href: ROUTES.ADMIN.STORES.LIST },
          { label: store.store_name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/stores/${store.id}/emails`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:text-gray-900 border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50"
              title="Acompanhar pipeline de geracao de emails (Epic AE)"
            >
              <Mail className="h-3.5 w-3.5" /> Emails
            </Link>
            <StoreForceResyncAction
              storeId={store.id}
              storeName={store.store_name}
            />
            <StoreDeleteAction
              storeId={store.id}
              storeName={store.store_name}
            />
          </div>
        }
      />

      {/* Detail Tabs V2 com Hero integrado */}
      <StoreDetailTabsV2
        store={{
          id: store.id,
          store_name: store.store_name,
          store_url: store.store_url,
          platform: store.platform,
          is_active: store.is_active,
          niche: store.niche,
          country: store.country,
          countries: (store as Record<string, unknown>).countries as string[] | null ?? null,
          language: store.language,
          created_at: store.created_at,
          client_id: store.client_id,
          org_id: store.org_id,
          mrr_cents: (store as Record<string, unknown>).mrr_cents as number | null ?? null,
          health_score: (store as Record<string, unknown>).health_score as number | null ?? null,
          contract_start_date: (store as Record<string, unknown>).contract_start_date as string | null ?? null,
          contract_end_date: (store as Record<string, unknown>).contract_end_date as string | null ?? null,
          clients: clientObj,
        }}
        cmName={cmName}
        kpis={heroKpis}
      />
    </div>
  )
}


