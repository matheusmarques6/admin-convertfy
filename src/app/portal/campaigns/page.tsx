"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  MessageSquare,
  Store,
  AlertCircle,
  RefreshCw,
  Calendar,
  DollarSign,
  Users,
  Eye,
  MousePointerClick,
  TrendingUp,
  Send,
  Filter,
  LayoutGrid,
  List,
  Target,
  CheckCircle,
  FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// ============================================
// TYPES
// ============================================

interface Campaign {
  id: string
  name: string
  description?: string
  channel: "email" | "sms" | "push"
  type: string
  status: "draft" | "scheduled" | "sent" | "cancelled"
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

interface Stats {
  total: number
  sent: number
  scheduled: number
  draft: number
  totalRevenue: number
  totalRecipients: number
  totalOpens: number
  totalClicks: number
}

// ============================================
// CONSTANTS
// ============================================

const CHANNEL_CONFIG = {
  email: {
    icon: Mail,
    color: "bg-blue-500",
    lightColor: "bg-blue-500/20",
    textColor: "text-blue-400",
    label: "Email"
  },
  sms: {
    icon: MessageSquare,
    color: "bg-emerald-500",
    lightColor: "bg-emerald-500/20",
    textColor: "text-emerald-400",
    label: "SMS"
  },
  push: {
    icon: Send,
    color: "bg-purple-500",
    lightColor: "bg-purple-500/20",
    textColor: "text-purple-400",
    label: "Push"
  },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dotColor: string }> = {
  draft: {
    label: "Rascunho",
    color: "bg-muted/20 text-muted-foreground border-muted-foreground/30",
    dotColor: "bg-muted-foreground"
  },
  pending_review: {
    label: "Em Revisão",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    dotColor: "bg-blue-400"
  },
  approved: {
    label: "Aprovada",
    color: "bg-teal-500/20 text-teal-400 border-teal-500/30",
    dotColor: "bg-teal-400"
  },
  rejected: {
    label: "Rejeitada",
    color: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    dotColor: "bg-orange-400"
  },
  scheduled: {
    label: "Agendada",
    color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    dotColor: "bg-amber-400"
  },
  sent: {
    label: "Enviada",
    color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    dotColor: "bg-emerald-400"
  },
  cancelled: {
    label: "Cancelada",
    color: "bg-red-500/20 text-red-400 border-red-500/30",
    dotColor: "bg-red-400"
  },
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
]

const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(1)}K`
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function formatNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
  return new Intl.NumberFormat("pt-BR").format(value)
}

function formatPercent(value: number, total: number): string {
  if (!total) return "0%"
  return `${((value / total) * 100).toFixed(1)}%`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR")
}

function formatTime(timeStr?: string): string {
  if (!timeStr) return ""
  return timeStr.substring(0, 5)
}

// Date helpers
function getStartOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

function getEndOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (6 - day))
  d.setHours(23, 59, 59, 999)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  )
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// ============================================
// COMPONENTS
// ============================================

// Stat Card Component
function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = "text-emerald-400",
  iconBgColor = "bg-emerald-400/10",
  gradientClass,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  iconColor?: string
  iconBgColor?: string
  gradientClass?: string
}) {
  return (
    <div className={`rounded-xl bg-card border border-border p-5 card-hover ${gradientClass || ""}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground mb-1">{title}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className={`rounded-xl p-3 ${iconBgColor}`}>
          <Icon className={`h-6 w-6 ${iconColor}`} />
        </div>
      </div>
    </div>
  )
}

