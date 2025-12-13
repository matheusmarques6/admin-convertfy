"use client"

import { useState, useEffect, useRef } from "react"
import {
  Users,
  Mail,
  Target,
  Download,
  Loader2,
  Zap,
  ListFilter,
  LayoutTemplate,
  Activity,
  CheckCircle2,
  FileEdit,
  Clock,
  RefreshCw,
  BarChart3,
  Layers,
  ArrowUpRight,
  ShoppingCart,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDate } from "@/lib/utils"

interface KlaviyoReportData {
  success: boolean
  connected: boolean
  storeName: string
  generatedAt: string
  overview: {
    totalSubscribers: number
    totalLists: number
    totalSegments: number
    totalFlows: number
    liveFlows: number
    totalCampaigns: number
    sentCampaigns: number
    totalTemplates: number
  }
  engagement: {
    engagedProfiles: number
    engagementRate: string
  }
  growth: {
    growthRate: string
    campaignsLast30Days: number
  }
  automation: {
    totalFlows: number
    liveFlows: number
    draftFlows: number
    automationCoverage: string
  }
  campaigns: {
    total: number
    sent: number
    scheduled: number
    drafts: number
    last30Days: number
    recentCampaigns: Array<{
      id: string
      name: string
      status: string
      sendTime: string | null
      createdAt: string
    }>
  }
  lists: Array<{
    id: string
    name: string
    profileCount: number
    created: string
  }>
  segments: Array<{
    id: string
    name: string
    profileCount: number
    isActive: boolean
    isStarred: boolean
    created: string
  }>
  flows: Array<{
    id: string
    name: string
    status: string
    triggerType: string
    created: string
  }>
  integrations: {
    hasEcommerce: boolean
    hasEmail: boolean
    totalMetrics: number
  }
}

interface KlaviyoPerformanceReportProps {
  storeId: string
  storeName: string
}

