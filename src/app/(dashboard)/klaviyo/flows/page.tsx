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
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Download,
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

interface FlowMetrics {
  id: string
  name: string
  status: string
  triggerType: string
  created: string
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
}

interface FlowsResponse {
  success: boolean
  period: {
    start: string
    end: string
    label: string
  }
  currency: string
  summary: {
    totalFlows: number
    liveFlows: number
    draftFlows: number
    manualFlows: number
    totalRecipients: number
    totalDelivered: number
    totalOpened: number
    totalClicked: number
    totalConversions: number
    totalRevenue: number
    totalBounced: number
    totalUnsubscribed: number
    avgOpenRate: number
    avgClickRate: number
    avgConversionRate: number
    avgBounceRate: number
    revenuePerRecipient: number
  }
  flows: FlowMetrics[]
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
  trend,
  className
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  trend?: { value: number; positive: boolean }
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
          {trend && (
            <div className={cn(
              "flex items-center gap-1 text-sm",
              trend.positive ? "text-green-600" : "text-red-600"
            )}>
              {trend.positive ? (
                <ArrowUpRight className="h-4 w-4" />
              ) : (
                <ArrowDownRight className="h-4 w-4" />
              )}
              {trend.value.toFixed(1)}%
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function FlowStatusBadge({ status }: { status: string }) {
  const variants: Record<string, { label: string; className: string }> = {
    live: { label: "Ativo", className: "bg-green-500/10 text-green-600 border-green-500/30" },
    draft: { label: "Rascunho", className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30" },
    manual: { label: "Manual", className: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  }

  const variant = variants[status] || { label: status, className: "" }

  return (
    <Badge variant="outline" className={variant.className}>
      {variant.label}
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

export default function KlaviyoFlowsPage() {
  const [stores, setStores] = useState<ClientStore[]>([])
  const [selectedStore, setSelectedStore] = useState<string>("")
  const [period, setPeriod] = useState("30d")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingStores, setIsLoadingStores] = useState(true)
  const [flowsData, setFlowsData] = useState<FlowsResponse | null>(null)

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

        const storesWithKlaviyo = (data || [])
          .filter((s) => s.klaviyo_api_key || s.klaviyo_private_key)
          .map((s) => ({
            ...s,
            client: Array.isArray(s.client) ? s.client[0] || null : s.client,
          })) as ClientStore[]

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load flows data
  const loadFlows = useCallback(async () => {
    if (!selectedStore) return

    setIsLoading(true)
    try {
      const response = await fetch(
        `/api/integrations/klaviyo/flows?store_id=${selectedStore}&period=${period}`
      )
      const data: FlowsResponse = await response.json()

      if (!data.success) {
        throw new Error(data.error || "Erro ao buscar flows")
      }

      setFlowsData(data)
    } catch (error) {
      console.error("Error loading flows:", error)
      toast({
        variant: "destructive",
        title: "Erro ao carregar flows",
        description: error instanceof Error ? error.message : "Não foi possível carregar os flows.",
      })
    } finally {
      setIsLoading(false)
    }
  }, [selectedStore, period])

  useEffect(() => {
    if (selectedStore) {
      loadFlows()
    }
  }, [selectedStore, period, loadFlows])

  // Filter flows
  const filteredFlows = flowsData?.flows.filter((flow) => {
    const matchesSearch = flow.name.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === "all" || flow.status === statusFilter
    return matchesSearch && matchesStatus
  }) || []

  // Export to CSV
  const exportToCsv = () => {
    if (!flowsData?.flows.length) return

    const headers = [
      "Nome",
      "Status",
      "Tipo",
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

    const rows = filteredFlows.map((flow) => [
      flow.name,
      flow.status,
      flow.triggerType,
      flow.recipients,
      flow.delivered,
      `${flow.deliveryRate.toFixed(1)}%`,
      flow.opened,
      `${flow.openRate.toFixed(1)}%`,
      flow.clicked,
      `${flow.clickRate.toFixed(1)}%`,
      flow.conversions,
      `${flow.conversionRate.toFixed(1)}%`,
      flow.conversionValue.toFixed(2),
      flow.revenuePerRecipient.toFixed(2),
      flow.bounced,
      flow.unsubscribed
    ])

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(","))
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `klaviyo-flows-${period}-${new Date().toISOString().split("T")[0]}.csv`
    link.click()
  }

  const selectedStoreData = stores.find((s) => s.id === selectedStore)
  const currency = flowsData?.currency || "BRL"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            Flows do Klaviyo
          </h1>
          <p className="text-muted-foreground">
            Analise o desempenho de todos os seus flows de automação
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadFlows}
            disabled={isLoading || !selectedStore}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCsv}
            disabled={!flowsData?.flows.length}
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
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
            <SelectItem value="live">Ativos</SelectItem>
            <SelectItem value="draft">Rascunhos</SelectItem>
            <SelectItem value="manual">Manuais</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 md:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar flows..."
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
      ) : flowsData?.summary ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Receita Total"
            value={formatCurrency(flowsData.summary.totalRevenue, currency)}
            subtitle={`${flowsData.summary.totalConversions} conversões`}
            icon={DollarSign}
          />
          <MetricCard
            title="Flows Ativos"
            value={flowsData.summary.liveFlows}
            subtitle={`${flowsData.summary.totalFlows} total`}
            icon={Zap}
          />
          <MetricCard
            title="Destinatários"
            value={formatNumber(flowsData.summary.totalRecipients)}
            subtitle={`${formatNumber(flowsData.summary.totalDelivered)} entregues`}
            icon={Users}
          />
          <MetricCard
            title="RPR"
            value={formatCurrency(flowsData.summary.revenuePerRecipient, currency)}
            subtitle="Receita por destinatário"
            icon={TrendingUp}
          />
          <MetricCard
            title="Taxa de Abertura"
            value={formatPercent(flowsData.summary.avgOpenRate)}
            subtitle={`${formatNumber(flowsData.summary.totalOpened)} aberturas`}
            icon={Eye}
          />
          <MetricCard
            title="Taxa de Clique"
            value={formatPercent(flowsData.summary.avgClickRate)}
            subtitle={`${formatNumber(flowsData.summary.totalClicked)} cliques`}
            icon={MousePointer}
          />
          <MetricCard
            title="Taxa de Conversão"
            value={formatPercent(flowsData.summary.avgConversionRate)}
            subtitle="Média geral"
            icon={TrendingUp}
          />
          <MetricCard
            title="Taxa de Bounce"
            value={formatPercent(flowsData.summary.avgBounceRate)}
            subtitle={`${formatNumber(flowsData.summary.totalBounced)} bounces`}
            icon={Mail}
          />
        </div>
      ) : null}

      {/* Flows Table */}
      <Card>
        <CardHeader>
          <CardTitle>Desempenho por Flow</CardTitle>
          <CardDescription>
            {filteredFlows.length} flows encontrados
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
          ) : filteredFlows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Zap className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Nenhum flow encontrado</p>
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
                    <TableHead className="min-w-[200px]">Flow</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Entregues</TableHead>
                    <TableHead className="text-right">Abertura</TableHead>
                    <TableHead className="text-right">Clique</TableHead>
                    <TableHead className="text-right">Conversão</TableHead>
                    <TableHead className="text-right">RPR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFlows.map((flow) => (
                    <TableRow key={flow.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{flow.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {flow.triggerType.replace(/_/g, " ")}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <FlowStatusBadge status={flow.status} />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(flow.conversionValue, currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(flow.delivered)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn(
                          flow.openRate > 40 ? "text-green-600" :
                          flow.openRate > 25 ? "text-yellow-600" :
                          "text-muted-foreground"
                        )}>
                          {formatPercent(flow.openRate)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn(
                          flow.clickRate > 5 ? "text-green-600" :
                          flow.clickRate > 2 ? "text-yellow-600" :
                          "text-muted-foreground"
                        )}>
                          {formatPercent(flow.clickRate)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn(
                          flow.conversionRate > 3 ? "text-green-600" :
                          flow.conversionRate > 1 ? "text-yellow-600" :
                          "text-muted-foreground"
                        )}>
                          {formatPercent(flow.conversionRate)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(flow.revenuePerRecipient, currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Flows by Revenue */}
      {flowsData?.flows && flowsData.flows.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Top 5 Flows por Receita</CardTitle>
              <CardDescription>
                Os flows que mais geraram receita no período
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {flowsData.flows
                  .sort((a, b) => b.conversionValue - a.conversionValue)
                  .slice(0, 5)
                  .map((flow, index) => (
                    <div
                      key={flow.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-medium">{flow.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {flow.conversions} conversões
                          </p>
                        </div>
                      </div>
                      <p className="font-bold text-green-600">
                        {formatCurrency(flow.conversionValue, currency)}
                      </p>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top 5 Flows por Engajamento</CardTitle>
              <CardDescription>
                Os flows com melhores taxas de abertura
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {flowsData.flows
                  .filter(f => f.delivered > 100) // Mínimo de 100 entregues
                  .sort((a, b) => b.openRate - a.openRate)
                  .slice(0, 5)
                  .map((flow, index) => (
                    <div
                      key={flow.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-medium">{flow.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatNumber(flow.delivered)} entregues
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-blue-600">
                          {formatPercent(flow.openRate)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatPercent(flow.clickRate)} cliques
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
