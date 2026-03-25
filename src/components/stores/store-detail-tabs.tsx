"use client"

import { useState, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { format } from "date-fns"
import {
  Loader2,
  Save,
  Eye,
  EyeOff,
} from "lucide-react"
import { UnderlineTabs, UnderlineTabItem } from "@/components/ui/underline-tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { KlaviyoPerformanceReport } from "@/components/clients/klaviyo-performance-report"
import { formatCurrency } from "@/lib/utils"
import { useKlaviyoCampaigns, useKlaviyoFlows } from "@/lib/hooks/use-api-data"
import { StoreBriefingTab } from "@/components/stores/store-briefing-tab"
import { StoreFormTab } from "@/components/stores/store-form-tab"
import { StorePerformanceKPIs } from "@/components/stores/store-performance-kpis"
import { StorePerformanceTables } from "@/components/stores/store-performance-tables"
import { useStorePerformance, StorePerformanceContext } from "@/lib/hooks/use-store-performance"
import { toast } from "@/lib/hooks/use-toast"
import { OnboardingStepper } from "@/components/stores/onboarding-stepper"
import { IntegrationCardsGrid } from "@/components/stores/integration-card"
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
  driveFolderUrl: _driveFolderUrl,
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
        <div className="space-y-6">
          <IntegrationCardsGrid
            storeId={storeId}
            integrationStatus={integrationStatus}
            storeUrl={storeUrl}
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: Record<string, any> = { store_id: storeId }

      if (form.shopify_store_domain.trim()) payload.shopify_store_domain = form.shopify_store_domain.trim()
      if (form.shopify_access_token.trim()) payload.shopify_access_token = form.shopify_access_token.trim()
      if (form.klaviyo_public_key.trim()) payload.klaviyo_public_key = form.klaviyo_public_key.trim()
      if (form.klaviyo_private_key.trim()) payload.klaviyo_private_key = form.klaviyo_private_key.trim()
      if (form.klaviyo_list_id.trim()) payload.klaviyo_list_id = form.klaviyo_list_id.trim()
      if (form.ga4_property_id.trim()) payload.ga4_property_id = form.ga4_property_id.trim()
      if (form.ga4_credentials_json.trim()) {
        try {
          payload.ga4_credentials = JSON.parse(form.ga4_credentials_json.trim())
        } catch {
          toast({ variant: "destructive", title: "JSON inválido", description: "As credenciais do Google Analytics devem ser um JSON válido" })
          setIsSaving(false)
          return
        }
      }

      if (Object.keys(payload).length <= 1) {
        toast({ variant: "destructive", title: "Nenhum campo preenchido", description: "Preencha ao menos um campo de credencial para salvar." })
        setIsSaving(false)
        return
      }

      const response = await fetch("/api/client-stores/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Erro ao salvar credenciais")
      }

      toast({ title: "Credenciais salvas", description: "As credenciais foram atualizadas com sucesso." })
      setForm({ ...EMPTY_CREDENTIALS })
      onSaved()
    } catch (error) {
      toast({ variant: "destructive", title: "Erro ao salvar", description: error instanceof Error ? error.message : "Erro desconhecido" })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card className="rounded-[8px]">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Credenciais de Integração</CardTitle>
        <CardDescription>
          Configure as credenciais das integrações desta loja. Campos sensíveis são criptografados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Shopify Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              Integração Shopify
            </h4>
            <Badge variant={shopifyConfigured ? "positive" : "neutral"} className="text-xs">
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
              <p className="text-xs text-muted-foreground">Domínio .myshopify.com da sua loja</p>
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
            </div>
          </div>
        </div>

        {/* Klaviyo Section */}
        <div className="border-t pt-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              Integração Klaviyo
            </h4>
            <Badge variant={klaviyoConfigured ? "positive" : "neutral"} className="text-xs">
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
            <h4 className="text-sm font-semibold flex items-center gap-2">
              Integração Google Analytics (GA4)
            </h4>
            <Badge variant={ga4Configured ? "positive" : "neutral"} className="text-xs">
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
            </div>

            <div className="space-y-2">
              <Label>Service Account Credentials (JSON)</Label>
              <textarea
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono text-xs"
                placeholder='{"type": "service_account", "project_id": "...", ...}'
                value={form.ga4_credentials_json}
                onChange={(e) => setForm({ ...form, ga4_credentials_json: e.target.value })}
              />
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
