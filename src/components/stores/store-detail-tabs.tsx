"use client"

import { useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { format } from "date-fns"
import { Loader2 } from "lucide-react"
import { UnderlineTabs, UnderlineTabItem } from "@/components/ui/underline-tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { Progress } from "@/components/ui/progress"
import { KlaviyoPerformanceReport } from "@/components/clients/klaviyo-performance-report"
import { formatCurrency } from "@/lib/utils"
import { useKlaviyoCampaigns, useKlaviyoFlows } from "@/lib/hooks/use-api-data"
import { StoreBriefingTab } from "@/components/stores/store-briefing-tab"
import { StoreFormTab } from "@/components/stores/store-form-tab"
import { StorePerformanceKPIs } from "@/components/stores/store-performance-kpis"
import { StorePerformanceTables } from "@/components/stores/store-performance-tables"
import { useStorePerformance, StorePerformanceContext } from "@/lib/hooks/use-store-performance"
import { OnboardingStepper } from "@/components/stores/onboarding-stepper"
import { IntegrationsPanel } from "@/components/stores/integrations-panel"
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

type Period = "7d" | "30d" | "90d" | "all" | "custom"

const VALID_TABS = [
  "overview", "integrations", "onboarding", "briefing", "reports",
] as const

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
  driveFolderUrl: _driveFolderUrl,
  currency: storeCurrency,
}: StoreDetailTabsProps) {
  const searchParams = useSearchParams()

  // Controlled tab from ?tab= query param
  const tabParam = searchParams.get("tab")
  const initialTab = tabParam && VALID_TABS.includes(tabParam as typeof VALID_TABS[number])
    ? tabParam
    : "overview"
  const [activeTab, setActiveTab] = useState(initialTab)

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value)
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
  const [_customStart, setCustomStart] = useState<Date | undefined>()
  const [_customEnd, setCustomEnd] = useState<Date | undefined>()

  const _setPeriod = (p: Period) => {
    setPeriodRaw(p)
    if (p !== "custom") {
      setCustomDates(undefined)
      setCustomStart(undefined)
      setCustomEnd(undefined)
    }
  }

  const _handleCustomDateApply = (start: Date, end: Date) => {
    setCustomStart(start)
    setCustomEnd(end)
    const dates: CustomDateRange = {
      startDate: format(start, "yyyy-MM-dd"),
      endDate: format(end, "yyyy-MM-dd"),
    }
    setCustomDates(dates)
    setPeriodRaw("custom")
  }

  const klaviyoConnected = integrationStatus.klaviyo?.connected || false
  const _shopifyConnected = integrationStatus?.shopify?.connected ?? false

  const {
    data: campaignsData,
    isLoading: campaignsInitialLoading,
    isValidating: _campaignsLoading,
    mutate: _mutateCampaigns,
  } = useKlaviyoCampaigns(klaviyoConnected ? storeId : null, period, customDates)

  const {
    data: _flowsData,
    isLoading: _flowsInitialLoading,
    isValidating: _flowsLoading,
    mutate: _mutateFlows,
  } = useKlaviyoFlows(klaviyoConnected ? storeId : null, period, customDates)

  // Store performance hook for overview tab
  const storePerformance = useStorePerformance(storeId, klaviyoConnected)

  return (
    <div className="space-y-6">
      {/* UnderlineTabs — DS v3.0 Rule 18 */}
      <UnderlineTabs value={activeTab} onValueChange={handleTabChange}>
        <UnderlineTabItem value="overview">Overview</UnderlineTabItem>
        <UnderlineTabItem value="integrations">Integrações</UnderlineTabItem>
        <UnderlineTabItem value="onboarding">Onboarding</UnderlineTabItem>
        <UnderlineTabItem value="briefing">Briefing</UnderlineTabItem>
        <UnderlineTabItem value="reports">Reports</UnderlineTabItem>
      </UnderlineTabs>

      {/* ─── Overview ──────────────────────────────────────── */}
      {activeTab === "overview" && (
        <StorePerformanceContext.Provider value={storePerformance}>
          <div className="space-y-6">
            {/* Performance KPIs with period selector */}
            {klaviyoConnected && <StorePerformanceKPIs />}

            {/* Info cards grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Store Info */}
              <Card className="rounded-[8px]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Informações da Loja</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {storeUrl && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">URL</span>
                      <span className="font-medium truncate ml-4">{storeUrl}</span>
                    </div>
                  )}
                  {platform && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Plataforma</span>
                      <Badge variant="neutral" showDot={false}>{platform}</Badge>
                    </div>
                  )}
                  {clientId && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Cliente</span>
                      <span className="font-medium">Vinculado</span>
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
              </Card>

              {/* Onboarding Status */}
              {onboardingStatus && (
                <Card className="rounded-[8px]">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">Status do Onboarding</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Fase</span>
                      <StatusBadge
                        status={onboardingStatus}
                      />
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
                      <StatusBadge
                        status={onboardingFormComplete ? "completed" : "pending"}
                        label={onboardingFormComplete ? "Preenchido" : "Pendente"}
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Briefing</span>
                      <StatusBadge
                        status={hasBriefing ? "completed" : "none"}
                        label={hasBriefing ? "Gerado" : "Não gerado"}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Integration Status - quick glance */}
              <Card className="rounded-[8px]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Integrações</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {["shopify", "klaviyo", "ga4"].map((key) => {
                    const status = integrationStatus[key]
                    const isConnected = status?.connected
                    const labels: Record<string, string> = { shopify: "Shopify", klaviyo: "Klaviyo", ga4: "Google Analytics" }
                    return (
                      <div key={key} className="flex justify-between items-center">
                        <span className="text-muted-foreground">{labels[key]}</span>
                        <StatusBadge
                          status={isConnected ? "connected" : status?.configured ? "error" : "inactive"}
                        />
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            </div>

            {/* Últimas campanhas (mini table, max 5) */}
            {klaviyoConnected && (
              <LatestCampaignsTable
                storeId={storeId}
                data={campaignsData as { campaigns: CampaignData[]; currency?: string } | undefined}
                loading={campaignsInitialLoading}
                currency={storeCurrency}
              />
            )}

            {/* Performance Tables (campaigns + flows) */}
            {klaviyoConnected && <StorePerformanceTables />}
          </div>
        </StorePerformanceContext.Provider>
      )}

      {/* ─── Integrações ───────────────────────────────────── */}
      {activeTab === "integrations" && (
        <IntegrationsPanel storeId={storeId} storeUrl={storeUrl} />
      )}

      {/* ─── Onboarding (resolve Problema #5) ─────────────── */}
      {activeTab === "onboarding" && (
        <div className="space-y-6">
          <Card className="rounded-[8px]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Progresso do Onboarding</CardTitle>
              <CardDescription>
                Acompanhe cada fase do onboarding desta loja
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OnboardingStepper storeId={storeId} />
            </CardContent>
          </Card>

          {/* Formulário de onboarding da loja */}
          <StoreFormTab storeId={storeId} clientId={clientId} />
        </div>
      )}

      {/* ─── Briefing ──────────────────────────────────────── */}
      {activeTab === "briefing" && (
        <StoreBriefingTab storeId={storeId} clientId={clientId} />
      )}

      {/* ─── Reports ───────────────────────────────────────── */}
      {activeTab === "reports" && (
        <KlaviyoPerformanceReport storeId={storeId} storeName={storeName} />
      )}
    </div>
  )
}

