"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Search,
  RefreshCw,
  Store,
  TrendingUp,
  DollarSign,
  Users,
  MousePointer,
  Eye,
  Mail,
  Send,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  Download,
  MessageSquare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import { cn, formatCurrency } from "@/lib/utils"

interface CampaignMetrics {
  id: string
  name: string
  status: string
  sendTime: string | null
  createdAt: string
  channel: string
  subject: string | null
  recipients: number
  delivered: number
  deliveryRate: number
  opened: number
  openRate: number
  clicked: number
  clickRate: number
  clickToOpenRate: number
  conversions: number
  conversionRate: number
  conversionValue: number
  revenuePerRecipient: number
  averageOrderValue: number
  bounced: number
  bounceRate: number
  unsubscribed: number
  unsubscribeRate: number
  spamComplaints: number
}

interface CampaignsResponse {
  success: boolean
  period: {
    start: string
    end: string
    label: string
  }
  currency: string
  summary: {
    totalCampaigns: number
    sentCampaigns: number
    scheduledCampaigns: number
    draftCampaigns: number
    cancelledCampaigns: number
    emailCampaigns: number
    smsCampaigns: number
    totalRecipients: number
    totalDelivered: number
    totalOpened: number
    totalClicked: number
    totalConversions: number
    totalRevenue: number
    totalBounced: number
    totalUnsubscribed: number
    totalSpamComplaints: number
    avgOpenRate: number
    avgClickRate: number
    avgConversionRate: number
    avgBounceRate: number
    revenuePerRecipient: number
  }
  campaigns: CampaignMetrics[]
  error?: string
}

