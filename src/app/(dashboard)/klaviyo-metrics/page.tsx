"use client"

import { useState, useEffect, useCallback } from "react"
import { useToast } from "@/lib/hooks/use-toast"
import {
  Search,
  RefreshCw,
  Store,
  TrendingUp,
  BarChart3,
  Bell,
  GitCompare,
  Trophy,
  Mail,
  MessageSquare,
  DollarSign,
  Users,
  MousePointer,
  Eye,
  AlertTriangle,
  AlertCircle,
  Info,
  Check,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { PermissionGate } from "@/components/permission-gate"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// Types
interface Campaign {
  id: string
  klaviyo_campaign_id: string
  name: string
  subject: string
  channel: string
  status: string
  send_time: string
  synced_at: string
  store: {
    id: string
    name: string
    url: string
  }
  client: {
    id: string
    name: string
  }
  metrics: {
    recipients: number
    delivered: number
    delivery_rate: number
    opened: number
    open_rate: number
    clicked: number
    click_rate: number
    conversions: number
    conversion_rate: number
    revenue: number
    revenue_per_recipient: number
    bounced: number
    bounce_rate: number
    unsubscribed: number
    unsubscribe_rate: number
  } | null
}

interface Alert {
  id: string
  alert_type: string
  severity: string
  title: string
  message: string
  metric_name: string
  previous_value: number
  current_value: number
  change_percentage: number
  is_read: boolean
  created_at: string
  campaign: {
    id: string
    name: string
    channel: string
  }
  store: {
    id: string
    name: string
  }
  client: {
    id: string
    name: string
  }
}

interface StoreInfo {
  id: string
  name: string
  client_name: string
  has_klaviyo: boolean
  campaign_count: number
}

interface CompareResult {
  search_term: string
  by_store: Array<{
    store_id: string
    store_name: string
    client_name: string
    campaigns: Array<{
      id: string
      name: string
      subject: string
      channel: string
      send_time: string
      metrics: Record<string, number>
    }>
    totals: {
      campaign_count: number
      total_recipients: number
      total_revenue: number
      avg_open_rate: number
      avg_click_rate: number
      avg_conversion_rate: number
    }
  }>
  totals: {
    total_stores: number
    total_campaigns: number
    total_recipients: number
    total_revenue: number
    avg_open_rate: number
    avg_click_rate: number
    avg_conversion_rate: number
  }
}

// Helper functions
function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toLocaleString("pt-BR")
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "-"
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getChannelIcon(channel: string) {
  return channel === "sms" ? MessageSquare : Mail
}

function getSeverityIcon(severity: string) {
  switch (severity) {
    case "critical":
      return AlertTriangle
    case "warning":
      return AlertCircle
    default:
      return Info
  }
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case "critical":
      return "text-red-500 bg-red-500/10"
    case "warning":
      return "text-yellow-500 bg-yellow-500/10"
    default:
      return "text-blue-500 bg-blue-500/10"
  }
}