// --- Latest Campaigns Mini Table (max 5) ---
function LatestCampaignsTable({
  storeId: _storeId,
  data,
  loading,
  currency: storeCurrency,
}: {
  storeId: string
  data: { campaigns: CampaignData[]; currency?: string } | undefined
  loading: boolean
  currency?: string
}) {
  const currency = data?.currency || storeCurrency || "BRL"
  const campaigns = data?.campaigns?.slice(0, 5) || []

  if (loading) {
    return (
      <Card className="rounded-[8px]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Últimas Campanhas</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (campaigns.length === 0) return null

  return (
    <Card className="rounded-[8px]">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Últimas Campanhas</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50 dark:bg-[#242836]">
                <th className="text-left text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-500 dark:text-[#5C6378] px-4 py-2">Nome</th>
                <th className="text-left text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-500 dark:text-[#5C6378] px-4 py-2">Status</th>
                <th className="text-right text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-500 dark:text-[#5C6378] px-4 py-2">Enviados</th>
                <th className="text-right text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-500 dark:text-[#5C6378] px-4 py-2">Open Rate</th>
                <th className="text-right text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-500 dark:text-[#5C6378] px-4 py-2">Receita</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5 font-medium truncate max-w-[200px]">{c.name}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={c.status === "sent" ? "sent" : "draft"} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{(c.recipients || 0).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{(c.openRate || 0).toFixed(1)}%</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatCurrency(c.revenue || 0, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// --- Credentials Form (Integrations Tab) ---
