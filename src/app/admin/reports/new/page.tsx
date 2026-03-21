"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  FileText,
  Loader2,
  Calendar,
  Store,
  ChevronDown,
  AlertCircle,
  Check,
  Building2,
  BarChart3,
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"
import { PageHeader } from "@/components/ui/page-header"
import { toast } from "@/lib/hooks/use-toast"
import { ROUTES } from "@/lib/routes"
import type { ReportType } from "@/types"

interface ClientOption {
  id: string
  name: string
  company?: string
}

interface StoreOption {
  id: string
  store_name: string
  client_id: string
  has_klaviyo: boolean
  has_shopify: boolean
}

type ReportTypeOption = {
  value: ReportType
  label: string
  description: string
  requiresIntegration: boolean
}

const REPORT_TYPES: ReportTypeOption[] = [
  {
    value: "klaviyo",
    label: "Klaviyo",
    description: "Relatório de email marketing via Klaviyo",
    requiresIntegration: true,
  },
  {
    value: "shopify",
    label: "Shopify",
    description: "Relatório de vendas via Shopify",
    requiresIntegration: true,
  },
  {
    value: "combined",
    label: "Combinado",
    description: "Relatório combinando Klaviyo e Shopify",
    requiresIntegration: true,
  },
  {
    value: "manual",
    label: "Manual",
    description: "Relatório com dados inseridos manualmente",
    requiresIntegration: false,
  },
]

const PERIOD_OPTIONS = [
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "all", label: "Últimos 12 meses" },
  { value: "custom", label: "Personalizado" },
]

