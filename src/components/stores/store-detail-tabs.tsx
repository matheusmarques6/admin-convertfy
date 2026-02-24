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
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GlowCard } from "@/components/ui/glow-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { KlaviyoPerformanceReport } from "@/components/clients/klaviyo-performance-report"
import { useKlaviyoCampaigns, useKlaviyoFlows } from "@/lib/hooks/use-api-data"
import { StoreBriefingTab } from "@/components/stores/store-briefing-tab"
import { StoreFormTab } from "@/components/stores/store-form-tab"
import { StoreAlertsTab } from "@/components/stores/store-alerts-tab"
import { StorePerformanceKPIs } from "@/components/stores/store-performance-kpis"
import { StorePerformanceTables } from "@/components/stores/store-performance-tables"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { useStorePerformance, StorePerformanceContext } from "@/lib/hooks/use-store-performance"
import type { CustomDateRange } from "@/lib/hooks/use-api-data"

interface StoreDetailTabsProps {
  storeId: string
  storeName: string
  storeUrl?: string | null
  platform?: string | null
  niche?: string | null
  country?: string | null
  language?: string | null
  integrationStatus: Record<string, { connected: boolean; connected_at?: string; hasReportingAccess?: boolean }>
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
              <GlowCard color="primary" intensity="subtle">
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
              </GlowCard>

              {/* Onboarding Status */}
              {onboardingStatus && (
                <GlowCard color="primary" intensity="subtle">
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
                </GlowCard>
              )}

              {/* Integration Status */}
              <GlowCard color="primary" intensity="subtle" className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Status das Integrações</CardTitle>
                  <CardDescription>Serviços conectados a esta loja</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                      { key: "shopify", label: "Shopify" },
                      { key: "klaviyo", label: "Klaviyo" },
                      { key: "ga4", label: "Google Analytics" },
                      { key: "meta", label: "Meta Ads" },
                      { key: "google_ads", label: "Google Ads" },
                      { key: "google_calendar", label: "Google Calendar" },
                    ].map(({ key, label }) => {
                      const status = integrationStatus[key]
                      const connected = status?.connected || false
                      const hasReporting = key === "klaviyo" && connected
                        ? status?.hasReportingAccess
                        : undefined
                      return (
                        <div
                          key={key}
                          className="flex items-center gap-3 p-3 rounded-lg border"
                        >
                          {connected ? (
                            <CheckCircle2 className="h-5 w-5 text-success" />
                          ) : (
                            <XCircle className="h-5 w-5 text-muted-foreground/40" />
                          )}
                          <div>
                            <p className="text-sm font-medium">{label}</p>
                            <p className="text-xs text-muted-foreground">
                              {connected
                                ? status?.connected_at
                                  ? `Conectado em ${new Date(status.connected_at).toLocaleDateString("pt-BR")}`
                                  : "Conectado"
                                : "Não conectado"}
                            </p>
                            {key === "klaviyo" && connected && hasReporting === false && (
                              <p className="text-xs text-yellow-500 flex items-center gap-1 mt-0.5">
                                <AlertTriangle className="h-3 w-3" />
                                Sem acesso a relatórios
                              </p>
                            )}
                            {key === "klaviyo" && connected && hasReporting === true && (
                              <p className="text-xs text-success mt-0.5">
                                Relatórios ativos
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </GlowCard>
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

      {/* Settings */}
      <TabsContent value="settings">
        <GlowCard color="primary" intensity="subtle">
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
        </GlowCard>
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
        <GlowCard color="primary" intensity="subtle">
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
        </GlowCard>
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
        <GlowCard color="primary" intensity="subtle">
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
        </GlowCard>
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

// --- Metric Card ---
function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <GlowCard color="primary" intensity="moderate">
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold mt-1">{value}</p>
      </CardContent>
    </GlowCard>
  )
}