export function KlaviyoPerformanceReport({ storeId, storeName }: KlaviyoPerformanceReportProps) {
  const [reportData, setReportData] = useState<KlaviyoReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadReportData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId])

  async function loadReportData() {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/integrations/klaviyo/report?store_id=${storeId}`)
      const data = await res.json()

      if (data.success) {
        setReportData(data)
      } else {
        setError(data.error || "Erro ao carregar relatório")
      }
    } catch (err) {
      console.error("Error loading report:", err)
      setError("Erro de conexão ao carregar relatório")
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportPDF = async () => {
    setIsExporting(true)
    try {
      const html2pdf = (await import("html2pdf.js")).default

      const element = reportRef.current
      if (!element) return

      const opt = {
        margin: 0.3,
        filename: `klaviyo-report-${storeName}-${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'in' as const, format: 'a4' as const, orientation: 'portrait' as const }
      }

      await html2pdf().set(opt).from(element).save()
    } catch (error) {
      console.error("Error exporting PDF:", error)
    } finally {
      setIsExporting(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "live":
        return <Badge variant="success" className="text-xs">Ativo</Badge>
      case "draft":
        return <Badge variant="secondary" className="text-xs">Rascunho</Badge>
      case "sent":
        return <Badge variant="success" className="text-xs">Enviado</Badge>
      case "scheduled":
        return <Badge variant="warning" className="text-xs">Agendado</Badge>
      default:
        return <Badge variant="secondary" className="text-xs">{status}</Badge>
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Carregando relatório de performance...</p>
      </div>
    )
  }

  if (error || !reportData) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Target className="h-12 w-12 text-destructive/70 mb-4" />
          <h3 className="text-lg font-medium text-destructive">Erro ao Carregar Relatório</h3>
          <p className="text-muted-foreground text-center mt-1">{error}</p>
          <Button variant="outline" className="mt-4" onClick={loadReportData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Tentar Novamente
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Relatório de Performance</h2>
            <p className="text-sm text-muted-foreground">
              Gerado em {formatDate(reportData.generatedAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadReportData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button onClick={handleExportPDF} disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Report Content */}
      <div ref={reportRef} className="space-y-6 bg-background">
        {/* Store Header */}
        <Card className="border-none shadow-lg bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">LOJA</p>
                <h1 className="text-2xl font-bold mt-1">{reportData.storeName}</h1>
                <div className="flex items-center gap-4 mt-3">
                  {reportData.integrations.hasEcommerce && (
                    <Badge variant="outline" className="gap-1">
                      <ShoppingCart className="h-3 w-3" />
                      E-commerce
                    </Badge>
                  )}
                  {reportData.integrations.hasEmail && (
                    <Badge variant="outline" className="gap-1">
                      <Mail className="h-3 w-3" />
                      Email Marketing
                    </Badge>
                  )}
                  <Badge variant="outline" className="gap-1">
                    <Activity className="h-3 w-3" />
                    {reportData.integrations.totalMetrics} métricas
                  </Badge>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Engajamento</div>
                <div className="text-3xl font-bold text-primary">
                  {reportData.engagement.engagementRate}%
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI Overview Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Subscribers */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                Total de Contatos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {reportData.overview.totalSubscribers.toLocaleString()}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <span className="text-emerald-500 flex items-center">
                  <ArrowUpRight className="h-3 w-3" />
                  {reportData.growth.growthRate}%
                </span>
                <span>crescimento</span>
              </div>
            </CardContent>
          </Card>

          {/* Engaged Profiles */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-500" />
                Perfis Engajados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">
                {reportData.engagement.engagedProfiles.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {reportData.engagement.engagementRate}% de taxa de engajamento
              </div>
            </CardContent>
          </Card>

          {/* Active Flows */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Flows Ativos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">
                {reportData.automation.liveFlows}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                de {reportData.automation.totalFlows} flows totais
              </div>
            </CardContent>
          </Card>

          {/* Campaigns Last 30 Days */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Mail className="h-4 w-4 text-purple-500" />
                Campanhas (30 dias)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {reportData.growth.campaignsLast30Days}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {reportData.campaigns.sent} enviadas no total
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Automation & Campaign Stats */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Automation Health */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                Saúde da Automação
              </CardTitle>
              <CardDescription>
                Cobertura e status dos seus flows automáticos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Cobertura de Automação</span>
                  <span className="font-medium">{reportData.automation.automationCoverage}%</span>
                </div>
                <Progress value={parseFloat(reportData.automation.automationCoverage)} className="h-2" />
              </div>
              <div className="grid grid-cols-3 gap-4 pt-2">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="text-xl font-bold">{reportData.automation.liveFlows}</div>
                  <div className="text-xs text-muted-foreground">Ativos</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <FileEdit className="h-4 w-4 text-slate-500" />
                  </div>
                  <div className="text-xl font-bold">{reportData.automation.draftFlows}</div>
                  <div className="text-xs text-muted-foreground">Rascunho</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Layers className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="text-xl font-bold">{reportData.automation.totalFlows}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Campaign Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-5 w-5 text-purple-500" />
                Resumo de Campanhas
              </CardTitle>
              <CardDescription>
                Status geral das suas campanhas de email
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm text-muted-foreground">Enviadas</span>
                  </div>
                  <div className="text-2xl font-bold text-emerald-600">{reportData.campaigns.sent}</div>
                </div>
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-amber-500" />
                    <span className="text-sm text-muted-foreground">Agendadas</span>
                  </div>
                  <div className="text-2xl font-bold text-amber-600">{reportData.campaigns.scheduled}</div>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <FileEdit className="h-4 w-4 text-slate-500" />
                  <span className="text-sm">Rascunhos</span>
                </div>
                <span className="font-medium">{reportData.campaigns.drafts}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">Total de Campanhas</span>
                </div>
                <span className="font-medium">{reportData.campaigns.total}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Overview Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="bg-muted/30">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <ListFilter className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{reportData.overview.totalLists}</div>
                  <div className="text-xs text-muted-foreground">Listas</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Target className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{reportData.overview.totalSegments}</div>
                  <div className="text-xs text-muted-foreground">Segmentos</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <LayoutTemplate className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{reportData.overview.totalTemplates}</div>
                  <div className="text-xs text-muted-foreground">Templates</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <Activity className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{reportData.integrations.totalMetrics}</div>
                  <div className="text-xs text-muted-foreground">Métricas Ativas</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Tables */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detalhes por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="lists">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="lists" className="text-xs gap-1">
                  <ListFilter className="h-3 w-3" />
                  Listas ({reportData.lists.length})
                </TabsTrigger>
                <TabsTrigger value="segments" className="text-xs gap-1">
                  <Target className="h-3 w-3" />
                  Segmentos ({reportData.segments.length})
                </TabsTrigger>
                <TabsTrigger value="flows" className="text-xs gap-1">
                  <Zap className="h-3 w-3" />
                  Flows ({reportData.flows.length})
                </TabsTrigger>
                <TabsTrigger value="campaigns" className="text-xs gap-1">
                  <Mail className="h-3 w-3" />
                  Campanhas
                </TabsTrigger>
              </TabsList>

              <TabsContent value="lists" className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome da Lista</TableHead>
                      <TableHead className="text-right">Contatos</TableHead>
                      <TableHead>Criada em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.lists.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          Nenhuma lista encontrada
                        </TableCell>
                      </TableRow>
                    ) : (
                      reportData.lists.map((list) => (
                        <TableRow key={list.id}>
                          <TableCell className="font-medium">{list.name}</TableCell>
                          <TableCell className="text-right font-mono">
                            {list.profileCount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(list.created)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="segments" className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome do Segmento</TableHead>
                      <TableHead className="text-right">Perfis</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Criado em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.segments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          Nenhum segmento encontrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      reportData.segments.map((segment) => (
                        <TableRow key={segment.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {segment.name}
                              {segment.isStarred && (
                                <span className="text-amber-500">★</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {segment.profileCount.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {segment.isActive ? (
                              <Badge variant="success" className="text-xs">Ativo</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">Inativo</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(segment.created)}
                          </TableCell>
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
                      <TableHead>Nome do Flow</TableHead>
                      <TableHead>Trigger</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Criado em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.flows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          Nenhum flow encontrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      reportData.flows.map((flow) => (
                        <TableRow key={flow.id}>
                          <TableCell className="font-medium">{flow.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {flow.triggerType || "Manual"}
                            </Badge>
                          </TableCell>
                          <TableCell>{getStatusBadge(flow.status)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(flow.created)}
                          </TableCell>
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
                      <TableHead>Nome da Campanha</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data de Envio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.campaigns.recentCampaigns.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          Nenhuma campanha encontrada
                        </TableCell>
                      </TableRow>
                    ) : (
                      reportData.campaigns.recentCampaigns.map((campaign) => (
                        <TableRow key={campaign.id}>
                          <TableCell className="font-medium">{campaign.name}</TableCell>
                          <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {campaign.sendTime ? formatDate(campaign.sendTime) : "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center pt-4 border-t text-sm text-muted-foreground">
          <p>Relatório gerado automaticamente pela plataforma Convertfy</p>
          <p className="mt-1">
            {new Date().toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
        </div>
      </div>
    </div>
  )
}