export default function NewReportPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // State
  const [clients, setClients] = useState<ClientOption[]>([])
  const [stores, setStores] = useState<StoreOption[]>([])
  const [filteredStores, setFilteredStores] = useState<StoreOption[]>([])
  const [isLoadingClients, setIsLoadingClients] = useState(true)
  const [isLoadingStores, setIsLoadingStores] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state
  const [selectedClient, setSelectedClient] = useState<string>("")
  const [selectedStore, setSelectedStore] = useState<string>("")
  const [reportType, setReportType] = useState<ReportType>("klaviyo")
  const [selectedPeriod, setSelectedPeriod] = useState<string>("30d")
  const [customStartDate, setCustomStartDate] = useState<string>("")
  const [customEndDate, setCustomEndDate] = useState<string>("")
  const [notes, setNotes] = useState<string>("")

  // Check URL params for pre-selected client and store
  useEffect(() => {
    const clientId = searchParams.get("client_id") || searchParams.get("clientId")
    const storeId = searchParams.get("store_id") || searchParams.get("storeId")

    if (clientId) {
      setSelectedClient(clientId)
    }
    if (storeId) {
      setSelectedStore(storeId)
    }
  }, [searchParams])

  // Load clients on mount
  useEffect(() => {
    async function loadClients() {
      setIsLoadingClients(true)
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("clients")
          .select("id, name, company")
          .in("status", ["active", "onboarding"])
          .order("name")

        if (error) throw error
        setClients(data || [])
      } catch (error) {
        console.error("Error loading clients:", error)
        toast({
          variant: "destructive",
          title: "Erro ao carregar clientes",
          description: "Não foi possível carregar a lista de clientes.",
        })
      } finally {
        setIsLoadingClients(false)
      }
    }

    loadClients()
  }, [])

  // Load stores on mount
  useEffect(() => {
    async function loadStores() {
      setIsLoadingStores(true)
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("client_stores")
          .select("id, store_name, client_id, klaviyo_private_key, klaviyo_api_key, shopify_access_token")
          .eq("is_active", true)
          .order("store_name")

        if (error) throw error

        // Map to store options with integration flags
        const storeOptions: StoreOption[] = (data || []).map(store => ({
          id: store.id,
          store_name: store.store_name,
          client_id: store.client_id,
          has_klaviyo: !!(store.klaviyo_private_key || store.klaviyo_api_key),
          has_shopify: !!store.shopify_access_token,
        }))

        setStores(storeOptions)
      } catch (error) {
        console.error("Error loading stores:", error)
        toast({
          variant: "destructive",
          title: "Erro ao carregar lojas",
          description: "Não foi possível carregar a lista de lojas.",
        })
      } finally {
        setIsLoadingStores(false)
      }
    }

    loadStores()
  }, [])

  // Filter stores when client changes
  useEffect(() => {
    if (selectedClient) {
      const clientStores = stores.filter(s => s.client_id === selectedClient)
      setFilteredStores(clientStores)

      // Auto-select first store if available (only if no store pre-selected via URL)
      const preSelectedStoreId = searchParams.get("store_id") || searchParams.get("storeId")
      if (clientStores.length > 0 && !selectedStore && !preSelectedStoreId) {
        setSelectedStore(clientStores[0].id)
      } else if (clientStores.length === 0) {
        setSelectedStore("")
      }
    } else {
      setFilteredStores([])
      setSelectedStore("")
    }
  }, [selectedClient, stores, selectedStore, searchParams])

  // Get selected store details
  const selectedStoreDetails = stores.find(s => s.id === selectedStore)

  // Check if selected report type is valid for the store
  const isReportTypeValid = useCallback(() => {
    if (!selectedStoreDetails) return false

    switch (reportType) {
      case "klaviyo":
        return selectedStoreDetails.has_klaviyo
      case "shopify":
        return selectedStoreDetails.has_shopify
      case "combined":
        return selectedStoreDetails.has_klaviyo && selectedStoreDetails.has_shopify
      case "manual":
        return true
      default:
        return false
    }
  }, [selectedStoreDetails, reportType])

  // Validate form
  const isFormValid = useCallback(() => {
    if (!selectedClient || !selectedStore) return false
    if (!isReportTypeValid()) return false

    if (selectedPeriod === "custom") {
      if (!customStartDate || !customEndDate) return false
      if (new Date(customStartDate) > new Date(customEndDate)) return false
    }

    return true
  }, [selectedClient, selectedStore, isReportTypeValid, selectedPeriod, customStartDate, customEndDate])

  // Calculate date range
  const calculateDateRange = () => {
    const now = new Date()
    let startDate: Date
    let endDate: Date = now

    if (selectedPeriod === "custom" && customStartDate && customEndDate) {
      startDate = new Date(customStartDate)
      endDate = new Date(customEndDate)
    } else {
      switch (selectedPeriod) {
        case "7d":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case "30d":
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
        case "90d":
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
          break
        default:
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
      }
    }

    return { start: startDate.toISOString(), end: endDate.toISOString() }
  }

  // Generate report
  async function handleSubmit() {
    if (!isFormValid()) {
      toast({
        variant: "destructive",
        title: "Formulário incompleto",
        description: "Preencha todos os campos obrigatórios.",
      })
      return
    }

    setIsSubmitting(true)

    try {
      const supabase = createClient()
      const store = stores.find(s => s.id === selectedStore)
      const dateRange = calculateDateRange()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let reportData: Record<string, any> = {}

      // For auto-generated reports, fetch data from APIs
      if (reportType !== "manual") {
        const apiEndpoints: string[] = []

        if (reportType === "klaviyo" || reportType === "combined") {
          let klaviyoUrl = `/api/integrations/klaviyo/report?store_id=${selectedStore}&period=${selectedPeriod}`
          if (selectedPeriod === "custom") {
            klaviyoUrl += `&start_date=${customStartDate}&end_date=${customEndDate}`
          }
          apiEndpoints.push(klaviyoUrl)
        }

        if (reportType === "shopify" || reportType === "combined") {
          let shopifyUrl = `/api/integrations/shopify/report?store_id=${selectedStore}&period=${selectedPeriod}`
          if (selectedPeriod === "custom") {
            shopifyUrl += `&start_date=${customStartDate}&end_date=${customEndDate}`
          }
          apiEndpoints.push(shopifyUrl)
        }

        // Fetch report data from APIs
        const results = await Promise.all(
          apiEndpoints.map(async (url) => {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 180000) // 3 minutes timeout

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
            throw new Error(result.error || "Erro ao gerar relatório")
          }
        }

        // Combine results based on report type
        if (reportType === "klaviyo") {
          reportData = results[0]
          // Map engagement.engagedProfiles to overview.engagedSegmentSize for report display
          if (reportData?.engagement?.engagedProfiles !== undefined && reportData?.overview) {
            reportData.overview.engagedSegmentSize = reportData.engagement.engagedProfiles
          }
        } else if (reportType === "shopify") {
          reportData = results[0]
        } else if (reportType === "combined") {
          // Merge Klaviyo and Shopify data
          const klaviyoData = results[0]
          const shopifyData = results[1]
          // Map engagement.engagedProfiles to overview.engagedSegmentSize
          if (klaviyoData?.engagement?.engagedProfiles !== undefined && klaviyoData?.overview) {
            klaviyoData.overview.engagedSegmentSize = klaviyoData.engagement.engagedProfiles
          }
          reportData = {
            ...klaviyoData,
            shopify: shopifyData,
          }
        }
      } else {
        // Manual report - create empty template
        reportData = {
          success: true,
          revenue: {
            totalRevenue: 0,
            klaviyoAttributedRevenue: 0,
            totalOrders: 0,
            averageOrderValue: 0,
          },
          overview: {
            totalSubscribers: 0,
            engagedSegmentSize: 0,
            totalFlows: 0,
            totalCampaigns: 0,
          },
          emailPerformance: {
            delivered: 0,
            deliveryRate: 0,
            opened: 0,
            openRate: 0,
            clicked: 0,
            clickRate: 0,
            bounced: 0,
            bounceRate: 0,
          },
          account: {
            currency: "BRL",
            locale: "pt-BR",
            timezone: "America/Sao_Paulo",
          },
        }
      }

      // Save to database
      const { data: newReport, error } = await supabase
        .from("client_reports")
        .insert({
          client_id: selectedClient,
          store_id: selectedStore,
          store_name: store?.store_name || "Loja",
          report_type: reportType,
          period: selectedPeriod,
          date_range: dateRange,
          report_data: reportData,
          notes: notes || null,
          status: reportType === "manual" ? "draft" : "published",
        })
        .select()
        .single()

      if (error) throw error

      toast({
        title: "Relatório criado!",
        description: reportType === "manual"
          ? "O relatório foi criado como rascunho."
          : "O relatório foi gerado e salvo com sucesso.",
      })

      // Redirect to the new report
      router.push(`/admin/reports/${newReport.id}`)
    } catch (error) {
      console.error("Error creating report:", error)
      let errorMessage = "Tente novamente mais tarde."
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          errorMessage = "Tempo limite excedido. O relatório está demorando muito para ser gerado. Tente um período menor."
        } else {
          errorMessage = error.message
        }
      }
      toast({
        variant: "destructive",
        title: "Erro ao criar relatório",
        description: errorMessage,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const isLoading = isLoadingClients || isLoadingStores

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Novo Relatório"
        description="Crie um novo relatório para um cliente"
        breadcrumb={[
          { label: "Relatórios", href: ROUTES.ADMIN.REPORTS.LIST },
          { label: "Novo Relatório" },
        ]}
      />

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="rounded-xl border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Detalhes do Relatório
                </CardTitle>
                <CardDescription>Configure as opções para gerar o relatório</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Client Selection */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Cliente
                  </Label>
                  <Select value={selectedClient} onValueChange={setSelectedClient}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          <div className="flex flex-col">
                            <span>{client.name}</span>
                            {client.company && (
                              <span className="text-xs text-muted-foreground">{client.company}</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Store Selection */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Store className="h-4 w-4" />
                    Loja
                  </Label>
                  {selectedClient ? (
                    filteredStores.length > 0 ? (
                      <Select value={selectedStore} onValueChange={setSelectedStore}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma loja" />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredStores.map((store) => (
                            <SelectItem key={store.id} value={store.id}>
                              <div className="flex items-center gap-2">
                                <span>{store.store_name}</span>
                                <div className="flex gap-1">
                                  {store.has_klaviyo && (
                                    <Badge variant="outline" className="text-xs">Klaviyo</Badge>
                                  )}
                                  {store.has_shopify && (
                                    <Badge variant="outline" className="text-xs">Shopify</Badge>
                                  )}
                                </div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="rounded-lg border border-warning/50 bg-warning/10 p-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="h-5 w-5 text-warning mt-0.5" />
                          <div>
                            <p className="font-medium text-warning">Nenhuma loja encontrada</p>
                            <p className="text-sm text-muted-foreground">
                              Este cliente não possui lojas cadastradas ou nenhuma possui integrações configuradas.
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
                      Selecione um cliente primeiro
                    </div>
                  )}
                </div>

                {/* Report Type Selection */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Tipo de Relatório
                  </Label>
                  <div className="grid gap-3 md:grid-cols-2">
                    {REPORT_TYPES.map((type) => {
                      // Check if this type is available for the selected store
                      let isAvailable = !type.requiresIntegration
                      let unavailableReason = ""

                      if (selectedStoreDetails && type.requiresIntegration) {
                        if (type.value === "klaviyo") {
                          isAvailable = selectedStoreDetails.has_klaviyo
                          unavailableReason = "Klaviyo não configurado"
                        } else if (type.value === "shopify") {
                          isAvailable = selectedStoreDetails.has_shopify
                          unavailableReason = "Shopify não configurado"
                        } else if (type.value === "combined") {
                          isAvailable = selectedStoreDetails.has_klaviyo && selectedStoreDetails.has_shopify
                          unavailableReason = "Requer Klaviyo e Shopify"
                        }
                      }

                      const isSelected = reportType === type.value

                      return (
                        <button
                          key={type.value}
                          type="button"
                          onClick={() => isAvailable && setReportType(type.value)}
                          disabled={!isAvailable || !selectedStore}
                          className={`
                            relative p-4 rounded-lg border text-left transition-all
                            ${isSelected
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "border-border hover:border-primary/50"
                            }
                            ${!isAvailable || !selectedStore ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                          `}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium">{type.label}</p>
                              <p className="text-sm text-muted-foreground mt-1">
                                {isAvailable ? type.description : unavailableReason}
                              </p>
                            </div>
                            {isSelected && (
                              <Check className="h-5 w-5 text-primary" />
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Period Selection */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Período
                  </Label>
                  <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERIOD_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Custom Date Range */}
                {selectedPeriod === "custom" && (
                  <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Período Personalizado
                    </Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Data Início</Label>
                        <input
                          type="date"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          max={customEndDate || new Date().toISOString().split("T")[0]}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Data Fim</Label>
                        <input
                          type="date"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          min={customStartDate}
                          max={new Date().toISOString().split("T")[0]}
                        />
                      </div>
                    </div>
                    {customStartDate && customEndDate && new Date(customStartDate) > new Date(customEndDate) && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" />
                        A data de início deve ser anterior à data de fim.
                      </p>
                    )}
                  </div>
                )}

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes">Observações (opcional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Adicione observações ou notas sobre este relatório..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Submit Button */}
            <div className="flex gap-3">
              <Button variant="outline" asChild>
                <Link href="/admin/reports">Cancelar</Link>
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!isFormValid() || isSubmitting}
                className="flex-1 md:flex-none"
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {reportType === "manual" ? "Criar Rascunho" : "Gerar Relatório"}
              </Button>
            </div>
          </div>

          {/* Preview Panel */}
          <div className="space-y-6">
            <Card className="rounded-xl border bg-card">
              <CardHeader>
                <CardTitle className="text-base">Resumo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Selected Client */}
                <div>
                  <p className="text-sm text-muted-foreground">Cliente</p>
                  <p className="font-medium">
                    {selectedClient
                      ? clients.find(c => c.id === selectedClient)?.name || "-"
                      : "-"
                    }
                  </p>
                </div>

                {/* Selected Store */}
                <div>
                  <p className="text-sm text-muted-foreground">Loja</p>
                  <p className="font-medium">
                    {selectedStore
                      ? stores.find(s => s.id === selectedStore)?.store_name || "-"
                      : "-"
                    }
                  </p>
                </div>

                {/* Report Type */}
                <div>
                  <p className="text-sm text-muted-foreground">Tipo</p>
                  <Badge variant="neutral" className="capitalize">
                    {REPORT_TYPES.find(t => t.value === reportType)?.label || reportType}
                  </Badge>
                </div>

                {/* Period */}
                <div>
                  <p className="text-sm text-muted-foreground">Período</p>
                  <p className="font-medium">
                    {selectedPeriod === "custom" && customStartDate && customEndDate
                      ? `${new Date(customStartDate).toLocaleDateString("pt-BR")} - ${new Date(customEndDate).toLocaleDateString("pt-BR")}`
                      : PERIOD_OPTIONS.find(p => p.value === selectedPeriod)?.label || "-"
                    }
                  </p>
                </div>

                {/* Integration Status */}
                {selectedStoreDetails && (
                  <div className="pt-4 border-t">
                    <p className="text-sm text-muted-foreground mb-2">Integrações</p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${selectedStoreDetails.has_klaviyo ? "bg-success" : "bg-muted"}`} />
                        <span className={`text-sm ${selectedStoreDetails.has_klaviyo ? "" : "text-muted-foreground"}`}>
                          Klaviyo {selectedStoreDetails.has_klaviyo ? "conectado" : "não configurado"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${selectedStoreDetails.has_shopify ? "bg-success" : "bg-muted"}`} />
                        <span className={`text-sm ${selectedStoreDetails.has_shopify ? "" : "text-muted-foreground"}`}>
                          Shopify {selectedStoreDetails.has_shopify ? "conectado" : "não configurado"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Help Card */}
            <Card className="rounded-xl border bg-muted/50">
              <CardContent className="pt-6">
                <h4 className="font-medium mb-2">Dicas</h4>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-start gap-2">
                    <ChevronDown className="h-4 w-4 mt-0.5 rotate-[-90deg]" />
                    <span>Relatórios Klaviyo mostram métricas de email marketing e receita atribuída.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronDown className="h-4 w-4 mt-0.5 rotate-[-90deg]" />
                    <span>Relatórios Shopify mostram vendas, pedidos e clientes.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronDown className="h-4 w-4 mt-0.5 rotate-[-90deg]" />
                    <span>Use relatórios manuais para inserir dados de outras fontes.</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
