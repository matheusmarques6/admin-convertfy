"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  MessageSquare,
  Bell,
  Store,
  AlertCircle,
  RefreshCw,
  Calendar,
  DollarSign,
  Users,
  Eye,
  MousePointerClick,
  TrendingUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface Campaign {
  id: string
  name: string
  description?: string
  channel: string
  type: string
  status: string
  scheduledDate: string
  scheduledTime?: string
  color: string
  subjectLine?: string
  segmentName?: string
  recipients?: number
  delivered?: number
  opened?: number
  clicked?: number
  converted?: number
  revenue?: number
  store?: {
    id: string
    store_name: string
  }
}

interface StoreOption {
  id: string
  store_name: string
}

interface CampaignsResponse {
  campaigns: Campaign[]
  stores: StoreOption[]
  stats: {
    total: number
    sent: number
    scheduled: number
    draft: number
    totalRevenue: number
    totalRecipients: number
    totalOpens: number
    totalClicks: number
  }
}

// Channel icons and colors
const channelConfig = {
  email: { icon: Mail, color: "bg-blue-500", label: "Email" },
  sms: { icon: MessageSquare, color: "bg-green-500", label: "SMS" },
  push: { icon: Bell, color: "bg-purple-500", label: "Push" },
  whatsapp: { icon: MessageSquare, color: "bg-emerald-500", label: "WhatsApp" },
}

// Status colors
const statusConfig = {
  draft: { label: "Rascunho", color: "bg-gray-100 text-gray-700" },
  scheduled: { label: "Agendada", color: "bg-yellow-100 text-yellow-700" },
  sent: { label: "Enviada", color: "bg-green-100 text-green-700" },
  cancelled: { label: "Cancelada", color: "bg-red-100 text-red-700" },
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value)
}

function formatPercent(value: number, total: number): string {
  if (!total) return "0%"
  return `${((value / total) * 100).toFixed(1)}%`
}