interface ClientStore {
  id: string
  store_name: string
  store_url: string
  klaviyo_api_key: string | null
  klaviyo_private_key: string | null
  client: {
    id: string
    name: string
  } | null
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  className
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  className?: string
}) {
  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
              <p className="text-2xl font-bold">{value}</p>
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function CampaignStatusBadge({ status }: { status: string }) {
  const variants: Record<string, { label: string; className: string }> = {
    sent: { label: "Enviada", className: "bg-green-500/10 text-green-600 border-green-500/30" },
    scheduled: { label: "Agendada", className: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
    draft: { label: "Rascunho", className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30" },
    cancelled: { label: "Cancelada", className: "bg-red-500/10 text-red-600 border-red-500/30" },
  }

  const variant = variants[status] || { label: status, className: "" }

  return (
    <Badge variant="outline" className={variant.className}>
      {variant.label}
    </Badge>
  )
}

function ChannelBadge({ channel }: { channel: string }) {
  return channel === "sms" ? (
    <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/30">
      <MessageSquare className="h-3 w-3 mr-1" />
      SMS
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">
      <Mail className="h-3 w-3 mr-1" />
      Email
    </Badge>
  )
}

function formatPercent(value: number | undefined | null): string {
  if (value === undefined || value === null) return "0%"
  return `${value.toFixed(1)}%`
}

function formatNumber(value: number | undefined | null): string {
  if (value === undefined || value === null) return "0"
  return new Intl.NumberFormat('pt-BR').format(value)
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "-"
  try {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
  } catch {
    return dateString
  }
}

export default function KlaviyoCampaignsPage() {
  const [stores, setStores] = useState<ClientStore[]>([])
  const [selectedStore, setSelectedStore] = useState<string>("")
  const [period, setPeriod] = useState("30d")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [channelFilter, setChannelFilter] = useState<string>("all")
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingStores, setIsLoadingStores] = useState(true)
  const [campaignsData, setCampaignsData] = useState<CampaignsResponse | null>(null)

  // Load stores with Klaviyo integration
  useEffect(() => {
    async function loadStores() {
      setIsLoadingStores(true)
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("client_stores")
          .select(`
            id,
            store_name,
            store_url,
            klaviyo_api_key,
            klaviyo_private_key,
            client:clients (id, name)
          `)
          .not("klaviyo_api_key", "is", null)
          .order("store_name")

        if (error) throw error

        const storesWithKlaviyo = (data || []).filter(
          (s) => s.klaviyo_api_key || s.klaviyo_private_key
        ) as ClientStore[]

        setStores(storesWithKlaviyo)
        if (storesWithKlaviyo.length > 0 && !selectedStore) {
          setSelectedStore(storesWithKlaviyo[0].id)
        }
      } catch (error) {
        console.error("Error loading stores:", error)
        toast({
          variant: "destructive",
          title: "Erro ao carregar lojas",
          description: "Não foi possível carregar as lojas com Klaviyo configurado.",
        })
      } finally {
        setIsLoadingStores(false)
      }
    }

    loadStores()
  }, [])

  // Load campaigns data
  const loadCampaigns = useCallback(async () => {
    if (!selectedStore) return

    setIsLoading(true)
    try {
      const response = await fetch(
        `/api/integrations/klaviyo/campaigns?store_id=${selectedStore}&period=${period}`
      )
      const data: CampaignsResponse = await response.json()

      if (!data.success) {
        throw new Error(data.error || "Erro ao buscar campanhas")
      }

      setCampaignsData(data)
    } catch (error) {
      console.error("Error loading campaigns:", error)
      toast({
        variant: "destructive",
        title: "Erro ao carregar campanhas",
        description: error instanceof Error ? error.message : "Não foi possível carregar as campanhas.",
      })
    } finally {
      setIsLoading(false)
    }
  }, [selectedStore, period])

  useEffect(() => {
    if (selectedStore) {
      loadCampaigns()
    }
  }, [selectedStore, period, loadCampaigns])

  // Filter campaigns
  const filteredCampaigns = campaignsData?.campaigns.filter((campaign) => {
    const matchesSearch = campaign.name.toLowerCase().includes(search.toLowerCase()) ||
      (campaign.subject && campaign.subject.toLowerCase().includes(search.toLowerCase()))
    const matchesStatus = statusFilter === "all" || campaign.status === statusFilter
    const matchesChannel = channelFilter === "all" || campaign.channel === channelFilter
    return matchesSearch && matchesStatus && matchesChannel
  }) || []

  // Export to CSV
  const exportToCsv = () => {
    if (!campaignsData?.campaigns.length) return

    const headers = [
      "Nome",
      "Assunto",
      "Status",
      "Canal",
      "Data Envio",
      "Destinatários",
      "Entregues",
      "Taxa Entrega",
      "Aberturas",
      "Taxa Abertura",
      "Cliques",
      "Taxa Clique",
      "Conversões",
      "Taxa Conversão",
      "Receita",
      "RPR",
      "Bounces",
      "Descadastros"
    ]

    const rows = filteredCampaigns.map((campaign) => [
      campaign.name,
      campaign.subject || "",
      campaign.status,
      campaign.channel,
      campaign.sendTime || "",
      campaign.recipients,
      campaign.delivered,
      `${campaign.deliveryRate.toFixed(1)}%`,
      campaign.opened,
      `${campaign.openRate.toFixed(1)}%`,
      campaign.clicked,
      `${campaign.clickRate.toFixed(1)}%`,
      campaign.conversions,
      `${campaign.conversionRate.toFixed(1)}%`,
      campaign.conversionValue.toFixed(2),
      campaign.revenuePerRecipient.toFixed(2),
      campaign.bounced,
      campaign.unsubscribed
    ])

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map(v => `"${v}"`).join(","))
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `klaviyo-campaigns-${period}-${new Date().toISOString().split("T")[0]}.csv`
    link.click()
  }

  const selectedStoreData = stores.find((s) => s.id === selectedStore)
  const currency = campaignsData?.currency || "BRL"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Send className="h-6 w-6 text-primary" />
            Campanhas do Klaviyo
          </h1>
          <p className="text-muted-foreground">
            Analise o desempenho de todas as suas campanhas de email e SMS
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadCampaigns}
            disabled={isLoading || !selectedStore}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCsv}
            disabled={!campaignsData?.campaigns.length}
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center flex-wrap">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-muted-foreground" />
          <Select
            value={selectedStore}
            onValueChange={setSelectedStore}
            disabled={isLoadingStores}
          >
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Selecione uma loja" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((store) => (
                <SelectItem key={store.id} value={store.id}>
                  <div className="flex flex-col">
                    <span>{store.store_name}</span>
                    {store.client && (
                      <span className="text-xs text-muted-foreground">
                        {store.client.name}
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="90d">Últimos 90 dias</SelectItem>
            <SelectItem value="12m">Últimos 12 meses</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="sent">Enviadas</SelectItem>
            <SelectItem value="scheduled">Agendadas</SelectItem>
            <SelectItem value="draft">Rascunhos</SelectItem>
          </SelectContent>
        </Select>

        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 md:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar campanhas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : campaignsData?.summary ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Receita Total"
            value={formatCurrency(campaignsData.summary.totalRevenue, currency)}
            subtitle={`${campaignsData.summary.totalConversions} conversões`}
            icon={DollarSign}
          />
          <MetricCard
            title="Campanhas Enviadas"
            value={campaignsData.summary.sentCampaigns}
            subtitle={`${campaignsData.summary.emailCampaigns} email, ${campaignsData.summary.smsCampaigns} SMS`}
            icon={Send}
          />
          <MetricCard
            title="Destinatários"
            value={formatNumber(campaignsData.summary.totalRecipients)}
            subtitle={`${formatNumber(campaignsData.summary.totalDelivered)} entregues`}
            icon={Users}
          />
          <MetricCard
            title="RPR"
            value={formatCurrency(campaignsData.summary.revenuePerRecipient, currency)}
            subtitle="Receita por destinatário"
            icon={TrendingUp}
          />
          <MetricCard
            title="Taxa de Abertura"
            value={formatPercent(campaignsData.summary.avgOpenRate)}
            subtitle={`${formatNumber(campaignsData.summary.totalOpened)} aberturas`}
            icon={Eye}
          />
          <MetricCard
            title="Taxa de Clique"
            value={formatPercent(campaignsData.summary.avgClickRate)}
            subtitle={`${formatNumber(campaignsData.summary.totalClicked)} cliques`}
            icon={MousePointer}
          />
          <MetricCard
            title="Taxa de Conversão"
            value={formatPercent(campaignsData.summary.avgConversionRate)}
            subtitle="Média geral"
            icon={TrendingUp}
          />
          <MetricCard
            title="Taxa de Bounce"
            value={formatPercent(campaignsData.summary.avgBounceRate)}
            subtitle={`${formatNumber(campaignsData.summary.totalBounced)} bounces`}
            icon={Mail}
          />
        </div>
      ) : null}

      {/* Campaigns Table */}
      <Card>
        <CardHeader>
          <CardTitle>Desempenho por Campanha</CardTitle>
          <CardDescription>
            {filteredCampaigns.length} campanhas encontradas
            {selectedStoreData && ` em ${selectedStoreData.store_name}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Send className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Nenhuma campanha encontrada</p>
              {search && (
                <p className="text-sm mt-2">
                  Tente ajustar os filtros de busca
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[250px]">Campanha</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Entregues</TableHead>
                    <TableHead className="text-right">Abertura</TableHead>
                    <TableHead className="text-right">Clique</TableHead>
                    <TableHead className="text-right">Conversão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCampaigns.map((campaign) => (
                    <TableRow key={campaign.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{campaign.name}</p>
                          {campaign.subject && (
                            <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                              {campaign.subject}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <CampaignStatusBadge status={campaign.status} />
                      </TableCell>
                      <TableCell>
                        <ChannelBadge channel={campaign.channel} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(campaign.sendTime)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(campaign.conversionValue, currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(campaign.delivered)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn(
                          campaign.openRate > 40 ? "text-green-600" :
                          campaign.openRate > 25 ? "text-yellow-600" :
                          "text-muted-foreground"
                        )}>
                          {formatPercent(campaign.openRate)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn(
                          campaign.clickRate > 5 ? "text-green-600" :
                          campaign.clickRate > 2 ? "text-yellow-600" :
                          "text-muted-foreground"
                        )}>
                          {formatPercent(campaign.clickRate)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn(
                          campaign.conversionRate > 3 ? "text-green-600" :
                          campaign.conversionRate > 1 ? "text-yellow-600" :
                          "text-muted-foreground"
                        )}>
                          {formatPercent(campaign.conversionRate)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Campaigns */}
      {campaignsData?.campaigns && campaignsData.campaigns.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Top 5 Campanhas por Receita</CardTitle>
              <CardDescription>
                As campanhas que mais geraram receita no período
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {campaignsData.campaigns
                  .filter(c => c.status === 'sent')
                  .sort((a, b) => b.conversionValue - a.conversionValue)
                  .slice(0, 5)
                  .map((campaign, index) => (
                    <div
                      key={campaign.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-medium">{campaign.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {campaign.conversions} conversões
                          </p>
                        </div>
                      </div>
                      <p className="font-bold text-green-600">
                        {formatCurrency(campaign.conversionValue, currency)}
                      </p>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top 5 Campanhas por Engajamento</CardTitle>
              <CardDescription>
                As campanhas com melhores taxas de abertura
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {campaignsData.campaigns
                  .filter(c => c.status === 'sent' && c.delivered > 100)
                  .sort((a, b) => b.openRate - a.openRate)
                  .slice(0, 5)
                  .map((campaign, index) => (
                    <div
                      key={campaign.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-medium">{campaign.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatNumber(campaign.delivered)} entregues
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-blue-600">
                          {formatPercent(campaign.openRate)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatPercent(campaign.clickRate)} cliques
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