export default function KlaviyoMetricsPage() {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("campaigns")
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  // Campaign search state
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedStore, setSelectedStore] = useState<string>("all")
  const [stores, setStores] = useState<StoreInfo[]>([])
  const [totalCampaigns, setTotalCampaigns] = useState(0)

  // Rankings state
  const [rankings, setRankings] = useState<Campaign[]>([])
  const [rankingMetric, setRankingMetric] = useState("revenue")

  // Compare state
  const [compareSearch, setCompareSearch] = useState("")
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null)
  const [comparing, setComparing] = useState(false)

  // Alerts state
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [alertCounts, setAlertCounts] = useState({ critical: 0, warning: 0, info: 0 })

  // Sync status
  const [syncStatus, setSyncStatus] = useState({
    total_stores: 0,
    total_campaigns: 0,
    last_sync: null as string | null,
  })

  // Selected campaign for details
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)

  // Fetch stores
  const fetchStores = useCallback(async () => {
    try {
      const response = await fetch("/api/klaviyo/sync")
      if (response.ok) {
        const data = await response.json()
        setStores(data.stores || [])
        setSyncStatus({
          total_stores: data.total_stores || 0,
          total_campaigns: data.total_campaigns || 0,
          last_sync: data.configs?.[0]?.last_sync_at || null,
        })
      }
    } catch (error) {
      console.error("Error fetching stores:", error)
    }
  }, [])

  // Fetch campaigns
  const fetchCampaigns = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchTerm) params.set("search", searchTerm)
      if (selectedStore !== "all") params.set("store_id", selectedStore)
      params.set("limit", "50")

      const response = await fetch(`/api/klaviyo/campaigns?${params}`)
      if (response.ok) {
        const data = await response.json()
        setCampaigns(data.campaigns || [])
        setTotalCampaigns(data.total || 0)
      }
    } catch (error) {
      console.error("Error fetching campaigns:", error)
    } finally {
      setLoading(false)
    }
  }, [searchTerm, selectedStore])

  // Fetch rankings
  const fetchRankings = useCallback(async () => {
    try {
      const response = await fetch(`/api/klaviyo/rankings?metric=${rankingMetric}&limit=10`)
      if (response.ok) {
        const data = await response.json()
        setRankings(data.rankings || [])
      }
    } catch (error) {
      console.error("Error fetching rankings:", error)
    }
  }, [rankingMetric])

  // Fetch alerts
  const fetchAlerts = useCallback(async () => {
    try {
      const response = await fetch("/api/klaviyo/alerts?limit=20")
      if (response.ok) {
        const data = await response.json()
        setAlerts(data.alerts || [])
        setAlertCounts(data.unread_counts || { critical: 0, warning: 0, info: 0 })
      }
    } catch (error) {
      console.error("Error fetching alerts:", error)
    }
  }, [])

  // Compare campaigns
  const handleCompare = async () => {
    if (!compareSearch.trim()) return

    setComparing(true)
    try {
      const response = await fetch(`/api/klaviyo/compare?name=${encodeURIComponent(compareSearch)}`)
      if (response.ok) {
        const data = await response.json()
        setCompareResult(data)
      }
    } catch (error) {
      console.error("Error comparing campaigns:", error)
    } finally {
      setComparing(false)
    }
  }

  // Sync all stores
  const handleSyncAll = async () => {
    setSyncing(true)
    try {
      const response = await fetch("/api/klaviyo/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      if (response.ok) {
        const data = await response.json()
        toast({ title: "Sincronização concluída!", description: `${data.result?.campaignsCreated || 0} campanhas criadas, ${data.result?.campaignsUpdated || 0} atualizadas` })
        fetchCampaigns()
        fetchStores()
        fetchRankings()
        fetchAlerts()
      } else {
        const error = await response.json()
        toast({ variant: "destructive", title: "Erro", description: error.error || "Erro ao sincronizar" })
      }
    } catch (error) {
      console.error("Error syncing:", error)
      toast({ variant: "destructive", title: "Erro", description: "Erro ao sincronizar" })
    } finally {
      setSyncing(false)
    }
  }

  // Sync single store
  const handleSyncStore = async (storeId: string) => {
    setSyncing(true)
    try {
      const response = await fetch("/api/klaviyo/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: storeId }),
      })

      if (response.ok) {
        const data = await response.json()
        toast({ title: "Sincronização concluída!", description: `${data.result?.created || 0} campanhas criadas, ${data.result?.updated || 0} atualizadas` })
        fetchCampaigns()
        fetchStores()
      } else {
        const error = await response.json()
        toast({ variant: "destructive", title: "Erro", description: error.error || "Erro ao sincronizar" })
      }
    } catch (error) {
      console.error("Error syncing store:", error)
      toast({ variant: "destructive", title: "Erro", description: "Erro ao sincronizar loja" })
    } finally {
      setSyncing(false)
    }
  }

  // Mark alert as read
  const handleMarkAlertRead = async (alertId: string) => {
    try {
      await fetch("/api/klaviyo/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert_ids: [alertId], action: "read" }),
      })
      fetchAlerts()
    } catch (error) {
      console.error("Error marking alert as read:", error)
    }
  }

  // Dismiss alert
  const handleDismissAlert = async (alertId: string) => {
    try {
      await fetch("/api/klaviyo/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert_ids: [alertId], action: "dismiss" }),
      })
      fetchAlerts()
    } catch (error) {
      console.error("Error dismissing alert:", error)
    }
  }

  // Initial load
  useEffect(() => {
    fetchStores()
    fetchAlerts()
  }, [fetchStores, fetchAlerts])

  useEffect(() => {
    fetchCampaigns()
  }, [fetchCampaigns])

  useEffect(() => {
    if (activeTab === "rankings") {
      fetchRankings()
    }
  }, [activeTab, fetchRankings])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === "campaigns") {
        fetchCampaigns()
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTerm, activeTab, fetchCampaigns])

  const totalAlerts = alertCounts.critical + alertCounts.warning + alertCounts.info

  return (
    <PermissionGate requiredFeatures={["campaign_view", "view_reports"]}>
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Métricas Klaviyo</h1>
          <p className="text-muted-foreground">
            Análise de campanhas de todas as lojas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-muted-foreground">
            {syncStatus.total_stores} lojas • {syncStatus.total_campaigns} campanhas
            {syncStatus.last_sync && (
              <> • Última sync: {formatDate(syncStatus.last_sync)}</>
            )}
          </div>
          <Button
            onClick={handleSyncAll}
            disabled={syncing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Sincronizar Tudo"}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-500/10">
                <Mail className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Campanhas</p>
                <p className="text-2xl font-bold">{formatNumber(syncStatus.total_campaigns)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-500/10">
                <Store className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Lojas Conectadas</p>
                <p className="text-2xl font-bold">{syncStatus.total_stores}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-purple-500/10">
                <Trophy className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Top Receita</p>
                <p className="text-2xl font-bold">
                  {rankings[0] ? formatCurrency(rankings[0].metrics?.revenue || 0) : "-"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${totalAlerts > 0 ? "bg-red-500/10" : "bg-gray-500/10"}`}>
                <Bell className={`h-6 w-6 ${totalAlerts > 0 ? "text-red-500" : "text-gray-500"}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Alertas</p>
                <p className="text-2xl font-bold">{totalAlerts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="campaigns" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Campanhas
          </TabsTrigger>
          <TabsTrigger value="rankings" className="gap-2">
            <Trophy className="h-4 w-4" />
            Rankings
          </TabsTrigger>
          <TabsTrigger value="compare" className="gap-2">
            <GitCompare className="h-4 w-4" />
            Comparar
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2">
            <Bell className="h-4 w-4" />
            Alertas
            {totalAlerts > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5">
                {totalAlerts}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col gap-4 md:flex-row">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome da campanha..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={selectedStore} onValueChange={setSelectedStore}>
                  <SelectTrigger className="w-[250px]">
                    <SelectValue placeholder="Todas as lojas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as lojas</SelectItem>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name} ({store.campaign_count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedStore !== "all" && (
                  <Button
                    variant="outline"
                    onClick={() => handleSyncStore(selectedStore)}
                    disabled={syncing}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
                    Sincronizar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          <Card>
            <CardHeader>
              <CardTitle>
                {totalCampaigns} Campanhas Encontradas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : campaigns.length === 0 ? (
                <div className="text-center py-12">
                  <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    {searchTerm
                      ? "Nenhuma campanha encontrada com esse termo"
                      : "Nenhuma campanha sincronizada ainda. Clique em 'Sincronizar Tudo' para começar."}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campanha</TableHead>
                      <TableHead>Loja</TableHead>
                      <TableHead className="text-right">Enviados</TableHead>
                      <TableHead className="text-right">Abertura</TableHead>
                      <TableHead className="text-right">Cliques</TableHead>
                      <TableHead className="text-right">Conversão</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                      <TableHead>Data Envio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map((campaign) => {
                      const ChannelIcon = getChannelIcon(campaign.channel)
                      return (
                        <TableRow
                          key={campaign.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedCampaign(campaign)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-primary/10">
                                <ChannelIcon className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <p className="font-medium truncate max-w-[200px]">
                                  {campaign.name}
                                </p>
                                <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  {campaign.subject}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{campaign.store?.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {campaign.client?.name}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {campaign.metrics ? formatNumber(campaign.metrics.recipients) : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {campaign.metrics ? `${campaign.metrics.open_rate.toFixed(1)}%` : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {campaign.metrics ? `${campaign.metrics.click_rate.toFixed(1)}%` : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {campaign.metrics
                              ? `${campaign.metrics.conversion_rate.toFixed(2)}%`
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {campaign.metrics
                              ? formatCurrency(campaign.metrics.revenue)
                              : "-"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(campaign.send_time)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rankings Tab */}
        <TabsContent value="rankings" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Top 10 Campanhas</CardTitle>
                  <CardDescription>
                    Melhores campanhas por {rankingMetric === "revenue" ? "receita" : rankingMetric === "open_rate" ? "taxa de abertura" : rankingMetric === "click_rate" ? "taxa de cliques" : "taxa de conversão"}
                  </CardDescription>
                </div>
                <Select value={rankingMetric} onValueChange={setRankingMetric}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="revenue">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Receita
                      </div>
                    </SelectItem>
                    <SelectItem value="open_rate">
                      <div className="flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        Taxa de Abertura
                      </div>
                    </SelectItem>
                    <SelectItem value="click_rate">
                      <div className="flex items-center gap-2">
                        <MousePointer className="h-4 w-4" />
                        Taxa de Cliques
                      </div>
                    </SelectItem>
                    <SelectItem value="conversion_rate">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Taxa de Conversão
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {rankings.length === 0 ? (
                <div className="text-center py-12">
                  <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    Nenhuma campanha com dados de performance encontrada
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {rankings.map((campaign, index) => {
                    const ChannelIcon = getChannelIcon(campaign.channel)
                    const metricValue =
                      rankingMetric === "revenue"
                        ? campaign.metrics?.revenue || 0
                        : rankingMetric === "open_rate"
                        ? campaign.metrics?.open_rate || 0
                        : rankingMetric === "click_rate"
                        ? campaign.metrics?.click_rate || 0
                        : campaign.metrics?.conversion_rate || 0

                    return (
                      <div
                        key={campaign.id}
                        className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50 cursor-pointer"
                        onClick={() => setSelectedCampaign(campaign)}
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                            index === 0
                              ? "bg-yellow-500 text-yellow-950"
                              : index === 1
                              ? "bg-gray-300 text-gray-800"
                              : index === 2
                              ? "bg-amber-600 text-amber-950"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {index + 1}
                        </div>
                        <div className="p-2 rounded-lg bg-primary/10">
                          <ChannelIcon className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{campaign.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {campaign.store?.name} • {campaign.client?.name}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold">
                            {rankingMetric === "revenue"
                              ? formatCurrency(metricValue)
                              : `${metricValue.toFixed(1)}%`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatNumber(campaign.metrics?.recipients || 0)} enviados
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Compare Tab */}
        <TabsContent value="compare" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Comparar Campanhas Entre Lojas</CardTitle>
              <CardDescription>
                Busque por nome da campanha e veja a performance em todas as lojas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder='Ex: "Black Friday", "Dia das Mães", "Welcome"...'
                    value={compareSearch}
                    onChange={(e) => setCompareSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCompare()}
                    className="pl-10"
                  />
                </div>
                <Button onClick={handleCompare} disabled={comparing || !compareSearch.trim()}>
                  {comparing ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <GitCompare className="h-4 w-4 mr-2" />
                  )}
                  Comparar
                </Button>
              </div>
            </CardContent>
          </Card>

          {compareResult && (
            <>
              {/* Totals */}
              <Card>
                <CardHeader>
                  <CardTitle>
                    Resultados para &quot;{compareResult.search_term}&quot;
                  </CardTitle>
                  <CardDescription>
                    {compareResult.totals.total_campaigns} campanhas em{" "}
                    {compareResult.totals.total_stores} lojas
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-5">
                    <div className="text-center p-4 rounded-lg bg-muted/50">
                      <p className="text-2xl font-bold">
                        {formatNumber(compareResult.totals.total_recipients)}
                      </p>
                      <p className="text-sm text-muted-foreground">Total Enviados</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-muted/50">
                      <p className="text-2xl font-bold text-green-500">
                        {formatCurrency(compareResult.totals.total_revenue)}
                      </p>
                      <p className="text-sm text-muted-foreground">Receita Total</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-muted/50">
                      <p className="text-2xl font-bold">
                        {compareResult.totals.avg_open_rate.toFixed(1)}%
                      </p>
                      <p className="text-sm text-muted-foreground">Média Abertura</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-muted/50">
                      <p className="text-2xl font-bold">
                        {compareResult.totals.avg_click_rate.toFixed(1)}%
                      </p>
                      <p className="text-sm text-muted-foreground">Média Cliques</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-muted/50">
                      <p className="text-2xl font-bold">
                        {compareResult.totals.avg_conversion_rate.toFixed(2)}%
                      </p>
                      <p className="text-sm text-muted-foreground">Média Conversão</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* By Store */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {compareResult.by_store.map((store) => (
                  <Card key={store.store_id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">{store.store_name}</CardTitle>
                      <CardDescription>{store.client_name}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Campanhas:</span>
                          <span className="font-medium">{store.totals.campaign_count}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Enviados:</span>
                          <span className="font-medium">
                            {formatNumber(store.totals.total_recipients)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Receita:</span>
                          <span className="font-medium text-green-500">
                            {formatCurrency(store.totals.total_revenue)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Taxa Abertura:</span>
                          <span className="font-medium">
                            {store.totals.avg_open_rate.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Taxa Cliques:</span>
                          <span className="font-medium">
                            {store.totals.avg_click_rate.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Taxa Conversão:</span>
                          <span className="font-medium">
                            {store.totals.avg_conversion_rate.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}

          {!compareResult && (
            <div className="text-center py-12">
              <GitCompare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Digite o nome de uma campanha para comparar os resultados entre lojas
              </p>
            </div>
          )}
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Alertas de Performance</CardTitle>
                  <CardDescription>
                    Notificações sobre mudanças significativas nas métricas
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {alertCounts.critical > 0 && (
                    <Badge variant="destructive">{alertCounts.critical} críticos</Badge>
                  )}
                  {alertCounts.warning > 0 && (
                    <Badge variant="outline" className="border-yellow-500 text-yellow-500">
                      {alertCounts.warning} avisos
                    </Badge>
                  )}
                  {alertCounts.info > 0 && (
                    <Badge variant="secondary">{alertCounts.info} info</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <div className="text-center py-12">
                  <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    Nenhum alerta no momento. Tudo está funcionando bem!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts.map((alert) => {
                    const SeverityIcon = getSeverityIcon(alert.severity)
                    const severityColor = getSeverityColor(alert.severity)

                    return (
                      <div
                        key={alert.id}
                        className={`flex items-start gap-4 p-4 rounded-lg border ${
                          !alert.is_read ? "bg-muted/30" : ""
                        }`}
                      >
                        <div className={`p-2 rounded-lg ${severityColor}`}>
                          <SeverityIcon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium">{alert.title}</p>
                            {!alert.is_read && (
                              <Badge variant="secondary" className="text-xs">
                                Novo
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {alert.message}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>{alert.campaign?.name}</span>
                            <span>•</span>
                            <span>{alert.store?.name}</span>
                            <span>•</span>
                            <span>{formatDate(alert.created_at)}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {!alert.is_read && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleMarkAlertRead(alert.id)}
                              title="Marcar como lido"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDismissAlert(alert.id)}
                            title="Dispensar"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Campaign Detail Modal */}
      <Dialog open={!!selectedCampaign} onOpenChange={() => setSelectedCampaign(null)}>
        <DialogContent className="max-w-2xl">
          {selectedCampaign && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  {(() => {
                    const ChannelIcon = getChannelIcon(selectedCampaign.channel)
                    return (
                      <div className="p-2 rounded-lg bg-primary/10">
                        <ChannelIcon className="h-5 w-5 text-primary" />
                      </div>
                    )
                  })()}
                  {selectedCampaign.name}
                </DialogTitle>
                <DialogDescription>
                  {selectedCampaign.store?.name} • {selectedCampaign.client?.name}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6">
                {/* Subject */}
                {selectedCampaign.subject && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Assunto</p>
                    <p className="font-medium">{selectedCampaign.subject}</p>
                  </div>
                )}

                {/* Metrics Grid */}
                {selectedCampaign.metrics && (
                  <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                    <div className="p-4 rounded-lg bg-muted/50 text-center">
                      <Users className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-xl font-bold">
                        {formatNumber(selectedCampaign.metrics.recipients)}
                      </p>
                      <p className="text-xs text-muted-foreground">Enviados</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50 text-center">
                      <Eye className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-xl font-bold">
                        {selectedCampaign.metrics.open_rate.toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">Abertura</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50 text-center">
                      <MousePointer className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-xl font-bold">
                        {selectedCampaign.metrics.click_rate.toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">Cliques</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50 text-center">
                      <DollarSign className="h-5 w-5 mx-auto mb-2 text-green-500" />
                      <p className="text-xl font-bold text-green-500">
                        {formatCurrency(selectedCampaign.metrics.revenue)}
                      </p>
                      <p className="text-xs text-muted-foreground">Receita</p>
                    </div>
                  </div>
                )}

                {/* Detailed Metrics */}
                {selectedCampaign.metrics && (
                  <div className="grid gap-3 grid-cols-2">
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Entregues</span>
                      <span className="font-medium">
                        {formatNumber(selectedCampaign.metrics.delivered)} (
                        {selectedCampaign.metrics.delivery_rate.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Conversões</span>
                      <span className="font-medium">
                        {selectedCampaign.metrics.conversions} (
                        {selectedCampaign.metrics.conversion_rate.toFixed(2)}%)
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Bounces</span>
                      <span className={`font-medium ${selectedCampaign.metrics.bounce_rate > 5 ? "text-red-500" : ""}`}>
                        {selectedCampaign.metrics.bounced} (
                        {selectedCampaign.metrics.bounce_rate.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Descadastros</span>
                      <span className={`font-medium ${selectedCampaign.metrics.unsubscribe_rate > 1 ? "text-red-500" : ""}`}>
                        {selectedCampaign.metrics.unsubscribed} (
                        {selectedCampaign.metrics.unsubscribe_rate.toFixed(2)}%)
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Receita/Recipient</span>
                      <span className="font-medium">
                        {formatCurrency(selectedCampaign.metrics.revenue_per_recipient)}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Data de Envio</span>
                      <span className="font-medium">
                        {formatDate(selectedCampaign.send_time)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Sync Info */}
                <div className="text-xs text-muted-foreground">
                  Última sincronização: {formatDate(selectedCampaign.synced_at)}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </PermissionGate>
  )
}