// Campaign Card for Calendar
function CampaignCard({
  campaign,
  compact = false,
  onClick,
}: {
  campaign: Campaign
  compact?: boolean
  onClick: () => void
}) {
  const channelConfig = CHANNEL_CONFIG[campaign.channel] || CHANNEL_CONFIG.email
  const statusConfig = STATUS_CONFIG[campaign.status] || STATUS_CONFIG.scheduled
  const ChannelIcon = channelConfig.icon

  if (compact) {
    return (
      <div
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
        className={`
          text-xs px-2 py-1 rounded-md flex items-center gap-1.5
          text-foreground cursor-pointer hover:opacity-80 transition-all
          truncate
        `}
        style={{ backgroundColor: campaign.color || "#3b82f6" }}
        title={campaign.name}
      >
        <ChannelIcon className="h-3 w-3 flex-shrink-0" />
        <span className="truncate">{campaign.name}</span>
      </div>
    )
  }

  return (
    <div
      onClick={onClick}
      className="rounded-lg bg-muted/80 border border-border/50 p-3 cursor-pointer hover:bg-muted transition-all group"
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: campaign.color || "#3b82f6" }}
        >
          <ChannelIcon className="h-5 w-5 text-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {campaign.scheduledTime && (
              <span className="text-xs text-muted-foreground font-medium">
                {formatTime(campaign.scheduledTime)}
              </span>
            )}
            <Badge className={`text-[10px] ${statusConfig.color}`}>
              {statusConfig.label}
            </Badge>
          </div>
          <p className="font-medium text-foreground text-sm truncate group-hover:text-emerald-400 transition-colors">
            {campaign.name}
          </p>
          {campaign.segmentName && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {campaign.segmentName}
            </p>
          )}
          {campaign.recipients && (
            <p className="text-xs text-muted-foreground mt-1">
              <Users className="h-3 w-3 inline mr-1" />
              {formatNumber(campaign.recipients)} destinatários
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function PortalCampaignsPage() {
  // Navigation state
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<"month" | "week">("month")

  // Data state
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [stores, setStores] = useState<StoreOption[]>([])
  const [stats, setStats] = useState<Stats | null>(null)

  // Filter state
  const [selectedStore, setSelectedStore] = useState("all")
  const [selectedChannel, setSelectedChannel] = useState("all")
  const [selectedStatus, setSelectedStatus] = useState("all")

  // UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [selectedDayCampaigns, setSelectedDayCampaigns] = useState<Campaign[] | null>(null)
  const [selectedDayDate, setSelectedDayDate] = useState<string | null>(null)

  // Calendar calculations
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  const startingDayOfWeek = firstDayOfMonth.getDay()

  // Week calculations - memoized to prevent infinite loops
  // We use currentDate.getTime() as a primitive dependency to avoid object comparison issues
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weekStart = useMemo(() => getStartOfWeek(currentDate), [currentDate.getTime()])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weekEnd = useMemo(() => getEndOfWeek(currentDate), [currentDate.getTime()])
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  // Date range for API - use primitive values to prevent re-renders
  const dateRange = useMemo(() => {
    if (viewMode === "month") {
      const start = `${year}-${String(month + 1).padStart(2, "0")}-01`
      const end = `${year}-${String(month + 1).padStart(2, "0")}-${daysInMonth}`
      return { start, end }
    } else {
      return {
        start: formatDateKey(weekStart),
        end: formatDateKey(weekEnd),
      }
    }
  }, [viewMode, year, month, daysInMonth, weekStart, weekEnd])

  // Transform API data to calendar format
  const transformCampaignData = (apiCampaign: {
    id: string
    name: string
    campaign_type: string
    scheduled_at: string
    status: string
    store_ids: string[]
    store_names: string[]
    stores_count: number
  }): Campaign => {
    const scheduledDate = new Date(apiCampaign.scheduled_at)
    const dateStr = formatDateKey(scheduledDate)
    const timeStr = scheduledDate.toTimeString().substring(0, 5)

    // Map API status to calendar status
    const statusMap: Record<string, "draft" | "scheduled" | "sent" | "cancelled"> = {
      scheduled: "scheduled",
      processing: "scheduled",
      completed: "sent",
      failed: "cancelled",
      cancelled: "cancelled",
    }

    // Map campaign_type to channel
    const channelMap: Record<string, "email" | "sms" | "push"> = {
      email: "email",
      sms: "sms",
      push: "push",
      whatsapp: "sms", // Map whatsapp to sms for display
    }

    // Color based on campaign type
    const colorMap: Record<string, string> = {
      email: "#3b82f6",
      sms: "#10b981",
      push: "#8b5cf6",
      whatsapp: "#25d366",
    }

    const storeIds = apiCampaign.store_ids || []
    const storeNames = apiCampaign.store_names || []

    return {
      id: apiCampaign.id,
      name: apiCampaign.name,
      channel: channelMap[apiCampaign.campaign_type] || "email",
      type: apiCampaign.campaign_type,
      status: statusMap[apiCampaign.status] || "scheduled",
      scheduledDate: dateStr,
      scheduledTime: timeStr,
      color: colorMap[apiCampaign.campaign_type] || "#3b82f6",
      segmentName: storeNames.join(", "),
      store: storeNames.length > 0 ? {
        id: storeIds[0],
        store_name: storeNames[0],
      } : undefined,
    }
  }

  // Fetch campaigns
  const fetchCampaigns = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        start_date: dateRange.start,
        end_date: dateRange.end,
      })

      if (selectedStore !== "all") params.set("store_id", selectedStore)
      if (selectedChannel !== "all") params.set("channel", selectedChannel)
      if (selectedStatus !== "all") params.set("status", selectedStatus)

      const response = await fetch(`/api/portal/campaigns?${params}`)
      if (!response.ok) {
        throw new Error("Erro ao carregar campanhas")
      }

      const data = await response.json()

      // Transform API response to calendar format
      const transformedCampaigns = (data.campaigns || []).map(transformCampaignData)

      // Extract unique stores from campaigns for filter
      const uniqueStores = new Map<string, StoreOption>()
      data.campaigns?.forEach((c: { store_ids?: string[], store_names?: string[] }) => {
        const ids = c.store_ids || []
        const names = c.store_names || []
        ids.forEach((id, index) => {
          if (!uniqueStores.has(id)) {
            uniqueStores.set(id, { id, store_name: names[index] || "Loja" })
          }
        })
      })

      // Calculate stats
      const calculatedStats: Stats = {
        total: transformedCampaigns.length,
        sent: transformedCampaigns.filter((c: Campaign) => c.status === "sent").length,
        scheduled: transformedCampaigns.filter((c: Campaign) => c.status === "scheduled").length,
        draft: transformedCampaigns.filter((c: Campaign) => c.status === "draft").length,
        totalRevenue: 0,
        totalRecipients: 0,
        totalOpens: 0,
        totalClicks: 0,
      }

      setCampaigns(transformedCampaigns)
      setStores(Array.from(uniqueStores.values()))
      setStats(calculatedStats)
    } catch (err) {
      console.error("Error fetching campaigns:", err)
      setError("Não foi possível carregar as campanhas")
    } finally {
      setLoading(false)
    }
  }, [dateRange, selectedStore, selectedChannel, selectedStatus])

  useEffect(() => {
    fetchCampaigns()
  }, [fetchCampaigns])

  // Navigation handlers
  const goToPrev = () => {
    if (viewMode === "month") {
      setCurrentDate(new Date(year, month - 1, 1))
    } else {
      setCurrentDate(addDays(currentDate, -7))
    }
  }

  const goToNext = () => {
    if (viewMode === "month") {
      setCurrentDate(new Date(year, month + 1, 1))
    } else {
      setCurrentDate(addDays(currentDate, 7))
    }
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  // Get campaigns for a specific day
  const getCampaignsForDay = useCallback((date: Date): Campaign[] => {
    const dateStr = formatDateKey(date)
    return campaigns.filter((c) => c.scheduledDate === dateStr)
  }, [campaigns])

  // Check if day is today
  const isToday = (date: Date): boolean => {
    return isSameDay(date, new Date())
  }

  // Handle day click
  const handleDayClick = (date: Date) => {
    const dayCampaigns = getCampaignsForDay(date)
    if (dayCampaigns.length === 1) {
      setSelectedCampaign(dayCampaigns[0])
    } else if (dayCampaigns.length > 1) {
      setSelectedDayCampaigns(dayCampaigns)
      setSelectedDayDate(formatDateKey(date))
    }
  }

  // Format navigation title
  const getNavigationTitle = (): string => {
    if (viewMode === "month") {
      return `${MONTH_NAMES[month]} ${year}`
    } else {
      const startStr = weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
      const endStr = weekEnd.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
      return `${startStr} - ${endStr}`
    }
  }

  // ============================================
  // RENDER: Loading State
  // ============================================
  if (loading && campaigns.length === 0) {
    return (
      <div className="min-h-screen bg-background p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-64 bg-card" />
          <Skeleton className="h-10 w-32 bg-card" />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl bg-card" />
          ))}
        </div>
        <Skeleton className="h-12 rounded-xl bg-card" />
        <Skeleton className="h-[500px] rounded-xl bg-card" />
      </div>
    )
  }

  // ============================================
  // RENDER: Error State
  // ============================================
  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="rounded-2xl bg-card border border-border p-8 text-center max-w-md">
          <div className="rounded-full bg-red-500/10 p-4 w-fit mx-auto mb-4">
            <AlertCircle className="h-10 w-10 text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Erro ao carregar</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={fetchCampaigns} className="bg-emerald-500 hover:bg-emerald-600">
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER: Monthly Calendar
  // ============================================
  const renderMonthlyCalendar = () => {
    const days = []

    // Empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(
        <div
          key={`empty-${i}`}
          className="min-h-[120px] bg-muted/30 border border-border/30"
        />
      )
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day)
      const dayCampaigns = getCampaignsForDay(date)
      const dayIsToday = isToday(date)

      days.push(
        <div
          key={day}
          onClick={() => handleDayClick(date)}
          className={`
            min-h-[120px] border border-border/30 p-2 cursor-pointer transition-all
            hover:bg-card/50
            ${dayIsToday ? "bg-primary/10 border-primary/40" : "bg-background"}
          `}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className={`
                text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full
                ${dayIsToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"}
              `}
            >
              {day}
            </span>
            {dayCampaigns.length > 3 && (
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                +{dayCampaigns.length - 3}
              </span>
            )}
          </div>
          <div className="space-y-1">
            {dayCampaigns.slice(0, 3).map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                compact
                onClick={() => setSelectedCampaign(campaign)}
              />
            ))}
          </div>
        </div>
      )
    }

    return days
  }

  // ============================================
  // RENDER: Weekly Calendar
  // ============================================
  const renderWeeklyCalendar = () => {
    return (
      <div className="grid grid-cols-7 gap-3">
        {weekDays.map((date, index) => {
          const dayCampaigns = getCampaignsForDay(date)
          const dayIsToday = isToday(date)

          return (
            <div
              key={index}
              className={`
                min-h-[400px] rounded-xl border p-3
                ${dayIsToday
                  ? "bg-emerald-500/10 border-emerald-500/40"
                  : "bg-background border-border/50"
                }
              `}
            >
              {/* Day Header */}
              <div className="text-center mb-3 pb-3 border-b border-border/50">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  {WEEK_DAYS[date.getDay()]}
                </p>
                <p
                  className={`
                    text-2xl font-bold mt-1
                    ${dayIsToday ? "text-emerald-400" : "text-foreground"}
                  `}
                >
                  {date.getDate()}
                </p>
                <p className="text-xs text-muted-foreground">
                  {MONTH_NAMES[date.getMonth()].substring(0, 3)}
                </p>
              </div>

              {/* Campaigns */}
              <div className="space-y-2">
                {dayCampaigns.length === 0 ? (
                  <p className="text-xs text-muted-foreground/70 text-center py-4">
                    Sem campanhas
                  </p>
                ) : (
                  dayCampaigns.map((campaign) => (
                    <CampaignCard
                      key={campaign.id}
                      campaign={campaign}
                      onClick={() => setSelectedCampaign(campaign)}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ============================================
  // RENDER: Main
  // ============================================
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-[1600px] mx-auto p-6 space-y-6">

        {/* ========== HEADER ========== */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Calendário de Campanhas</h1>
            <p className="text-muted-foreground">
              Acompanhe todas as campanhas de marketing programadas
            </p>
          </div>
          <Button
            variant="outline"
            onClick={fetchCampaigns}
            disabled={loading}
            className="bg-card border-border text-foreground hover:bg-muted"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* ========== STATS CARDS ========== */}
        {stats && (
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              title="Agendadas"
              value={stats.scheduled}
              subtitle="campanhas futuras"
              icon={Calendar}
              iconColor="text-amber-400"
              iconBgColor="bg-amber-400/10"
              gradientClass="bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20"
            />
            <StatCard
              title="Enviadas"
              value={stats.sent}
              subtitle="no período"
              icon={CheckCircle}
              iconColor="text-emerald-400"
              iconBgColor="bg-emerald-400/10"
              gradientClass="bg-gradient-to-br from-success/10 to-success/5 border-success/20"
            />
            <StatCard
              title="Destinatários"
              value={formatNumber(stats.totalRecipients)}
              subtitle="emails enviados"
              icon={Users}
              iconColor="text-blue-400"
              iconBgColor="bg-blue-400/10"
              gradientClass="bg-gradient-to-br from-info/10 to-info/5 border-info/20"
            />
            <StatCard
              title="Receita"
              value={formatCurrency(stats.totalRevenue)}
              subtitle="atribuída às campanhas"
              icon={DollarSign}
              iconColor="text-green-400"
              iconBgColor="bg-green-400/10"
            />
          </div>
        )}

        {/* ========== FILTERS & NAVIGATION ========== */}
        <div className="rounded-xl bg-card border border-border p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

            {/* Left: View Toggle + Navigation */}
            <div className="flex items-center gap-3">
              {/* View Toggle */}
              <div className="flex rounded-lg bg-muted p-1">
                <button
                  onClick={() => setViewMode("month")}
                  className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all
                    ${viewMode === "month"
                      ? "bg-emerald-500 text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                    }
                  `}
                >
                  <LayoutGrid className="h-4 w-4" />
                  Mensal
                </button>
                <button
                  onClick={() => setViewMode("week")}
                  className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all
                    ${viewMode === "week"
                      ? "bg-emerald-500 text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                    }
                  `}
                >
                  <List className="h-4 w-4" />
                  Semanal
                </button>
              </div>

              {/* Navigation */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={goToPrev}
                  className="bg-muted border-border text-foreground hover:bg-muted/80"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="w-44 text-center">
                  <h2 className="text-base font-semibold text-foreground">
                    {getNavigationTitle()}
                  </h2>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={goToNext}
                  className="bg-muted border-border text-foreground hover:bg-muted/80"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToToday}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  Hoje
                </Button>
              </div>
            </div>

            {/* Right: Filters */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Store Filter */}
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger className="w-[160px] bg-muted border-border text-foreground">
                  <Store className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Loja" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all" className="text-foreground hover:bg-muted">
                    Todas as lojas
                  </SelectItem>
                  {stores.map((store) => (
                    <SelectItem
                      key={store.id}
                      value={store.id}
                      className="text-foreground hover:bg-muted"
                    >
                      {store.store_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Channel Filter */}
              <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                <SelectTrigger className="w-[140px] bg-muted border-border text-foreground">
                  <Mail className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Canal" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all" className="text-foreground hover:bg-muted">
                    Todos os canais
                  </SelectItem>
                  <SelectItem value="email" className="text-foreground hover:bg-muted">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-blue-400" />
                      Email
                    </div>
                  </SelectItem>
                  <SelectItem value="sms" className="text-foreground hover:bg-muted">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-emerald-400" />
                      SMS
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Status Filter */}
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-[150px] bg-muted border-border text-foreground">
                  <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all" className="text-foreground hover:bg-muted">
                    Todos os status
                  </SelectItem>
                  <SelectItem value="scheduled" className="text-foreground hover:bg-muted">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-400" />
                      Agendada
                    </div>
                  </SelectItem>
                  <SelectItem value="sent" className="text-foreground hover:bg-muted">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      Enviada
                    </div>
                  </SelectItem>
                  <SelectItem value="draft" className="text-foreground hover:bg-muted">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                      Rascunho
                    </div>
                  </SelectItem>
                  <SelectItem value="cancelled" className="text-foreground hover:bg-muted">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-400" />
                      Cancelada
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* ========== LEGEND ========== */}
        <div className="flex flex-wrap items-center gap-6 px-2">
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Canal:</span>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-blue-500" />
              <span className="text-xs text-muted-foreground">Email</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-emerald-500" />
              <span className="text-xs text-muted-foreground">SMS</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Status:</span>
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${config.dotColor}`} />
                <span className="text-xs text-muted-foreground">{config.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ========== CALENDAR ========== */}
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          {viewMode === "month" ? (
            <>
              {/* Week days header */}
              <div className="grid grid-cols-7 bg-background">
                {WEEK_DAYS.map((day, index) => (
                  <div
                    key={day}
                    className={`
                      py-3 text-center text-sm font-medium text-muted-foreground
                      border-r border-border last:border-r-0
                      ${index === 0 || index === 6 ? "text-muted-foreground" : ""}
                    `}
                  >
                    {day}
                  </div>
                ))}
              </div>
              {/* Calendar grid */}
              <div className="grid grid-cols-7">
                {renderMonthlyCalendar()}
              </div>
            </>
          ) : (
            <div className="p-4">
              {renderWeeklyCalendar()}
            </div>
          )}
        </div>

        {/* ========== CAMPAIGN DETAIL MODAL ========== */}
        <Dialog open={!!selectedCampaign} onOpenChange={() => setSelectedCampaign(null)}>
          <DialogContent className="bg-card border-border text-foreground max-w-lg">
            {selectedCampaign && (
              <>
                <DialogHeader>
                  <div className="flex items-start gap-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: selectedCampaign.color || "#3b82f6" }}
                    >
                      {(() => {
                        const ChannelIcon = CHANNEL_CONFIG[selectedCampaign.channel]?.icon || Mail
                        return <ChannelIcon className="h-6 w-6 text-foreground" />
                      })()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <DialogTitle className="text-xl text-foreground">
                        {selectedCampaign.name}
                      </DialogTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {selectedCampaign.store?.store_name || "Loja"} •{" "}
                        {formatDate(selectedCampaign.scheduledDate)}
                        {selectedCampaign.scheduledTime && ` às ${formatTime(selectedCampaign.scheduledTime)}`}
                      </p>
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-5 mt-4">
                  {/* Status and Channel */}
                  <div className="flex items-center gap-2">
                    <Badge className={STATUS_CONFIG[selectedCampaign.status]?.color}>
                      {STATUS_CONFIG[selectedCampaign.status]?.label}
                    </Badge>
                    <Badge className={`${CHANNEL_CONFIG[selectedCampaign.channel]?.lightColor} ${CHANNEL_CONFIG[selectedCampaign.channel]?.textColor} border-0`}>
                      {CHANNEL_CONFIG[selectedCampaign.channel]?.label}
                    </Badge>
                  </div>

                  {/* Subject Line */}
                  {selectedCampaign.subjectLine && (
                    <div className="rounded-lg bg-muted p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Assunto</p>
                      </div>
                      <p className="text-sm text-foreground">{selectedCampaign.subjectLine}</p>
                    </div>
                  )}

                  {/* Segment */}
                  {selectedCampaign.segmentName && (
                    <div className="rounded-lg bg-muted p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="h-4 w-4 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Segmento</p>
                      </div>
                      <p className="text-sm text-foreground">{selectedCampaign.segmentName}</p>
                    </div>
                  )}

                  {/* Description */}
                  {selectedCampaign.description && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Descrição</p>
                      <p className="text-sm text-foreground/80">{selectedCampaign.description}</p>
                    </div>
                  )}

                  {/* Performance Metrics (only for sent campaigns) */}
                  {selectedCampaign.status === "sent" && (
                    <div className="border-t border-border pt-5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-4">Performance</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-lg bg-muted p-3">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-blue-400" />
                            <span className="text-xs text-muted-foreground">Enviados</span>
                          </div>
                          <p className="text-lg font-bold text-foreground mt-1">
                            {formatNumber(selectedCampaign.recipients || 0)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-muted p-3">
                          <div className="flex items-center gap-2">
                            <Eye className="h-4 w-4 text-emerald-400" />
                            <span className="text-xs text-muted-foreground">Abertura</span>
                          </div>
                          <p className="text-lg font-bold text-foreground mt-1">
                            {formatPercent(selectedCampaign.opened || 0, selectedCampaign.delivered || 0)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-muted p-3">
                          <div className="flex items-center gap-2">
                            <MousePointerClick className="h-4 w-4 text-amber-400" />
                            <span className="text-xs text-muted-foreground">Cliques</span>
                          </div>
                          <p className="text-lg font-bold text-foreground mt-1">
                            {formatPercent(selectedCampaign.clicked || 0, selectedCampaign.delivered || 0)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-muted p-3">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-purple-400" />
                            <span className="text-xs text-muted-foreground">Conversões</span>
                          </div>
                          <p className="text-lg font-bold text-foreground mt-1">
                            {formatNumber(selectedCampaign.converted || 0)}
                          </p>
                        </div>
                      </div>
                      {(selectedCampaign.revenue || 0) > 0 && (
                        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4 mt-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-5 w-5 text-emerald-400" />
                              <span className="text-sm text-muted-foreground">Receita Gerada</span>
                            </div>
                            <p className="text-xl font-bold text-emerald-400">
                              {formatCurrency(selectedCampaign.revenue || 0)}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* ========== DAY CAMPAIGNS LIST MODAL ========== */}
        <Dialog
          open={!!selectedDayCampaigns && !selectedCampaign}
          onOpenChange={() => setSelectedDayCampaigns(null)}
        >
          <DialogContent className="bg-card border-border text-foreground">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                Campanhas em {selectedDayDate ? formatDate(selectedDayDate) : ""}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-4">
              {selectedDayCampaigns?.map((campaign) => {
                const ChannelIcon = CHANNEL_CONFIG[campaign.channel]?.icon || Mail
                const statusConfig = STATUS_CONFIG[campaign.status]
                return (
                  <div
                    key={campaign.id}
                    onClick={() => {
                      setSelectedDayCampaigns(null)
                      setSelectedCampaign(campaign)
                    }}
                    className="flex items-center gap-4 p-4 rounded-xl bg-muted border border-border/50 cursor-pointer hover:bg-muted/80 transition-all"
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: campaign.color || "#3b82f6" }}
                    >
                      <ChannelIcon className="h-6 w-6 text-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{campaign.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {campaign.scheduledTime ? formatTime(campaign.scheduledTime) : "Sem horário"} •{" "}
                        {campaign.store?.store_name || "Loja"}
                      </p>
                    </div>
                    <Badge className={statusConfig?.color}>
                      {statusConfig?.label}
                    </Badge>
                  </div>
                )
              })}
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  )
}
