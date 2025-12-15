"use client"

import { useState, useEffect } from "react"
import {
  Users,
  Mail,
  Workflow,
  List,
  TrendingUp,
  Loader2,
  RefreshCw,
  AlertCircle,
  BarChart3,
  Zap,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/lib/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import { formatDate } from "@/lib/utils"

interface ClientStore {
  id: string
  store_name: string
  klaviyo_api_key?: string
  klaviyo_private_key?: string
  klaviyo_list_id?: string
}

interface KlaviyoMetrics {
  success: boolean
  connected: boolean
  storeName: string
  summary: {
    totalProfiles: number
    totalLists: number
    activeFlows: number
    totalFlows: number
    sentCampaigns: number
    scheduledCampaigns: number
    totalCampaigns: number
    totalMetrics: number
  }
  mainList: {
    id: string
    name: string
    profileCount: number
    created: string
  } | null
  lists: Array<{
    id: string
    name: string
    profileCount: number
    created: string
  }>
  flows: Array<{
    id: string
    name: string
    status: string
    created: string
  }>
  campaigns: Array<{
    id: string
    name: string
    status: string
    sendTime?: string
    createdAt: string
  }>
  metrics: Array<{
    id: string
    name: string
    integration?: string
    created: string
  }>
}

interface ClientKlaviyoReportsProps {
  clientId: string
}

export function ClientKlaviyoReports({ clientId }: ClientKlaviyoReportsProps) {
  const [stores, setStores] = useState<ClientStore[]>([])
  const [selectedStore, setSelectedStore] = useState<string>("")
  const [metrics, setMetrics] = useState<KlaviyoMetrics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false)

  useEffect(() => {
    loadStores()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  useEffect(() => {
    if (selectedStore) {
      loadMetrics(selectedStore)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStore])

  async function loadStores() {
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("client_stores")
        .select("id, store_name, klaviyo_api_key, klaviyo_private_key, klaviyo_list_id")
        .eq("client_id", clientId)
        .order("store_name")

      if (error) throw error

      // Filter stores that have Klaviyo configured (either private_key or api_key)
      const klaviyoStores = (data || []).filter(s => s.klaviyo_private_key || s.klaviyo_api_key)
      setStores(klaviyoStores)

      // Auto-select first store
      if (klaviyoStores.length > 0) {
        setSelectedStore(klaviyoStores[0].id)
      }
    } catch (error) {
      console.error("Error loading stores:", error)
      setStores([])
    } finally {
      setIsLoading(false)
    }
  }

  async function loadMetrics(storeId: string) {
    setIsLoadingMetrics(true)
    try {
      const res = await fetch(`/api/integrations/klaviyo/metrics?store_id=${storeId}`)
      const data = await res.json()

      if (data.success) {
        setMetrics(data)
      } else {
        setMetrics(null)
        if (data.error) {
          toast({
            variant: "destructive",
            title: "Erro ao carregar dados",
            description: data.error,
          })
        }
      }
    } catch (error) {
      console.error("Error loading Klaviyo metrics:", error)
      setMetrics(null)
    } finally {
      setIsLoadingMetrics(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "live":
        return <Badge variant="success">Ativo</Badge>
      case "draft":
        return <Badge variant="secondary">Rascunho</Badge>
      case "sent":
        return <Badge variant="success">Enviado</Badge>
      case "scheduled":
        return <Badge variant="warning">Agendado</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (stores.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Nenhuma loja com Klaviyo</h3>
          <p className="text-muted-foreground text-center mt-1">
            Configure a API do Klaviyo em alguma loja para ver os relatórios
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Store Selector */}
      <div className="flex items-center justify-between">
        <Select value={selectedStore} onValueChange={setSelectedStore}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Selecione uma loja" />
          </SelectTrigger>
          <SelectContent>
            {stores.map((store) => (
              <SelectItem key={store.id} value={store.id}>
                {store.store_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          onClick={() => selectedStore && loadMetrics(selectedStore)}
          disabled={isLoadingMetrics}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingMetrics ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Loading */}
      {isLoadingMetrics && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoadingMetrics && metrics && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-500" />
                  Contatos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(metrics.summary?.totalProfiles ?? 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  em {metrics.summary?.totalLists ?? 0} listas
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-emerald-500" />
                  Flows
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-500">
                  {metrics.summary?.activeFlows ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  ativos de {metrics.summary?.totalFlows ?? 0} total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Mail className="h-4 w-4 text-purple-500" />
                  Campanhas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {metrics.summary?.sentCampaigns ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  enviadas / {metrics.summary?.scheduledCampaigns ?? 0} agendadas
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-amber-500" />
                  Métricas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {metrics.summary?.totalMetrics ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  eventos rastreados
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main List Card */}
          {metrics.mainList && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <List className="h-5 w-5 text-primary" />
                  Lista Principal
                </CardTitle>
                <CardDescription>
                  Lista configurada para esta loja
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{metrics.mainList.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(metrics.mainList.profileCount ?? 0).toLocaleString()} contatos
                    </p>
                  </div>
                  <Badge variant="outline" className="text-primary">
                    ID: {metrics.mainList.id}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Detailed Tabs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalhes</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="lists">
                <TabsList>
                  <TabsTrigger value="lists" className="gap-2">
                    <List className="h-4 w-4" />
                    Listas ({metrics.lists?.length ?? 0})
                  </TabsTrigger>
                  <TabsTrigger value="flows" className="gap-2">
                    <Zap className="h-4 w-4" />
                    Flows ({metrics.flows?.length ?? 0})
                  </TabsTrigger>
                  <TabsTrigger value="campaigns" className="gap-2">
                    <Mail className="h-4 w-4" />
                    Campanhas
                  </TabsTrigger>
                  <TabsTrigger value="metrics" className="gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Métricas
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="lists" className="mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Contatos</TableHead>
                        <TableHead>Criada em</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!metrics.lists || metrics.lists.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground">
                            Nenhuma lista encontrada
                          </TableCell>
                        </TableRow>
                      ) : (
                        metrics.lists.map((list) => (
                          <TableRow key={list.id}>
                            <TableCell className="font-medium">{list.name}</TableCell>
                            <TableCell>{(list.profileCount ?? 0).toLocaleString()}</TableCell>
                            <TableCell>{formatDate(list.created)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="flows" className="mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Criado em</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!metrics.flows || metrics.flows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground">
                            Nenhum flow encontrado
                          </TableCell>
                        </TableRow>
                      ) : (
                        metrics.flows.map((flow) => (
                          <TableRow key={flow.id}>
                            <TableCell className="font-medium">{flow.name}</TableCell>
                            <TableCell>{getStatusBadge(flow.status)}</TableCell>
                            <TableCell>{formatDate(flow.created)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="campaigns" className="mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Envio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!metrics.campaigns || metrics.campaigns.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground">
                            Nenhuma campanha encontrada
                          </TableCell>
                        </TableRow>
                      ) : (
                        metrics.campaigns.map((campaign) => (
                          <TableRow key={campaign.id}>
                            <TableCell className="font-medium">{campaign.name}</TableCell>
                            <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                            <TableCell>
                              {campaign.sendTime
                                ? formatDate(campaign.sendTime)
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="metrics" className="mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Integração</TableHead>
                        <TableHead>Criado em</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!metrics.metrics || metrics.metrics.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground">
                            Nenhuma métrica encontrada
                          </TableCell>
                        </TableRow>
                      ) : (
                        metrics.metrics.map((metric) => (
                          <TableRow key={metric.id}>
                            <TableCell className="font-medium">{metric.name}</TableCell>
                            <TableCell>
                              {metric.integration || (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>{formatDate(metric.created)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}

      {!isLoadingMetrics && !metrics && selectedStore && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Erro ao carregar dados</h3>
            <p className="text-muted-foreground text-center mt-1">
              Não foi possível carregar os dados do Klaviyo
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => loadMetrics(selectedStore)}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar Novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoadingMetrics && !metrics && !selectedStore && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Selecione uma loja</h3>
            <p className="text-muted-foreground text-center mt-1">
              Escolha uma loja para ver os dados do Klaviyo
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
