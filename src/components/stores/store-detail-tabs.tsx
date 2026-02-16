"use client"

import { useState, useEffect, useCallback } from "react"
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
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { KlaviyoPerformanceReport } from "@/components/clients/klaviyo-performance-report"

interface StoreDetailTabsProps {
  storeId: string
  storeName: string
  storeUrl?: string | null
  platform?: string | null
  niche?: string | null
  country?: string | null
  language?: string | null
  integrationStatus: Record<string, { connected: boolean; connected_at?: string }>
  clientId: string
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

type Period = "7d" | "30d" | "90d" | "all"

export function StoreDetailTabs({
  storeId,
  storeName,
  storeUrl,
  platform,
  niche,
  country,
  language,
  integrationStatus,
}: StoreDetailTabsProps) {
  const [campaignsData, setCampaignsData] = useState<{ summary: Record<string, number>; campaigns: CampaignData[] } | null>(null)
  const [flowsData, setFlowsData] = useState<{ summary: Record<string, number>; flows: FlowData[] } | null>(null)
  const [campaignsLoading, setCampaignsLoading] = useState(false)
  const [flowsLoading, setFlowsLoading] = useState(false)
  const [period, setPeriod] = useState<Period>("30d")

  const klaviyoConnected = integrationStatus.klaviyo?.connected || false

  const fetchCampaigns = useCallback(async () => {
    if (!klaviyoConnected) return
    setCampaignsLoading(true)
    try {
      const res = await fetch(`/api/integrations/klaviyo/campaigns?store_id=${storeId}&period=${period}`)
      const data = await res.json()
      if (data.success !== false) {
        setCampaignsData({ summary: data.summary, campaigns: data.campaigns || [] })
      }
    } catch { /* ignore */ } finally {
      setCampaignsLoading(false)
    }
  }, [storeId, period, klaviyoConnected])

  const fetchFlows = useCallback(async () => {
    if (!klaviyoConnected) return
    setFlowsLoading(true)
    try {
      const res = await fetch(`/api/integrations/klaviyo/flows?store_id=${storeId}&period=${period}`)
      const data = await res.json()
      if (data.success !== false) {
        setFlowsData({ summary: data.summary, flows: data.flows || [] })
      }
    } catch { /* ignore */ } finally {
      setFlowsLoading(false)
    }
  }, [storeId, period, klaviyoConnected])

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
        <TabsTrigger value="settings">
          <Settings className="h-4 w-4 mr-2" />
          Configurações
        </TabsTrigger>
      </TabsList>

      {/* Overview */}
      <TabsContent value="overview">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Store Info */}
          <Card>
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
          </Card>

          {/* Integration Status */}
          <Card className="md:col-span-2">
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
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-3 p-3 rounded-lg border"
                    >
                      {connected ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
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
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* Campaigns */}
      <TabsContent value="campaigns">
        <CampaignsTab
          data={campaignsData}
          loading={campaignsLoading}
          period={period}
          setPeriod={setPeriod}
          onLoad={fetchCampaigns}
        />
      </TabsContent>

      {/* Flows */}
      <TabsContent value="flows">
        <FlowsTab
          data={flowsData}
          loading={flowsLoading}
          period={period}
          setPeriod={setPeriod}
          onLoad={fetchFlows}
        />
      </TabsContent>

      {/* Report */}
      <TabsContent value="report">
        <KlaviyoPerformanceReport storeId={storeId} storeName={storeName} />
      </TabsContent>

      {/* Settings */}
      <TabsContent value="settings">
        <Card>
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
    </Tabs>
  )
}

// --- Campaigns Tab Component ---
function CampaignsTab({
  data,
  loading,
  period,
  setPeriod,
  onLoad,
}: {
  data: { summary: Record<string, number>; campaigns: CampaignData[] } | null
  loading: boolean
  period: Period
  setPeriod: (p: Period) => void
  onLoad: () => void
}) {
  useEffect(() => {
    if (!data && !loading) onLoad()
  }, [data, loading, onLoad])

  if (loading) {
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
            onChange={(e) => {
              setPeriod(e.target.value as Period)
              // Will refetch on next render
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="7d">7 dias</option>
            <option value="30d">30 dias</option>
            <option value="90d">90 dias</option>
            <option value="all">Tudo</option>
          </select>
          <Button variant="outline" size="sm" onClick={onLoad}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Atualizar
          </Button>
        </div>
      </div>

      {data?.summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Campanhas Enviadas" value={data.summary.sentCampaigns || data.summary.totalCampaigns || 0} />
          <MetricCard label="Total Receita" value={`R$ ${(data.summary.totalRevenue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
          <MetricCard label="Taxa de Abertura" value={`${(data.summary.avgOpenRate || 0).toFixed(1)}%`} />
          <MetricCard label="Taxa de Clique" value={`${(data.summary.avgClickRate || 0).toFixed(1)}%`} />
        </div>
      )}

      {data?.campaigns && data.campaigns.length > 0 ? (
        <Card>
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
                      <td className="py-2 text-right">{(c.openRate || 0).toFixed(1)}%</td>
                      <td className="py-2 text-right">{(c.clickRate || 0).toFixed(1)}%</td>
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
  period,
  setPeriod,
  onLoad,
}: {
  data: { summary: Record<string, number>; flows: FlowData[] } | null
  loading: boolean
  period: Period
  setPeriod: (p: Period) => void
  onLoad: () => void
}) {
  useEffect(() => {
    if (!data && !loading) onLoad()
  }, [data, loading, onLoad])

  if (loading) {
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
          <Button variant="outline" size="sm" onClick={onLoad}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Atualizar
          </Button>
        </div>
      </div>

      {data?.summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Flows Ativos" value={data.summary.liveFlows || data.summary.totalFlows || 0} />
          <MetricCard label="Total Receita" value={`R$ ${(data.summary.totalRevenue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
          <MetricCard label="Taxa de Abertura" value={`${(data.summary.avgOpenRate || 0).toFixed(1)}%`} />
          <MetricCard label="Taxa de Clique" value={`${(data.summary.avgClickRate || 0).toFixed(1)}%`} />
        </div>
      )}

      {data?.flows && data.flows.length > 0 ? (
        <Card>
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
                      <td className="py-2 text-right">{(f.openRate || 0).toFixed(1)}%</td>
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

// --- Metric Card ---
function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  )
}
