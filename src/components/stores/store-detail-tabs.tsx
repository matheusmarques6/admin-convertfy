"use client"

import { useState, useEffect, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { format } from "date-fns"
import {
  Store,
  BarChart3,
  Zap,
  CalendarDays,
  Settings,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  BookOpen,
  FileText,
  AlertTriangle,
  Package,
  Link2,
  Key,
  FileJson,
  Save,
  Eye,
  EyeOff,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { KlaviyoPerformanceReport } from "@/components/clients/klaviyo-performance-report"
import { formatCurrency } from "@/lib/utils"
import { useKlaviyoCampaigns, useKlaviyoFlows } from "@/lib/hooks/use-api-data"
import { RateLimitBanner } from "@/components/ui/rate-limit-banner"
import { StoreBriefingTab } from "@/components/stores/store-briefing-tab"
import { StoreFormTab } from "@/components/stores/store-form-tab"
import { StoreAlertsTab } from "@/components/stores/store-alerts-tab"
import { StoreTrackingTab } from "@/components/stores/store-tracking-tab"
import { StoreUtmTab } from "@/components/stores/store-utm-tab"
import { StorePerformanceKPIs } from "@/components/stores/store-performance-kpis"
import { StorePerformanceTables } from "@/components/stores/store-performance-tables"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { useStorePerformance, StorePerformanceContext } from "@/lib/hooks/use-store-performance"
import { toast } from "@/lib/hooks/use-toast"
import type { CustomDateRange } from "@/lib/hooks/use-api-data"

interface IntegrationStatusData {
  connected: boolean
  configured?: boolean
  status?: "not_configured" | "pending_validation" | "connected" | "error"
  connected_at?: string
  validated_at?: string | null
  error?: string | null
  hasReportingAccess?: boolean
  missingScopes?: string[]
}

interface StoreDetailTabsProps {
  storeId: string
  storeName: string
  storeUrl?: string | null
  platform?: string | null
  niche?: string | null
  country?: string | null
  language?: string | null
  integrationStatus: Record<string, IntegrationStatusData>
  clientId: string | null
  onboardingFormComplete?: boolean
  onboardingStatus?: string | null
  onboardingProgress?: number
  hasBriefing?: boolean
  driveFolderUrl?: string | null
  currency?: string
}

interface CampaignData {
  id: string
  name: string
  status: string
  sendTime: string | null
  channel: string
  recipients: number
  opened: number
  openRate: number
  clicked: number
  clickRate: number
  revenue: number
}

interface FlowData {
  id: string
  name: string
  status: string
  triggerType: string
  recipients: number
  opened: number
  openRate: number
  clicked: number
  clickRate: number
  revenue: number
}

type Period = "7d" | "30d" | "90d" | "all" | "custom"

const VALID_TABS = [
  "overview", "campaigns", "flows", "report", "utm",
  "form", "briefing", "alerts", "rastreio", "settings",
] as const


interface CredentialsFormState {
  shopify_store_domain: string
  shopify_access_token: string
  klaviyo_public_key: string
  klaviyo_private_key: string
  klaviyo_list_id: string
  ga4_property_id: string
  ga4_credentials_json: string
}

const EMPTY_CREDENTIALS: CredentialsFormState = {
  shopify_store_domain: "",
  shopify_access_token: "",
  klaviyo_public_key: "",
  klaviyo_private_key: "",
  klaviyo_list_id: "",
  ga4_property_id: "",
  ga4_credentials_json: "",
}

export function StoreDetailTabs({
  storeId,
  storeName,
  storeUrl,
  platform,
  niche,
  country,
  language,
  integrationStatus,
  clientId,
  onboardingFormComplete,
  onboardingStatus,
  onboardingProgress,
  hasBriefing,
  driveFolderUrl,
  currency: storeCurrency,
}: StoreDetailTabsProps) {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Controlled tab from ?tab= query param
  const tabParam = searchParams.get("tab")
  const initialTab = tabParam && VALID_TABS.includes(tabParam as typeof VALID_TABS[number])
    ? tabParam
    : "overview"
  const [activeTab, setActiveTab] = useState(initialTab)

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value)
    // Update URL without full navigation
    const url = new URL(window.location.href)
    if (value === "overview") {
      url.searchParams.delete("tab")
    } else {
      url.searchParams.set("tab", value)
    }
    window.history.replaceState({}, "", url.toString())
  }, [])

  const [period, setPeriodRaw] = useState<Period>("30d")
  const [customDates, setCustomDates] = useState<CustomDateRange | undefined>()
  const [customStart, setCustomStart] = useState<Date | undefined>()
  const [customEnd, setCustomEnd] = useState<Date | undefined>()
  const [activeAlertsCount, setActiveAlertsCount] = useState(0)

  const setPeriod = (p: Period) => {
    setPeriodRaw(p)
    if (p !== "custom") {
      setCustomDates(undefined)
      setCustomStart(undefined)
      setCustomEnd(undefined)
    }
  }

  const handleCustomDateApply = (start: Date, end: Date) => {
    setCustomStart(start)
    setCustomEnd(end)
    const dates: CustomDateRange = {
      startDate: format(start, "yyyy-MM-dd"),
      endDate: format(end, "yyyy-MM-dd"),
    }
    setCustomDates(dates)
    setPeriodRaw("custom")
  }

  // Fetch active alerts count
  useEffect(() => {
    async function fetchAlertCount() {
      try {
        const res = await fetch(`/api/stores/alerts/summary?store_id=${storeId}`)
        const data = await res.json()
        if (data.success) {
          setActiveAlertsCount(data.summary.total_active)
        }
      } catch {
        // Silently fail — badge just won't show
      }
    }
    fetchAlertCount()
  }, [storeId])

  const klaviyoConnected = integrationStatus.klaviyo?.connected || false
  const shopifyConnected = integrationStatus?.shopify?.connected ?? false

  const {
    data: campaignsData,
    isLoading: campaignsInitialLoading,
    isValidating: campaignsLoading,
    mutate: mutateCampaigns,
  } = useKlaviyoCampaigns(klaviyoConnected ? storeId : null, period, customDates)

  const {
    data: flowsData,
    isLoading: flowsInitialLoading,
    isValidating: flowsLoading,
    mutate: mutateFlows,
  } = useKlaviyoFlows(klaviyoConnected ? storeId : null, period, customDates)

  // Store performance hook for overview tab (independent period state)
  const storePerformance = useStorePerformance(storeId, klaviyoConnected)

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
      <TabsList>
        <TabsTrigger value="overview">
          <Store className="h-4 w-4 mr-2" />
          Visão Geral
        </TabsTrigger>
        <TabsTrigger value="campaigns" disabled={!klaviyoConnected}>
          <CalendarDays className="h-4 w-4 mr-2" />
          Campanhas
        </TabsTrigger>
        <TabsTrigger value="flows" disabled={!klaviyoConnected}>
          <Zap className="h-4 w-4 mr-2" />
          Flows
        </TabsTrigger>
        <TabsTrigger value="report" disabled={!klaviyoConnected}>
          <BarChart3 className="h-4 w-4 mr-2" />
          Relatório
        </TabsTrigger>
        <TabsTrigger value="utm" disabled={!shopifyConnected}>
          <Link2 className="h-4 w-4 mr-2" />
          UTM
        </TabsTrigger>
        <TabsTrigger value="form">
          <FileText className="h-4 w-4 mr-2" />
          Formulário
        </TabsTrigger>
        <TabsTrigger value="briefing">
          <BookOpen className="h-4 w-4 mr-2" />
          Briefing
        </TabsTrigger>
        <TabsTrigger value="alerts" className="relative">
          <AlertTriangle className="h-4 w-4 mr-2" />
          Alertas
          {activeAlertsCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-1">
              {activeAlertsCount}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="rastreio">
          <Package className="h-4 w-4 mr-2" />
          Rastreio
        </TabsTrigger>
        <TabsTrigger value="settings">
          <Settings className="h-4 w-4 mr-2" />
          Configurações
        </TabsTrigger>
      </TabsList>

      {/* Overview */}
      <TabsContent value="overview">
        <StorePerformanceContext.Provider value={storePerformance}>
          <div className="space-y-6">
            {/* Performance KPIs with period selector */}
            {klaviyoConnected && <StorePerformanceKPIs />}

            {/* Info cards grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Store Info */}
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle className="text-base">Informações da Loja</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Nome</span>
                    <span className="font-medium">{storeName}</span>
                  </div>
                  {storeUrl && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">URL</span>
                      <span className="font-medium">{storeUrl}</span>
                    </div>
                  )}
                  {platform && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Plataforma</span>
                      <Badge variant="outline">{platform}</Badge>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Cliente</span>
                    <span className="font-medium">Vinculado</span>
                  </div>
                  {niche && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Nicho</span>
                      <span className="font-medium">{niche}</span>
                    </div>
                  )}
                  {country && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">País</span>
                      <span className="font-medium">{country}</span>
                    </div>
                  )}
                  {language && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Idioma</span>
                      <span className="font-medium">{language}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Onboarding Status */}
              {onboardingStatus && (
                <Card className="rounded-xl">
                  <CardHeader>
                    <CardTitle className="text-base">Status do Onboarding</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Fase</span>
                      <Badge variant="neutral">
                        {onboardingStatus === "in_progress" ? "Em Andamento" :
                         onboardingStatus === "not_started" ? "Não Iniciado" :
                         onboardingStatus === "paused" ? "Pausado" :
                         onboardingStatus === "completed" ? "Concluído" : onboardingStatus}
                      </Badge>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Progresso</span>
                        <span className="font-medium">{onboardingProgress || 0}%</span>
                      </div>
                      <Progress value={onboardingProgress || 0} className="h-1.5" />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Formulário</span>
                      {onboardingFormComplete ? (
                        <Badge variant="success" className="text-[10px]">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Preenchido
                        </Badge>
                      ) : (
                        <Badge variant="warning" className="text-[10px]">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Pendente
                        </Badge>
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Briefing</span>
                      {hasBriefing ? (
                        <Badge variant="success" className="text-[10px]">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Gerado
                        </Badge>
                      ) : (
                        <Badge variant="neutral" className="text-[10px]">
                          <FileText className="h-3 w-3 mr-1" />
                          Não gerado
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Integration Status */}
              <IntegrationStatusCard
                storeId={storeId}
                integrationStatus={integrationStatus}
              />
            </div>

            {/* Performance Tables (campaigns + flows) */}
            {klaviyoConnected && <StorePerformanceTables />}
          </div>
        </StorePerformanceContext.Provider>
      </TabsContent>

      {/* Campaigns */}
      <TabsContent value="campaigns">
        <CampaignsTab
          data={campaignsData as { summary: Record<string, number>; campaigns: CampaignData[]; currency?: string } | undefined}
          loading={campaignsInitialLoading}
          refreshing={campaignsLoading}
          period={period}
          setPeriod={setPeriod}
          onRefresh={() => mutateCampaigns()}
          customStart={customStart}
          customEnd={customEnd}
          onCustomDateApply={handleCustomDateApply}
        />
      </TabsContent>

      {/* Flows */}
      <TabsContent value="flows">
        <FlowsTab
          data={flowsData as { summary: Record<string, number>; flows: FlowData[]; currency?: string } | undefined}
          loading={flowsInitialLoading}
          refreshing={flowsLoading}
          period={period}
          setPeriod={setPeriod}
          onRefresh={() => mutateFlows()}
          customStart={customStart}
          customEnd={customEnd}
          onCustomDateApply={handleCustomDateApply}
          driveFolderUrl={driveFolderUrl}
        />
      </TabsContent>

      {/* Report */}
      <TabsContent value="report">
        <KlaviyoPerformanceReport storeId={storeId} storeName={storeName} />
      </TabsContent>

      {/* UTM */}
      <TabsContent value="utm">
        <StoreUtmTab storeId={storeId} storeUrl={storeUrl} period={period} customDates={customDates} currency={storeCurrency} />
      </TabsContent>

      {/* Formulário */}
      <TabsContent value="form">
        <StoreFormTab storeId={storeId} clientId={clientId} />
      </TabsContent>

      {/* Briefing */}
      <TabsContent value="briefing">
        <StoreBriefingTab storeId={storeId} clientId={clientId} />
      </TabsContent>

      {/* Alerts */}
      <TabsContent value="alerts">
        <StoreAlertsTab storeId={storeId} storeName={storeName} />
      </TabsContent>

      {/* Rastreio */}
      <TabsContent value="rastreio">
        <StoreTrackingTab storeId={storeId} />
      </TabsContent>

      {/* Settings */}
      <TabsContent value="settings">
        <div className="space-y-6">
          {/* Integration Status Card */}
          <IntegrationStatusCard
            storeId={storeId}
            integrationStatus={integrationStatus}
          />

          {/* Credentials Form */}
          <CredentialsForm
            storeId={storeId}
            clientId={clientId}
            integrationStatus={integrationStatus}
            platform={platform}
            onSaved={() => router.refresh()}
          />
        </div>
      </TabsContent>

    </Tabs>
  )
}

// --- Campaigns Tab Component ---
function CampaignsTab({
  data,
  loading,
  refreshing,
  period,
  setPeriod,
  onRefresh,
  customStart,
  customEnd,
  onCustomDateApply,
}: {
  data: { summary: Record<string, number>; campaigns: CampaignData[]; currency?: string; rateLimited?: boolean; fromCache?: boolean; fetchedAt?: string } | undefined
  loading: boolean
  refreshing: boolean
  period: Period
  setPeriod: (p: Period) => void
  onRefresh: () => void
  customStart?: Date
  customEnd?: Date
  onCustomDateApply: (start: Date, end: Date) => void
}) {
  const currency = data?.currency || "BRL"

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {data?.rateLimited && (
        <RateLimitBanner fromCache={!!data.fromCache} fetchedAt={data.fetchedAt} />
      )}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Campanhas Klaviyo</h3>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="7d">7 dias</option>
            <option value="30d">30 dias</option>
            <option value="90d">90 dias</option>
            <option value="all">Tudo</option>
          </select>
          <DateRangePicker
            startDate={customStart}
            endDate={customEnd}
            onApply={onCustomDateApply}
          />
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {data?.summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Campanhas Enviadas" value={data.summary.sentCampaigns || data.summary.totalCampaigns || 0} />
          <MetricCard label="Total Receita" value={formatCurrency(data.summary.totalRevenue || 0, currency)} />
          <MetricCard label="Taxa de Abertura" value={`${(data.summary.avgOpenRate || 0).toFixed(2)}%`} />
          <MetricCard label="Taxa de Clique" value={`${(data.summary.avgClickRate || 0).toFixed(2)}%`} />
        </div>
      )}

      {data?.campaigns && data.campaigns.length > 0 ? (
        <Card className="rounded-xl">
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left pb-2 font-medium">Nome</th>
                    <th className="text-left pb-2 font-medium">Status</th>
                    <th className="text-right pb-2 font-medium">Enviados</th>
                    <th className="text-right pb-2 font-medium">Abertura</th>
                    <th className="text-right pb-2 font-medium">Clique</th>
                    <th className="text-right pb-2 font-medium">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.slice(0, 20).map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium max-w-[200px] truncate">{c.name}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={c.status === "sent" ? "success" : "secondary"}>
                          {c.status}
                        </Badge>
                      </td>
                      <td className="py-2 text-right">{(c.recipients || 0).toLocaleString()}</td>
                      <td className="py-2 text-right">{(c.openRate || 0).toFixed(2)}%</td>
                      <td className="py-2 text-right">{(c.clickRate || 0).toFixed(2)}%</td>
                      <td className="py-2 text-right">{formatCurrency(c.revenue || 0, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhuma campanha encontrada para o período selecionado.
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// --- Flows Tab Component ---
function FlowsTab({
  data,
  loading,
  refreshing,
  period,
  setPeriod,
  onRefresh,
  customStart,
  customEnd,
  onCustomDateApply,
  driveFolderUrl,
}: {
  data: { summary: Record<string, number>; flows: FlowData[]; currency?: string; rateLimited?: boolean; fromCache?: boolean; fetchedAt?: string } | undefined
  loading: boolean
  refreshing: boolean
  period: Period
  setPeriod: (p: Period) => void
  onRefresh: () => void
  customStart?: Date
  customEnd?: Date
  onCustomDateApply: (start: Date, end: Date) => void
  driveFolderUrl?: string | null
}) {
  const currency = data?.currency || "BRL"

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {data?.rateLimited && (
        <RateLimitBanner fromCache={!!data.fromCache} fetchedAt={data.fetchedAt} />
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">Flows Klaviyo</h3>
          {driveFolderUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={driveFolderUrl} target="_blank" rel="noopener noreferrer">
                <Link2 className="h-4 w-4 mr-1" />
                Pasta de Copys
              </a>
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="7d">7 dias</option>
            <option value="30d">30 dias</option>
            <option value="90d">90 dias</option>
            <option value="all">Tudo</option>
          </select>
          <DateRangePicker
            startDate={customStart}
            endDate={customEnd}
            onApply={onCustomDateApply}
          />
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {data?.summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Flows Ativos" value={data.summary.liveFlows || data.summary.totalFlows || 0} />
          <MetricCard label="Total Receita" value={formatCurrency(data.summary.totalRevenue || 0, currency)} />
          <MetricCard label="Taxa de Abertura" value={`${(data.summary.avgOpenRate || 0).toFixed(2)}%`} />
          <MetricCard label="Taxa de Clique" value={`${(data.summary.avgClickRate || 0).toFixed(2)}%`} />
        </div>
      )}

      {data?.flows && data.flows.length > 0 ? (
        <Card className="rounded-xl">
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left pb-2 font-medium">Nome</th>
                    <th className="text-left pb-2 font-medium">Status</th>
                    <th className="text-left pb-2 font-medium">Trigger</th>
                    <th className="text-right pb-2 font-medium">Enviados</th>
                    <th className="text-right pb-2 font-medium">Abertura</th>
                    <th className="text-right pb-2 font-medium">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {data.flows.map((f) => (
                    <tr key={f.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium max-w-[200px] truncate">{f.name}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={f.status === "live" ? "success" : "secondary"}>
                          {f.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{f.triggerType || "-"}</td>
                      <td className="py-2 text-right">{(f.recipients || 0).toLocaleString()}</td>
                      <td className="py-2 text-right">{(f.openRate || 0).toFixed(2)}%</td>
                      <td className="py-2 text-right">{formatCurrency(f.revenue || 0, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhum flow encontrado para o período selecionado.
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// --- Integration Status Card ---
function IntegrationStatusCard({
  storeId,
  integrationStatus,
}: {
  storeId: string
  integrationStatus: Record<string, IntegrationStatusData>
}) {
  const [revalidating, setRevalidating] = useState<string | null>(null)
  const [localStatus, setLocalStatus] = useState(integrationStatus)

  // Sync with props
  useEffect(() => {
    setLocalStatus(integrationStatus)
  }, [integrationStatus])

  const handleRevalidate = async (key: string) => {
    setRevalidating(key)
    try {
      // Call server-side revalidation endpoint (no credentials leave the server)
      const res = await fetch("/api/client-stores/credentials/revalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: storeId }),
      })

      const data = await res.json()
      const result = data.validation_results?.[key]

      if (result) {
        setLocalStatus((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            connected: result.valid,
            configured: true,
            status: result.valid ? "connected" as const : "error" as const,
            validated_at: result.tested_at,
            error: result.valid ? null : (result.error || "Erro desconhecido"),
            hasReportingAccess: result.hasReportingAccess,
            missingScopes: result.missingScopes,
          },
        }))
      }
    } catch {
      toast({
        title: "Erro ao revalidar",
        description: "Falha de conexao ao tentar revalidar credenciais. Tente novamente.",
        variant: "destructive",
      })
    } finally {
      setRevalidating(null)
    }
  }

  const integrations = [
    { key: "shopify", label: "Shopify", canRevalidate: true },
    { key: "klaviyo", label: "Klaviyo", canRevalidate: true },
    { key: "ga4", label: "Google Analytics", canRevalidate: false },
    { key: "meta", label: "Meta Ads", canRevalidate: false },
    { key: "google_ads", label: "Google Ads", canRevalidate: false },
    { key: "google_calendar", label: "Google Calendar", canRevalidate: false },
  ]

  return (
    <Card className="rounded-xl md:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Status das Integrações</CardTitle>
        <CardDescription>Serviços conectados a esta loja</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.map(({ key, label, canRevalidate }) => {
            const status = localStatus[key]
            const connectionStatus = status?.status || (status?.connected ? "connected" : "not_configured")
            const isRevalidating = revalidating === key

            return (
              <div
                key={key}
                className="flex items-center gap-3 p-3 rounded-lg border"
              >
                {/* Status Icon */}
                {connectionStatus === "connected" ? (
                  <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                ) : connectionStatus === "error" ? (
                  <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                ) : connectionStatus === "pending_validation" ? (
                  <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 text-muted-foreground/40 flex-shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">
                    {connectionStatus === "connected"
                      ? status?.validated_at
                        ? `Conectado em ${new Date(status.validated_at).toLocaleDateString("pt-BR")}`
                        : status?.connected_at
                          ? `Conectado em ${new Date(status.connected_at).toLocaleDateString("pt-BR")}`
                          : "Conectado"
                      : connectionStatus === "error"
                        ? "Erro de conexão"
                        : connectionStatus === "pending_validation"
                          ? "Pendente de validação"
                          : "Não configurado"}
                  </p>
                  {connectionStatus === "error" && status?.error && (
                    <p className="text-xs text-destructive mt-0.5 break-words" title={status.error}>
                      {status.error}
                    </p>
                  )}
                  {key === "klaviyo" && status?.missingScopes && status.missingScopes.length > 0 && (
                    <p className="text-xs text-warning flex items-start gap-1 mt-0.5">
                      <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                      <span>Scopes faltando: <strong>{status.missingScopes.join(", ")}</strong>. Edite a chave em Klaviyo → Settings → API Keys.</span>
                    </p>
                  )}
                  {key === "klaviyo" && connectionStatus === "connected" && status?.hasReportingAccess === false && !status?.missingScopes?.length && (
                    <p className="text-xs text-warning flex items-center gap-1 mt-0.5">
                      <AlertTriangle className="h-3 w-3" />
                      Sem acesso a relatórios
                    </p>
                  )}
                  {key === "klaviyo" && connectionStatus === "connected" && status?.hasReportingAccess === true && (
                    <p className="text-xs text-success mt-0.5">
                      Relatórios ativos
                    </p>
                  )}
                </div>

                {/* Revalidate button for configured integrations */}
                {canRevalidate && status?.configured && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 flex-shrink-0"
                    onClick={() => handleRevalidate(key)}
                    disabled={isRevalidating}
                    title="Revalidar conexão"
                  >
                    {isRevalidating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// --- Credentials Form (Settings Tab) ---
function CredentialsForm({
  storeId,
  clientId: _clientId,
  integrationStatus,
  platform,
  onSaved,
}: {
  storeId: string
  clientId: string | null
  integrationStatus: Record<string, IntegrationStatusData>
  platform?: string | null
  onSaved: () => void
}) {
  // platform and clientId are accepted for future conditional rendering but currently unused
  void platform
  void _clientId
  const [form, setForm] = useState<CredentialsFormState>({ ...EMPTY_CREDENTIALS })
  const [isSaving, setIsSaving] = useState(false)
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})

  const togglePasswordVisibility = (field: string) => {
    setShowPasswords((prev) => ({ ...prev, [field]: !prev[field] }))
  }

  const shopifyConfigured = integrationStatus.shopify?.configured ?? false
  const klaviyoConfigured = integrationStatus.klaviyo?.configured ?? false
  const ga4Configured = integrationStatus.ga4?.configured ?? false

  const handleSave = async () => {
    setIsSaving(true)
    try {
      // Build payload with only filled fields (AC 39.1.4)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: Record<string, any> = { store_id: storeId }

      // Shopify fields
      if (form.shopify_store_domain.trim()) {
        payload.shopify_store_domain = form.shopify_store_domain.trim()
      }
      if (form.shopify_access_token.trim()) {
        payload.shopify_access_token = form.shopify_access_token.trim()
      }

      // Klaviyo fields
      if (form.klaviyo_public_key.trim()) {
        payload.klaviyo_public_key = form.klaviyo_public_key.trim()
      }
      if (form.klaviyo_private_key.trim()) {
        payload.klaviyo_private_key = form.klaviyo_private_key.trim()
      }
      if (form.klaviyo_list_id.trim()) {
        payload.klaviyo_list_id = form.klaviyo_list_id.trim()
      }

      // GA4 fields
      if (form.ga4_property_id.trim()) {
        payload.ga4_property_id = form.ga4_property_id.trim()
      }
      if (form.ga4_credentials_json.trim()) {
        // AC 39.1.8: JSON validation
        try {
          payload.ga4_credentials = JSON.parse(form.ga4_credentials_json.trim())
        } catch {
          toast({
            variant: "destructive",
            title: "JSON invalido",
            description: "As credenciais do Google Analytics devem ser um JSON valido",
          })
          setIsSaving(false)
          return
        }
      }

      // Check if there's anything to save
      if (Object.keys(payload).length <= 1) {
        toast({
          variant: "destructive",
          title: "Nenhum campo preenchido",
          description: "Preencha ao menos um campo de credencial para salvar.",
        })
        setIsSaving(false)
        return
      }

      // AC 39.1.3: Call PUT /api/client-stores/credentials
      const response = await fetch("/api/client-stores/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Erro ao salvar credenciais")
      }

      // Onboarding auto-complete is now handled server-side in the credentials API (Story 39.3)

      // AC 39.1.5: Toast + refresh
      toast({
        title: "Credenciais salvas",
        description: "As credenciais foram atualizadas com sucesso.",
      })

      // Reset form after save
      setForm({ ...EMPTY_CREDENTIALS })

      // AC 39.1.12: Refresh to update IntegrationStatusCard
      onSaved()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Erro desconhecido",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle>Credenciais de Integração</CardTitle>
        <CardDescription>
          Configure as credenciais das integrações desta loja. Campos sensíveis são criptografados antes de serem salvos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Shopify Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium flex items-center gap-2">
              <Store className="h-4 w-4 text-success" />
              Integração Shopify
            </h4>
            <Badge variant={shopifyConfigured ? "success" : "secondary"} className="text-xs">
              {shopifyConfigured ? "Configurado" : "Não configurado"}
            </Badge>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Domínio da Loja</Label>
              <Input
                placeholder="minhaloja.myshopify.com"
                value={form.shopify_store_domain}
                onChange={(e) => setForm({ ...form, shopify_store_domain: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Domínio .myshopify.com da sua loja
              </p>
            </div>

            <div className="space-y-2">
              <Label>Admin API Access Token</Label>
              <div className="relative">
                <Input
                  type={showPasswords.shopify_access_token ? "text" : "password"}
                  placeholder="shpat_xxxxxxxxxxxxxxxx"
                  value={form.shopify_access_token}
                  onChange={(e) => setForm({ ...form, shopify_access_token: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => togglePasswordVisibility("shopify_access_token")}
                >
                  {showPasswords.shopify_access_token ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Crie em Settings &rarr; Apps &rarr; Develop apps &rarr; Create app &rarr; Admin API access token
              </p>
            </div>
          </div>
        </div>

        {/* Klaviyo Section */}
        <div className="border-t pt-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" />
              Integração Klaviyo
            </h4>
            <Badge variant={klaviyoConfigured ? "success" : "secondary"} className="text-xs">
              {klaviyoConfigured ? "Configurado" : "Não configurado"}
            </Badge>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Public API Key / Site ID</Label>
              <Input
                placeholder="XXXXXX (6 caracteres)"
                value={form.klaviyo_public_key}
                onChange={(e) => setForm({ ...form, klaviyo_public_key: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Encontre em Klaviyo &rarr; Settings &rarr; API Keys &rarr; Public API Key (Site ID)
              </p>
            </div>

            <div className="space-y-2">
              <Label>Private API Key *</Label>
              <div className="relative">
                <Input
                  type={showPasswords.klaviyo_private_key ? "text" : "password"}
                  placeholder="pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={form.klaviyo_private_key}
                  onChange={(e) => setForm({ ...form, klaviyo_private_key: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => togglePasswordVisibility("klaviyo_private_key")}
                >
                  {showPasswords.klaviyo_private_key ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Encontre em Klaviyo &rarr; Settings &rarr; API Keys &rarr; Create Private API Key
              </p>
            </div>

            <div className="space-y-2">
              <Label>List ID (opcional)</Label>
              <Input
                placeholder="ID da lista principal"
                value={form.klaviyo_list_id}
                onChange={(e) => setForm({ ...form, klaviyo_list_id: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* GA4 Section */}
        <div className="border-t pt-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-warning" />
              Integração Google Analytics (GA4)
            </h4>
            <Badge variant={ga4Configured ? "success" : "secondary"} className="text-xs">
              {ga4Configured ? "Configurado" : "Não configurado"}
            </Badge>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Property ID</Label>
              <Input
                placeholder="123456789"
                value={form.ga4_property_id}
                onChange={(e) => setForm({ ...form, ga4_property_id: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Encontre em GA4 &rarr; Admin &rarr; Property Settings &rarr; Property ID
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FileJson className="h-4 w-4" />
                Service Account Credentials (JSON)
              </Label>
              <textarea
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono text-xs"
                placeholder='{"type": "service_account", "project_id": "...", "private_key_id": "...", "private_key": "...", "client_email": "...", ...}'
                value={form.ga4_credentials_json}
                onChange={(e) => setForm({ ...form, ga4_credentials_json: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Cole o JSON completo da service account. Crie em Google Cloud Console &rarr; IAM &rarr; Service Accounts &rarr; Create &rarr; Keys &rarr; Add Key &rarr; JSON
              </p>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar Credenciais
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// --- Metric Card ---
function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="rounded-xl">
      <CardContent className="pt-4 pb-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  )
}