export default function PortalCampaignsPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [stores, setStores] = useState<StoreOption[]>([])
  const [stats, setStats] = useState<CampaignsResponse["stats"] | null>(null)
  const [selectedStore, setSelectedStore] = useState<string>("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // Get calendar data
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // First day of month and days in month
  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  const startingDayOfWeek = firstDayOfMonth.getDay()

  // Month names in Portuguese
  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ]

  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

  // Fetch campaigns
  const fetchCampaigns = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`
      const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${daysInMonth}`

      let url = `/api/portal/campaigns?start_date=${startDate}&end_date=${endDate}`
      if (selectedStore !== "all") {
        url += `&store_id=${selectedStore}`
      }

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error("Erro ao carregar campanhas")
      }

      const data: CampaignsResponse = await response.json()
      setCampaigns(data.campaigns)
      setStores(data.stores)
      setStats(data.stats)
    } catch (err) {
      console.error("Error fetching campaigns:", err)
      setError("Não foi possível carregar as campanhas")
    } finally {
      setLoading(false)
    }
  }, [year, month, daysInMonth, selectedStore])

  useEffect(() => {
    fetchCampaigns()
  }, [fetchCampaigns])

  // Navigate months
  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  // Get campaigns for a specific day
  const getCampaignsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    return campaigns.filter(c => c.scheduledDate === dateStr)
  }

  // Check if day is today
  const isToday = (day: number) => {
    const today = new Date()
    return (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    )
  }

  // Handle day click
  const handleDayClick = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    const dayCampaigns = getCampaignsForDay(day)

    if (dayCampaigns.length === 1) {
      setSelectedCampaign(dayCampaigns[0])
    } else if (dayCampaigns.length > 1) {
      setSelectedDate(dateStr)
    }
  }

  // Handle campaign click
  const handleCampaignClick = (campaign: Campaign, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedCampaign(campaign)
  }

  // Render calendar grid
  const renderCalendarDays = () => {
    const days = []

    // Empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(
        <div
          key={`empty-${i}`}
          className="h-28 md:h-32 border border-border/50 bg-muted/20"
        />
      )
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dayCampaigns = getCampaignsForDay(day)
      const dayIsToday = isToday(day)

      days.push(
        <div
          key={day}
          onClick={() => handleDayClick(day)}
          className={`
            h-28 md:h-32 border border-border/50 p-1 cursor-pointer transition-colors
            hover:bg-muted/50
            ${dayIsToday ? "bg-primary/5 border-primary/30" : ""}
          `}
        >
          <div className="flex items-center justify-between mb-1">
            <span
              className={`
                text-xs md:text-sm font-medium w-5 h-5 md:w-6 md:h-6 flex items-center justify-center rounded-full
                ${dayIsToday ? "bg-primary text-primary-foreground" : ""}
              `}
            >
              {day}
            </span>
            {dayCampaigns.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{dayCampaigns.length - 3}
              </span>
            )}
          </div>
          <div className="space-y-0.5 overflow-hidden">
            {dayCampaigns.slice(0, 3).map((campaign) => {
              const ChannelIcon = channelConfig[campaign.channel as keyof typeof channelConfig]?.icon || Mail
              return (
                <div
                  key={campaign.id}
                  onClick={(e) => handleCampaignClick(campaign, e)}
                  className={`
                    text-xs px-1 py-0.5 rounded truncate flex items-center gap-1
                    text-white cursor-pointer hover:opacity-90 transition-opacity
                  `}
                  style={{ backgroundColor: campaign.color || "#3b82f6" }}
                  title={campaign.name}
                >
                  <ChannelIcon className="h-2.5 w-2.5 md:h-3 md:w-3 flex-shrink-0" />
                  <span className="truncate hidden md:inline">{campaign.name}</span>
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    return days
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Erro ao carregar</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={fetchCampaigns}>Tentar novamente</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calendário de Campanhas</h1>
          <p className="text-muted-foreground">
            Acompanhe todas as campanhas de marketing das suas lojas
          </p>
        </div>
        <Button
          variant="outline"
          onClick={fetchCampaigns}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Enviadas</CardTitle>
              <Mail className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.sent}</div>
              <p className="text-xs text-muted-foreground">campanhas no período</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Agendadas</CardTitle>
              <Calendar className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.scheduled}</div>
              <p className="text-xs text-muted-foreground">campanhas futuras</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Destinatários</CardTitle>
              <Users className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(stats.totalRecipients)}</div>
              <p className="text-xs text-muted-foreground">emails enviados</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Receita</CardTitle>
              <DollarSign className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(stats.totalRevenue)}
              </div>
              <p className="text-xs text-muted-foreground">atribuída às campanhas</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters and Navigation */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {/* Month Navigation */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="w-40 md:w-48 text-center">
                <h2 className="text-base md:text-lg font-semibold">
                  {monthNames[month]} {year}
                </h2>
              </div>
              <Button variant="outline" size="icon" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={goToToday}>
                Hoje
              </Button>
            </div>

            {/* Store Filter */}
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-muted-foreground" />
              <Select
                value={selectedStore}
                onValueChange={setSelectedStore}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todas as lojas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as lojas</SelectItem>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.store_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="text-muted-foreground">Status:</span>
        {Object.entries(statusConfig).map(([key, config]) => (
          <div key={key} className="flex items-center gap-1">
            <Badge variant="outline" className={config.color}>
              {config.label}
            </Badge>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6">
              <Skeleton className="h-[500px] w-full" />
            </div>
          ) : (
            <>
              {/* Week days header */}
              <div className="grid grid-cols-7 border-b">
                {weekDays.map((day) => (
                  <div
                    key={day}
                    className="p-2 text-center text-xs md:text-sm font-medium text-muted-foreground border-r last:border-r-0"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7">
                {renderCalendarDays()}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Campaign Detail Modal */}
      <Dialog open={!!selectedCampaign} onOpenChange={() => setSelectedCampaign(null)}>
        <DialogContent className="max-w-lg">
          {selectedCampaign && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                    style={{ backgroundColor: selectedCampaign.color }}
                  >
                    {(() => {
                      const ChannelIcon = channelConfig[selectedCampaign.channel as keyof typeof channelConfig]?.icon || Mail
                      return <ChannelIcon className="h-5 w-5" />
                    })()}
                  </div>
                  <div>
                    <DialogTitle>{selectedCampaign.name}</DialogTitle>
                    <DialogDescription>
                      {selectedCampaign.store?.store_name || "Loja"} •{" "}
                      {new Date(selectedCampaign.scheduledDate + "T12:00:00").toLocaleDateString("pt-BR")}
                      {selectedCampaign.scheduledTime && ` às ${selectedCampaign.scheduledTime}`}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4">
                {/* Status and Channel */}
                <div className="flex items-center gap-2">
                  <Badge
                    className={statusConfig[selectedCampaign.status as keyof typeof statusConfig]?.color}
                  >
                    {statusConfig[selectedCampaign.status as keyof typeof statusConfig]?.label}
                  </Badge>
                  <Badge variant="outline">
                    {channelConfig[selectedCampaign.channel as keyof typeof channelConfig]?.label}
                  </Badge>
                </div>

                {/* Subject Line */}
                {selectedCampaign.subjectLine && (
                  <div>
                    <p className="text-sm font-medium mb-1">Assunto</p>
                    <p className="text-sm text-muted-foreground">{selectedCampaign.subjectLine}</p>
                  </div>
                )}

                {/* Segment */}
                {selectedCampaign.segmentName && (
                  <div>
                    <p className="text-sm font-medium mb-1">Segmento</p>
                    <p className="text-sm text-muted-foreground">{selectedCampaign.segmentName}</p>
                  </div>
                )}

                {/* Description */}
                {selectedCampaign.description && (
                  <div>
                    <p className="text-sm font-medium mb-1">Descrição</p>
                    <p className="text-sm text-muted-foreground">{selectedCampaign.description}</p>
                  </div>
                )}

                {/* Metrics (only for sent campaigns) */}
                {selectedCampaign.status === "sent" && (
                  <div className="border-t pt-4">
                    <p className="text-sm font-medium mb-3">Performance</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{formatNumber(selectedCampaign.recipients || 0)}</p>
                          <p className="text-xs text-muted-foreground">Enviados</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Eye className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">
                            {formatPercent(selectedCampaign.opened || 0, selectedCampaign.delivered || 0)}
                          </p>
                          <p className="text-xs text-muted-foreground">Aberturas</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <MousePointerClick className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">
                            {formatPercent(selectedCampaign.clicked || 0, selectedCampaign.delivered || 0)}
                          </p>
                          <p className="text-xs text-muted-foreground">Cliques</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{formatNumber(selectedCampaign.converted || 0)}</p>
                          <p className="text-xs text-muted-foreground">Conversões</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 col-span-2">
                        <DollarSign className="h-4 w-4 text-green-500" />
                        <div>
                          <p className="text-sm font-medium text-green-600">
                            {formatCurrency(selectedCampaign.revenue || 0)}
                          </p>
                          <p className="text-xs text-muted-foreground">Receita</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Day Campaigns List Modal */}
      <Dialog open={!!selectedDate && !selectedCampaign} onOpenChange={() => setSelectedDate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Campanhas em {selectedDate ? new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR") : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {campaigns
              .filter((c) => c.scheduledDate === selectedDate)
              .map((campaign) => {
                const ChannelIcon = channelConfig[campaign.channel as keyof typeof channelConfig]?.icon || Mail
                return (
                  <div
                    key={campaign.id}
                    onClick={() => {
                      setSelectedDate(null)
                      setSelectedCampaign(campaign)
                    }}
                    className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50"
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                      style={{ backgroundColor: campaign.color }}
                    >
                      <ChannelIcon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{campaign.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {campaign.scheduledTime || "Sem horário"} •{" "}
                        {campaign.store?.store_name || "Loja"}
                      </p>
                    </div>
                    <Badge
                      className={statusConfig[campaign.status as keyof typeof statusConfig]?.color}
                    >
                      {statusConfig[campaign.status as keyof typeof statusConfig]?.label}
                    </Badge>
                  </div>
                )
              })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
