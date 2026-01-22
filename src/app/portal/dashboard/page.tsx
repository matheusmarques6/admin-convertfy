"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  DollarSign,
  Store,
  Calendar,
  FileText,
  ArrowRight,
  Clock,
  AlertCircle,
  CheckCircle,
  Mail,
  RefreshCw,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

interface DashboardData {
  client: {
    id: string
    name: string
    company?: string
    status: string
    healthScore?: number
  }
  stores: Array<{
    id: string
    name: string
    platform: string
    url?: string
    isActive: boolean
  }>
  campaigns: {
    recent: Array<{
      id: string
      name: string
      status: string
      scheduledDate: string
      channel: string
      revenue?: number
    }>
  }
  invoices: {
    pending: number
    overdue: number
    totalPending: number
    totalOverdue: number
    totalPaid: number
    recent: Array<{
      id: string
      amount: number
      dueDate: string
      status: string
      description?: string
    }>
  }
  summary: {
    totalStores: number
    totalCampaigns: number
    sentCampaigns: number
    scheduledCampaigns: number
    campaignRevenue: number
  }
  meetings: Array<{
    id: string
    title: string
    scheduledAt: string
    duration?: number
    meetingUrl?: string
  }>
  contract?: {
    planName: string
    monthlyValue: number
    startDate: string
    endDate?: string
    status: string
  } | null
  lastUpdated: string
}

const statusColors = {
  draft: "bg-gray-100 text-gray-700",
  scheduled: "bg-yellow-100 text-yellow-700",
  sent: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
}

const invoiceStatusColors = {
  pending: "bg-yellow-100 text-yellow-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-700",
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR")
}

export default function PortalDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDashboard = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    try {
      const response = await fetch("/api/portal/dashboard")
      if (!response.ok) {
        throw new Error("Erro ao carregar dados")
      }
      const result = await response.json()
      setData(result)
      setError(null)
    } catch (err) {
      console.error("Dashboard fetch error:", err)
      setError("Não foi possível carregar os dados. Tente novamente.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchDashboard()
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Erro ao carregar</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={() => fetchDashboard()}>Tentar novamente</Button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Bem-vindo, {data.client?.name || data.client?.company || "Cliente"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Atualizado: {data.lastUpdated ? formatDate(data.lastUpdated) : "Agora"}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchDashboard(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Campanhas</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.summary?.campaignRevenue || 0)}</div>
            <p className="text-xs text-muted-foreground">
              Receita atribuída via email marketing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lojas Ativas</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary?.totalStores || 0}</div>
            <p className="text-xs text-muted-foreground">
              Lojas configuradas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Campanhas Enviadas</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary?.sentCampaigns || 0}</div>
            <p className="text-xs text-muted-foreground">
              No período selecionado
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Faturas Pendentes</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.invoices?.totalPending || 0)}</div>
            <p className="text-xs text-muted-foreground">
              {data.invoices?.pending || 0} fatura(s) a pagar
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Stores */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Suas Lojas</CardTitle>
              <CardDescription>Lojas configuradas na plataforma</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/portal/stores">
                Ver todas
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {(data.stores?.length || 0) === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Store className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhuma loja configurada</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.stores.slice(0, 4).map((store) => (
                  <Link
                    key={store.id}
                    href={`/portal/stores/${store.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Store className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{store.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {store.platform}
                        </p>
                      </div>
                    </div>
                    <Badge variant={store.isActive ? "default" : "secondary"}>
                      {store.isActive ? "Ativa" : "Inativa"}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Campaigns */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Campanhas Recentes</CardTitle>
              <CardDescription>Últimas campanhas de email marketing</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/portal/campaigns">
                Ver todas
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {(data.campaigns?.recent?.length || 0) === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhuma campanha encontrada</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.campaigns.recent.slice(0, 5).map((campaign) => (
                  <div
                    key={campaign.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Mail className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{campaign.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(campaign.scheduledDate)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {campaign.revenue && campaign.revenue > 0 && (
                        <span className="text-sm font-medium text-green-600">
                          {formatCurrency(campaign.revenue)}
                        </span>
                      )}
                      <Badge
                        className={statusColors[campaign.status as keyof typeof statusColors] || ""}
                      >
                        {campaign.status === "sent" ? "Enviada" :
                         campaign.status === "scheduled" ? "Agendada" :
                         campaign.status === "draft" ? "Rascunho" : campaign.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Invoices */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Faturas Recentes</CardTitle>
              <CardDescription>Últimas faturas</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/portal/invoices">
                Ver todas
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {(data.invoices?.recent?.length || 0) === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-50" />
                <p>Nenhuma fatura encontrada</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.invoices.recent.slice(0, 4).map((invoice) => {
                  const isOverdue = new Date(invoice.dueDate) < new Date() && invoice.status !== "paid"
                  return (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          invoice.status === "paid" ? "bg-green-100" :
                          isOverdue ? "bg-red-100" : "bg-yellow-100"
                        }`}>
                          {invoice.status === "paid" ? (
                            <CheckCircle className="h-5 w-5 text-green-600" />
                          ) : isOverdue ? (
                            <AlertCircle className="h-5 w-5 text-red-600" />
                          ) : (
                            <Clock className="h-5 w-5 text-yellow-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{formatCurrency(invoice.amount)}</p>
                          <p className="text-xs text-muted-foreground">
                            Vencimento: {formatDate(invoice.dueDate)}
                          </p>
                        </div>
                      </div>
                      <Badge
                        className={invoiceStatusColors[isOverdue && invoice.status !== "paid" ? "overdue" : invoice.status as keyof typeof invoiceStatusColors] || ""}
                      >
                        {invoice.status === "paid" ? "Paga" :
                         isOverdue ? "Vencida" :
                         invoice.status === "pending" ? "Pendente" : invoice.status}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Meetings */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Próximas Reuniões</CardTitle>
              <CardDescription>Reuniões agendadas</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {(data.meetings?.length || 0) === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhuma reunião agendada</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.meetings.slice(0, 4).map((meeting) => (
                  <div
                    key={meeting.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Calendar className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium">{meeting.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(meeting.scheduledAt)}
                          {meeting.duration && ` • ${meeting.duration} min`}
                        </p>
                      </div>
                    </div>
                    {meeting.meetingUrl && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={meeting.meetingUrl} target="_blank" rel="noopener noreferrer">
                          Entrar
                        </a>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
