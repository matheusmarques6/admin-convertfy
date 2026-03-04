"use client"

import { useState, useEffect } from "react"
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
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { KlaviyoPerformanceReport } from "@/components/clients/klaviyo-performance-report"
import { useKlaviyoCampaigns, useKlaviyoFlows } from "@/lib/hooks/use-api-data"
import { StoreBriefingTab } from "@/components/stores/store-briefing-tab"
import { StoreFormTab } from "@/components/stores/store-form-tab"
import { StoreAlertsTab } from "@/components/stores/store-alerts-tab"
import { StoreTrackingTab } from "@/components/stores/store-tracking-tab"
import { StoreUtmTab } from "@/components/stores/store-utm-tab"
import { StorePerformanceKPIs } from "@/components/stores/store-performance-kpis"
import { StorePerformanceTables } from "@/components/stores/store-performance-tables"
import { StoreLinkModal } from "@/components/stores/store-link-modal"
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
}: StoreDetailTabsProps) {
  const [period, setPeriodRaw] = useState<Period>("30d")
  const [customDates, setCustomDates] = useState<CustomDateRange | undefined>()
  const [customStart, setCustomStart] = useState<Date | undefined>()
  const [customEnd, setCustomEnd] = useState<Date | undefined>()
  const [activeAlertsCount, setActiveAlertsCount] = useState(0)
  const [linkModalOpen, setLinkModalOpen] = useState(false)

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
    <Tabs defaultValue="overview" className="space-y-6">
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
                    {clientId ? (
                      <span className="font-medium">Vinculado</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setLinkModalOpen(true)}
                        className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400 hover:underline cursor-pointer text-sm"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        Nao vinculado - Vincular
                      </button>
                    )}
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
                      <Badge variant="secondary">
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
                        <Badge variant="secondary" className="text-[10px]">
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
          data={campaignsData as { summary: Record<string, number>; campaigns: CampaignData[] } | undefined}
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
          data={flowsData as { summary: Record<string, number>; flows: FlowData[] } | undefined}
          loading={flowsInitialLoading}
          refreshing={flowsLoading}
          period={period}
          setPeriod={setPeriod}
          onRefresh={() => mutateFlows()}
          customStart={customStart}
          customEnd={customEnd}
          onCustomDateApply={handleCustomDateApply}
        />
      </TabsContent>

      {/* Report */}
      <TabsContent value="report">
        <KlaviyoPerformanceReport storeId={storeId} storeName={storeName} />
      </TabsContent>

      {/* UTM */}
      <TabsContent value="utm">
        <StoreUtmTab storeId={storeId} storeUrl={storeUrl} period={period} customDates={customDates} />
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
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle>Configurações da Loja</CardTitle>
            <CardDescription>
              Para editar credenciais e configurações desta loja, acesse a aba de lojas do cliente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              As configurações de credenciais (Shopify, Klaviyo, etc.) podem ser gerenciadas na página do cliente.
            </p>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Store Link Modal - opened from overview "Nao vinculado" */}
      {!clientId && (
        <StoreLinkModal
          storeId={storeId}
          storeName={storeName}
          isOpen={linkModalOpen}
          onClose={() => setLinkModalOpen(false)}
          onSuccess={() => window.location.reload()}
        />
      )}
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
  data: { summary: Record<string, number>; campaigns: CampaignData[] } | undefined
  loading: boolean
  refreshing: boolean
  period: Period
  setPeriod: (p: Period) => void
  onRefresh: () => void
  customStart?: Date
  customEnd?: Date
  onCustomDateApply: (start: Date, end: Date) => void
}) {
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
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
          <MetricCard label="Total Receita" value={`R$ ${(data.summary.totalRevenue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
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
                      <td className="py-2 text-right">R$ {(c.revenue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
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
}: {
  data: { summary: Record<string, number>; flows: FlowData[] } | undefined
  loading: boolean
  refreshing: boolean
  period: Period
  setPeriod: (p: Period) => void
  onRefresh: () => void
  customStart?: Date
  customEnd?: Date
  onCustomDateApply: (start: Date, end: Date) => void
}) {
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Flows Klaviyo</h3>
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
          <MetricCard label="Total Receita" value={`R$ ${(data.summary.totalRevenue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
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
                      <td className="py-2 text-right">R$ {(f.revenue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
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
                    <p className="text-xs text-destructive mt-0.5 truncate" title={status.error}>
                      {status.error}
                    </p>
                  )}
                  {key === "klaviyo" && connectionStatus === "connected" && status?.missingScopes && status.missingScopes.length > 0 && (
                    <p className="text-xs text-warning flex items-center gap-1 mt-0.5">
                      <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                      Scopes faltando: {status.missingScopes.join(", ")}
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
