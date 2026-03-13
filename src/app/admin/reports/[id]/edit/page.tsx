"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Loader2,
  Calendar,
  Store,
  Building2,
  Save,
  RefreshCw,
  DollarSign,
  Users,
  Mail,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import type { Report, ReportData, ReportStatus } from "@/types"

interface ReportWithRelations extends Report {
  client?: { id: string; name: string; company?: string } | null
  user?: { id: string; name: string } | null
  store?: { id: string; store_name: string } | null
}

const STATUS_OPTIONS: { value: ReportStatus; label: string }[] = [
  { value: "draft", label: "Rascunho" },
  { value: "published", label: "Publicado" },
  { value: "sent", label: "Enviado" },
  { value: "archived", label: "Arquivado" },
]

export default function EditReportPage() {
  const router = useRouter()
  const params = useParams()
  const reportId = params.id as string

  const [report, setReport] = useState<ReportWithRelations | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)

  // Form state
  const [status, setStatus] = useState<ReportStatus>("draft")
  const [notes, setNotes] = useState("")

  // Manual metrics state
  const [revenue, setRevenue] = useState<NonNullable<ReportData["revenue"]>>({})
  const [overview, setOverview] = useState<NonNullable<ReportData["overview"]>>({})
  const [emailPerformance, setEmailPerformance] = useState<NonNullable<ReportData["emailPerformance"]>>({})

  // Load report
  useEffect(() => {
    async function loadReport() {
      setIsLoading(true)
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("client_reports")
          .select(`
            *,
            client:clients (id, name, company),
            user:profiles (id, name),
            store:client_stores (id, store_name)
          `)
          .eq("id", reportId)
          .single()

        if (error) throw error
        if (!data) {
          router.push("/admin/reports")
          return
        }

        const reportData = data as ReportWithRelations
        setReport(reportData)
        setStatus(reportData.status || "draft")
        setNotes(reportData.notes || "")

        // Set metrics from report_data
        const rd = reportData.report_data as ReportData
        setRevenue(rd?.revenue || {})
        setOverview(rd?.overview || {})
        setEmailPerformance(rd?.emailPerformance || {})
      } catch (error) {
        console.error("Error loading report:", error)
        toast({
          variant: "destructive",
          title: "Erro ao carregar relatório",
          description: "Não foi possível carregar o relatório.",
        })
        router.push("/admin/reports")
      } finally {
        setIsLoading(false)
      }
    }

    loadReport()
  }, [reportId, router])

  // Save report
  async function handleSave() {
    if (!report) return

    setIsSaving(true)
    try {
      const supabase = createClient()

      // Build updated report_data
      const updatedReportData: ReportData = {
        ...(report.report_data as ReportData),
        revenue,
        overview,
        emailPerformance,
      }

      const { error } = await supabase
        .from("client_reports")
        .update({
          status,
          notes,
          report_data: updatedReportData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", reportId)

      if (error) throw error

      toast({
        title: "Relatório salvo",
        description: "As alterações foram salvas com sucesso.",
      })

      router.push(`/admin/reports/${reportId}`)
    } catch (error) {
      console.error("Error saving report:", error)
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: "Não foi possível salvar as alterações.",
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Regenerate report data (for auto-generated reports)
  async function handleRegenerate() {
    if (!report || report.report_type === "manual") return

    setIsRegenerating(true)
    try {
      const apiEndpoints: string[] = []

      if (report.report_type === "klaviyo" || report.report_type === "combined") {
        let url = `/api/integrations/klaviyo/report?store_id=${report.store_id}&period=${report.period}`
        if (report.date_range?.start && report.date_range?.end) {
          url += `&start_date=${report.date_range.start.split('T')[0]}&end_date=${report.date_range.end.split('T')[0]}`
        }
        apiEndpoints.push(url)
      }

      if (report.report_type === "shopify" || report.report_type === "combined") {
        let url = `/api/integrations/shopify/report?store_id=${report.store_id}&period=${report.period}`
        if (report.date_range?.start && report.date_range?.end) {
          url += `&start_date=${report.date_range.start.split('T')[0]}&end_date=${report.date_range.end.split('T')[0]}`
        }
        apiEndpoints.push(url)
      }

      const results = await Promise.all(
        apiEndpoints.map(async (url) => {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 180000)
          try {
            const response = await fetch(url, { signal: controller.signal })
            clearTimeout(timeoutId)
            if (!response.ok) {
              const errorText = await response.text().catch(() => "Unknown error")
              throw new Error(`API error ${response.status}: ${errorText}`)
            }
            return response.json()
          } catch (error) {
            clearTimeout(timeoutId)
            throw error
          }
        })
      )

      // Check for errors
      for (const result of results) {
        if (!result.success) {
          throw new Error(result.error || "Erro ao regenerar relatório")
        }
      }

      // Update report data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let newReportData: Record<string, any> = {}

      if (report.report_type === "klaviyo") {
        newReportData = results[0]
      } else if (report.report_type === "shopify") {
        newReportData = results[0]
      } else if (report.report_type === "combined") {
        newReportData = { ...results[0], shopify: results[1] }
      }

      // Save to database
      const supabase = createClient()
      const { error } = await supabase
        .from("client_reports")
        .update({
          report_data: newReportData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", reportId)

      if (error) throw error

      // Update local state
      setRevenue(newReportData.revenue || {})
      setOverview(newReportData.overview || {})
      setEmailPerformance(newReportData.emailPerformance || {})

      toast({
        title: "Relatório regenerado",
        description: "Os dados foram atualizados com sucesso.",
      })
    } catch (error) {
      console.error("Error regenerating report:", error)
      let errorMessage = "Não foi possível regenerar o relatório."
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          errorMessage = "Tempo limite excedido. Tente novamente."
        } else {
          errorMessage = error.message
        }
      }
      toast({
        variant: "destructive",
        title: "Erro ao regenerar",
        description: errorMessage,
      })
    } finally {
      setIsRegenerating(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!report) {
    return null
  }

  const isManual = report.report_type === "manual"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/admin/reports/${reportId}`}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Editar Relatório</h1>
              <Badge variant="outline">
                {{ klaviyo: "Klaviyo", shopify: "Shopify", combined: "Combinado", manual: "Manual" }[report.report_type] || report.report_type}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {report.store_name || report.client?.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isManual && (
            <Button
              variant="outline"
              onClick={handleRegenerate}
              disabled={isRegenerating}
            >
              {isRegenerating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Regenerar Dados
            </Button>
          )}
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="metrics" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="metrics">Métricas</TabsTrigger>
              <TabsTrigger value="overview">Visão Geral</TabsTrigger>
              <TabsTrigger value="email">Email</TabsTrigger>
            </TabsList>

            {/* Revenue Metrics */}
            <TabsContent value="metrics">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-emerald-500" />
                    Métricas de Receita
                  </CardTitle>
                  <CardDescription>
                    {isManual
                      ? "Preencha as métricas de receita manualmente"
                      : "Métricas geradas automaticamente (editáveis)"
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Faturamento Total (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={revenue.totalRevenue || ""}
                        onChange={(e) => setRevenue(prev => ({
                          ...prev,
                          totalRevenue: e.target.value ? parseFloat(e.target.value) : undefined
                        }))}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Receita Klaviyo (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={revenue.klaviyoAttributedRevenue || ""}
                        onChange={(e) => setRevenue(prev => ({
                          ...prev,
                          klaviyoAttributedRevenue: e.target.value ? parseFloat(e.target.value) : undefined
                        }))}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Total de Pedidos</Label>
                      <Input
                        type="number"
                        value={revenue.totalOrders || ""}
                        onChange={(e) => setRevenue(prev => ({
                          ...prev,
                          totalOrders: e.target.value ? parseInt(e.target.value) : undefined
                        }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Ticket Médio (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={revenue.averageOrderValue || ""}
                        onChange={(e) => setRevenue(prev => ({
                          ...prev,
                          averageOrderValue: e.target.value ? parseFloat(e.target.value) : undefined
                        }))}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Receita de Campanhas (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={revenue.campaignRevenue || ""}
                        onChange={(e) => setRevenue(prev => ({
                          ...prev,
                          campaignRevenue: e.target.value ? parseFloat(e.target.value) : undefined
                        }))}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Receita de Flows (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={revenue.flowRevenue || ""}
                        onChange={(e) => setRevenue(prev => ({
                          ...prev,
                          flowRevenue: e.target.value ? parseFloat(e.target.value) : undefined
                        }))}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Overview Metrics */}
            <TabsContent value="overview">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-500" />
                    Visão Geral
                  </CardTitle>
                  <CardDescription>
                    Métricas de audiência e automações
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Total de Contatos</Label>
                      <Input
                        type="number"
                        value={overview.totalSubscribers || ""}
                        onChange={(e) => setOverview(prev => ({
                          ...prev,
                          totalSubscribers: e.target.value ? parseInt(e.target.value) : undefined
                        }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Engajados (90d)</Label>
                      <Input
                        type="number"
                        value={overview.engagedSegmentSize || ""}
                        onChange={(e) => setOverview(prev => ({
                          ...prev,
                          engagedSegmentSize: e.target.value ? parseInt(e.target.value) : undefined
                        }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Total de Flows</Label>
                      <Input
                        type="number"
                        value={overview.totalFlows || ""}
                        onChange={(e) => setOverview(prev => ({
                          ...prev,
                          totalFlows: e.target.value ? parseInt(e.target.value) : undefined
                        }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Total de Campanhas</Label>
                      <Input
                        type="number"
                        value={overview.totalCampaigns || ""}
                        onChange={(e) => setOverview(prev => ({
                          ...prev,
                          totalCampaigns: e.target.value ? parseInt(e.target.value) : undefined
                        }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Total de Listas</Label>
                      <Input
                        type="number"
                        value={overview.totalLists || ""}
                        onChange={(e) => setOverview(prev => ({
                          ...prev,
                          totalLists: e.target.value ? parseInt(e.target.value) : undefined
                        }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Total de Segmentos</Label>
                      <Input
                        type="number"
                        value={overview.totalSegments || ""}
                        onChange={(e) => setOverview(prev => ({
                          ...prev,
                          totalSegments: e.target.value ? parseInt(e.target.value) : undefined
                        }))}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Email Performance */}
            <TabsContent value="email">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-purple-500" />
                    Performance de Email
                  </CardTitle>
                  <CardDescription>
                    Métricas de engajamento de email
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Emails Entregues</Label>
                      <Input
                        type="number"
                        value={emailPerformance.delivered || ""}
                        onChange={(e) => setEmailPerformance(prev => ({
                          ...prev,
                          delivered: e.target.value ? parseInt(e.target.value) : undefined
                        }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Taxa de Entrega (%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={emailPerformance.deliveryRate || ""}
                        onChange={(e) => setEmailPerformance(prev => ({
                          ...prev,
                          deliveryRate: e.target.value ? parseFloat(e.target.value) : undefined
                        }))}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Aberturas</Label>
                      <Input
                        type="number"
                        value={emailPerformance.opened || ""}
                        onChange={(e) => setEmailPerformance(prev => ({
                          ...prev,
                          opened: e.target.value ? parseInt(e.target.value) : undefined
                        }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Taxa de Abertura (%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={emailPerformance.openRate || ""}
                        onChange={(e) => setEmailPerformance(prev => ({
                          ...prev,
                          openRate: e.target.value ? parseFloat(e.target.value) : undefined
                        }))}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Cliques</Label>
                      <Input
                        type="number"
                        value={emailPerformance.clicked || ""}
                        onChange={(e) => setEmailPerformance(prev => ({
                          ...prev,
                          clicked: e.target.value ? parseInt(e.target.value) : undefined
                        }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Taxa de Clique (%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={emailPerformance.clickRate || ""}
                        onChange={(e) => setEmailPerformance(prev => ({
                          ...prev,
                          clickRate: e.target.value ? parseFloat(e.target.value) : undefined
                        }))}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Bounces</Label>
                      <Input
                        type="number"
                        value={emailPerformance.bounced || ""}
                        onChange={(e) => setEmailPerformance(prev => ({
                          ...prev,
                          bounced: e.target.value ? parseInt(e.target.value) : undefined
                        }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Taxa de Bounce (%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={emailPerformance.bounceRate || ""}
                        onChange={(e) => setEmailPerformance(prev => ({
                          ...prev,
                          bounceRate: e.target.value ? parseFloat(e.target.value) : undefined
                        }))}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Descadastros</Label>
                      <Input
                        type="number"
                        value={emailPerformance.unsubscribed || ""}
                        onChange={(e) => setEmailPerformance(prev => ({
                          ...prev,
                          unsubscribed: e.target.value ? parseInt(e.target.value) : undefined
                        }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Taxa de Descadastro (%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={emailPerformance.unsubscribeRate || ""}
                        onChange={(e) => setEmailPerformance(prev => ({
                          ...prev,
                          unsubscribeRate: e.target.value ? parseFloat(e.target.value) : undefined
                        }))}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status & Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configurações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as ReportStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Adicione observações sobre este relatório..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>

          {/* Report Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Cliente</p>
                <p className="font-medium flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {report.client?.name || "N/A"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Loja</p>
                <p className="font-medium flex items-center gap-1">
                  <Store className="h-3 w-3" />
                  {report.store_name || "N/A"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Período</p>
                <p className="font-medium flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {report.period === "7d" && "7 dias"}
                  {report.period === "30d" && "30 dias"}
                  {report.period === "90d" && "90 dias"}
                  {report.period === "all" && "12 meses"}
                  {/^\d{4}-\d{2}$/.test(report.period) && report.period}
                  {report.period === "custom" && report.date_range && (
                    <>
                      {new Date(report.date_range.start).toLocaleDateString('pt-BR')} -{' '}
                      {new Date(report.date_range.end).toLocaleDateString('pt-BR')}
                    </>
                  )}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tipo</p>
                <Badge variant="outline" className="capitalize">
                  {report.report_type}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Criado em</p>
                <p className="font-medium">
                  {new Date(report.created_at).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>
              {report.updated_at && (
                <div>
                  <p className="text-sm text-muted-foreground">Atualizado em</p>
                  <p className="font-medium">
                    {new Date(report.updated_at).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
