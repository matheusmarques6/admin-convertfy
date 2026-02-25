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
  source?: "manual" | "klaviyo" | "batch"
  storeNames?: string[]
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
    lightColor: "bg-blue-50 dark:bg-blue-500/10",
    textColor: "text-blue-600",
    label: "Email"
  },
  sms: {
    icon: MessageSquare,
    color: "bg-emerald-500",
    lightColor: "bg-emerald-50 dark:bg-emerald-500/10",
    textColor: "text-emerald-600",
    label: "SMS"
  },
  push: {
    icon: Send,
    color: "bg-purple-500",
    lightColor: "bg-[#5327F2]/10",
    textColor: "text-[#5327F2]",
    label: "Push"
  },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dotColor: string }> = {
  draft: {
    label: "Rascunho",
    color: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/40",
    dotColor: "bg-slate-400"
  },
  pending_review: {
    label: "Em Revisão",
    color: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20",
    dotColor: "bg-blue-500"
  },
  approved: {
    label: "Aprovada",
    color: "bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-500/20",
    dotColor: "bg-teal-500"
  },
  rejected: {
    label: "Rejeitada",
    color: "bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-500/20",
    dotColor: "bg-orange-500"
  },
  scheduled: {
    label: "Agendada",
    color: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20",
    dotColor: "bg-blue-500"
  },
  sent: {
    label: "Enviada",
    color: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20",
    dotColor: "bg-emerald-500"
  },
  cancelled: {
    label: "Cancelada",
    color: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20",
    dotColor: "bg-red-500"
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
  iconColor = "text-emerald-600",
  iconBgColor = "bg-emerald-50 dark:bg-emerald-500/10",
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  iconColor?: string
  iconBgColor?: string
}) {
  const content = (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">{title}</p>
        <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
        {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{subtitle}</p>}
      </div>
      <div className={`rounded-xl p-3 ${iconBgColor}`}>
        <Icon className={`h-6 w-6 ${iconColor}`} />
      </div>
    </div>
  )

  return (
    <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-5 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow">
      {content}
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
          text-white cursor-pointer hover:opacity-80 transition-all
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
      className="rounded-lg bg-slate-50 dark:bg-[#1A1F2E] border border-slate-200/80 dark:border-slate-700/40 p-3 cursor-pointer hover:bg-white dark:hover:bg-[#151922] hover:shadow-sm dark:hover:shadow-slate-900/20 transition-all group"
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: campaign.color || "#3b82f6" }}
        >
          <ChannelIcon className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {campaign.scheduledTime && (
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {formatTime(campaign.scheduledTime)}
              </span>
            )}
            <Badge className={`text-[10px] ${statusConfig.color}`}>
              {statusConfig.label}
            </Badge>
          </div>
          <p className="font-medium text-slate-800 dark:text-slate-100 text-sm truncate group-hover:text-[#5327F2] transition-colors">
            {campaign.name}
          </p>
          {campaign.segmentName && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {campaign.segmentName}
            </p>
          )}
          {campaign.recipients && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
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

  // Transform API data to calendar format (unified: campaigns + campaign_batches)
  const transformCampaignData = (apiCampaign: {
    id: string
    name: string
    description?: string | null
    campaign_type: string
    channel?: string
    scheduled_at?: string
    scheduled_date?: string
    scheduled_time?: string
    status: string
    subject_line?: string | null
    segment_name?: string | null
    recipients?: number | null
    delivered?: number | null
    opened?: number | null
    clicked?: number | null
    converted?: number | null
    revenue?: number | null
    color?: string | null
    store_ids?: string[]
    store_names?: string[]
    stores_count?: number
    source?: string
  }): Campaign => {
    // Handle both scheduled_at (batches) and scheduled_date (campaigns)
    let dateStr: string
    let timeStr: string | undefined

    if (apiCampaign.scheduled_date) {
      dateStr = apiCampaign.scheduled_date
      timeStr = apiCampaign.scheduled_time || undefined
    } else if (apiCampaign.scheduled_at) {
      const scheduledDate = new Date(apiCampaign.scheduled_at)
      if (!isNaN(scheduledDate.getTime())) {
        dateStr = formatDateKey(scheduledDate)
        timeStr = scheduledDate.toTimeString().substring(0, 5)
      } else {
        dateStr = formatDateKey(new Date())
      }
    } else {
      dateStr = formatDateKey(new Date())
    }

    // Map API status to calendar status
    const statusMap: Record<string, "draft" | "scheduled" | "sent" | "cancelled"> = {
      draft: "draft",
      scheduled: "scheduled",
      pending_review: "scheduled",
      approved: "scheduled",
      processing: "scheduled",
      completed: "sent",
      sent: "sent",
      failed: "cancelled",
      cancelled: "cancelled",
      rejected: "cancelled",
    }

    // Map channel value (prioritize explicit channel field over campaign_type)
    const channelMap: Record<string, "email" | "sms" | "push"> = {
      email: "email",
      sms: "sms",
      push: "push",
      whatsapp: "sms",
    }

    // Use channel field first (from campaigns table), fall back to campaign_type (from batches)
    const rawChannel = apiCampaign.channel || apiCampaign.campaign_type
    const resolvedChannel = channelMap[rawChannel] || "email"

    // Color based on channel (use from API if available)
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
      description: apiCampaign.description || undefined,
      channel: resolvedChannel,
      type: apiCampaign.campaign_type,
      status: statusMap[apiCampaign.status] || "scheduled",
      scheduledDate: dateStr,
      scheduledTime: timeStr,
      color: apiCampaign.color || colorMap[rawChannel] || "#3b82f6",
      subjectLine: apiCampaign.subject_line || undefined,
      segmentName: apiCampaign.segment_name || undefined,
      recipients: apiCampaign.recipients || undefined,
      delivered: apiCampaign.delivered || undefined,
      opened: apiCampaign.opened || undefined,
      clicked: apiCampaign.clicked || undefined,
      converted: apiCampaign.converted || undefined,
      revenue: apiCampaign.revenue || undefined,
      source: (apiCampaign.source as Campaign["source"]) || "manual",
      storeNames: storeNames.length > 0 ? storeNames : undefined,
      store: storeIds.length > 0 ? {
        id: storeIds[0],
        store_name: storeNames[0] || "Loja",
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

      // Calculate stats with real metrics
      const calculatedStats: Stats = {
        total: transformedCampaigns.length,
        sent: transformedCampaigns.filter((c: Campaign) => c.status === "sent").length,
        scheduled: transformedCampaigns.filter((c: Campaign) => c.status === "scheduled").length,
        draft: transformedCampaigns.filter((c: Campaign) => c.status === "draft").length,
        totalRevenue: transformedCampaigns.reduce((sum: number, c: Campaign) => sum + (c.revenue || 0), 0),
        totalRecipients: transformedCampaigns.reduce((sum: number, c: Campaign) => sum + (c.recipients || 0), 0),
        totalOpens: transformedCampaigns.reduce((sum: number, c: Campaign) => sum + (c.opened || 0), 0),
        totalClicks: transformedCampaigns.reduce((sum: number, c: Campaign) => sum + (c.clicked || 0), 0),
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
      <div className="min-h-screen bg-slate-50/50 dark:bg-[#0B0E14] p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-64 bg-white dark:bg-[#151922]" />
          <Skeleton className="h-10 w-32 bg-white dark:bg-[#151922]" />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl bg-white dark:bg-[#151922]" />
          ))}
        </div>
        <Skeleton className="h-12 rounded-xl bg-white dark:bg-[#151922]" />
        <Skeleton className="h-[500px] rounded-xl bg-white dark:bg-[#151922]" />
      </div>
    )
  }

  // ============================================
  // RENDER: Error State
  // ============================================
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50/50 dark:bg-[#0B0E14] flex flex-col items-center justify-center p-6">
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-8 text-center max-w-md">
          <div className="rounded-full bg-red-50 dark:bg-red-500/10 p-4 w-fit mx-auto mb-4">
            <AlertCircle className="h-10 w-10 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">Erro ao carregar</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6">{error}</p>
          <Button onClick={fetchCampaigns} className="bg-[#5327F2] hover:bg-[#4520D4] text-white shadow-sm dark:shadow-slate-900/20">
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
          className="min-h-[120px] bg-slate-50/50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-700/30"
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
            min-h-[120px] border border-slate-100 dark:border-slate-700/30 p-2 cursor-pointer transition-all
            hover:bg-slate-50 dark:hover:bg-white/[0.06]
            ${dayIsToday ? "bg-[#5327F2]/5 border-[#5327F2]/30" : "bg-white dark:bg-[#151922]"}
          `}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className={`
                text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full
                ${dayIsToday ? "bg-[#5327F2] text-white" : "text-slate-500 dark:text-slate-400"}
              `}
            >
              {day}
            </span>
            {dayCampaigns.length > 3 && (
              <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
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
                  ? "bg-[#5327F2]/5 border-[#5327F2]/30"
                  : "bg-white dark:bg-[#151922] border-slate-200/80 dark:border-slate-700/40"
                }
              `}
            >
              {/* Day Header */}
              <div className="text-center mb-3 pb-3 border-b border-slate-200/80 dark:border-slate-700/40">
                <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                  {WEEK_DAYS[date.getDay()]}
                </p>
                <p
                  className={`
                    text-2xl font-bold mt-1
                    ${dayIsToday ? "text-[#5327F2]" : "text-slate-800 dark:text-slate-100"}
                  `}
                >
                  {date.getDate()}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {MONTH_NAMES[date.getMonth()].substring(0, 3)}
                </p>
              </div>

              {/* Campaigns */}
              <div className="space-y-2">
                {dayCampaigns.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-4">
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
    <div className="min-h-screen bg-slate-50/50 dark:bg-[#0B0E14] text-slate-800 dark:text-slate-100">
      <div className="max-w-[1600px] mx-auto p-6 space-y-6">

        {/* ========== HEADER ========== */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Calendário de Campanhas</h1>
            <p className="text-slate-500 dark:text-slate-400">
              Acompanhe todas as campanhas de marketing programadas
            </p>
          </div>
          <Button
            variant="outline"
            onClick={fetchCampaigns}
            disabled={loading}
            className="bg-white dark:bg-[#151922] border-slate-200/80 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06] shadow-sm dark:shadow-slate-900/20"
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
              iconColor="text-amber-600"
              iconBgColor="bg-amber-50 dark:bg-amber-500/10"
            />
            <StatCard
              title="Enviadas"
              value={stats.sent}
              subtitle="no período"
              icon={CheckCircle}
              iconColor="text-emerald-600"
              iconBgColor="bg-emerald-50 dark:bg-emerald-500/10"
            />
            <StatCard
              title="Destinatários"
              value={formatNumber(stats.totalRecipients)}
              subtitle="emails enviados"
              icon={Users}
              iconColor="text-[#05AFF2]"
              iconBgColor="bg-sky-50 dark:bg-sky-500/10"
            />
            <StatCard
              title="Receita"
              value={formatCurrency(stats.totalRevenue)}
              subtitle="atribuída às campanhas"
              icon={DollarSign}
              iconColor="text-emerald-600"
              iconBgColor="bg-emerald-50 dark:bg-emerald-500/10"
            />
          </div>
        )}

        {/* ========== FILTERS & NAVIGATION ========== */}
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

            {/* Left: View Toggle + Navigation */}
            <div className="flex items-center gap-3">
              {/* View Toggle */}
              <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
                <button
                  onClick={() => setViewMode("month")}
                  className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all
                    ${viewMode === "month"
                      ? "bg-[#5327F2] text-white shadow-sm dark:shadow-slate-900/20"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
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
                      ? "bg-[#5327F2] text-white shadow-sm dark:shadow-slate-900/20"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
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
                  className="bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="w-44 text-center">
                  <h2 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">
                    {getNavigationTitle()}
                  </h2>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={goToNext}
                  className="bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToToday}
                  className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Hoje
                </Button>
              </div>
            </div>

            {/* Right: Filters */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Store Filter */}
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger className="w-[160px] h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100">
                  <Store className="h-4 w-4 mr-2 text-slate-400 dark:text-slate-500" />
                  <SelectValue placeholder="Loja" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40">
                  <SelectItem value="all" className="text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
                    Todas as lojas
                  </SelectItem>
                  {stores.map((store) => (
                    <SelectItem
                      key={store.id}
                      value={store.id}
                      className="text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
                    >
                      {store.store_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Channel Filter */}
              <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                <SelectTrigger className="w-[140px] h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100">
                  <Mail className="h-4 w-4 mr-2 text-slate-400 dark:text-slate-500" />
                  <SelectValue placeholder="Canal" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40">
                  <SelectItem value="all" className="text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
                    Todos os canais
                  </SelectItem>
                  <SelectItem value="email" className="text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-blue-500" />
                      Email
                    </div>
                  </SelectItem>
                  <SelectItem value="sms" className="text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-emerald-500" />
                      SMS
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Status Filter */}
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-[150px] h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100">
                  <Filter className="h-4 w-4 mr-2 text-slate-400 dark:text-slate-500" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40">
                  <SelectItem value="all" className="text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
                    Todos os status
                  </SelectItem>
                  <SelectItem value="scheduled" className="text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      Agendada
                    </div>
                  </SelectItem>
                  <SelectItem value="sent" className="text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      Enviada
                    </div>
                  </SelectItem>
                  <SelectItem value="draft" className="text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-slate-400" />
                      Rascunho
                    </div>
                  </SelectItem>
                  <SelectItem value="cancelled" className="text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
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
            <span className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide">Canal:</span>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-blue-500" />
              <span className="text-xs text-slate-500 dark:text-slate-400">Email</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-emerald-500" />
              <span className="text-xs text-slate-500 dark:text-slate-400">SMS</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide">Status:</span>
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${config.dotColor}`} />
                <span className="text-xs text-slate-500 dark:text-slate-400">{config.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ========== CALENDAR ========== */}
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
          {viewMode === "month" ? (
            <>
              {/* Week days header */}
              <div className="grid grid-cols-7 bg-slate-50 dark:bg-[#1A1F2E]">
                {WEEK_DAYS.map((day, index) => (
                  <div
                    key={day}
                    className={`
                      py-3 text-center text-sm font-medium text-slate-500 dark:text-slate-400
                      border-r border-slate-100 dark:border-slate-700/30 last:border-r-0
                      ${index === 0 || index === 6 ? "text-slate-400 dark:text-slate-500" : ""}
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
          <DialogContent className="bg-white dark:bg-[#151922] border-slate-200/80 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 max-w-lg">
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
                        return <ChannelIcon className="h-6 w-6 text-white" />
                      })()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <DialogTitle className="text-xl text-slate-800 dark:text-slate-100">
                        {selectedCampaign.name}
                      </DialogTitle>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        {selectedCampaign.storeNames && selectedCampaign.storeNames.length > 1
                          ? selectedCampaign.storeNames.join(", ")
                          : selectedCampaign.store?.store_name || "Loja"}{" "}
                        • {formatDate(selectedCampaign.scheduledDate)}
                        {selectedCampaign.scheduledTime && ` às ${formatTime(selectedCampaign.scheduledTime)}`}
                      </p>
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-5 mt-4">
                  {/* Status, Channel and Source */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={STATUS_CONFIG[selectedCampaign.status]?.color}>
                      {STATUS_CONFIG[selectedCampaign.status]?.label}
                    </Badge>
                    <Badge className={`${CHANNEL_CONFIG[selectedCampaign.channel]?.lightColor} ${CHANNEL_CONFIG[selectedCampaign.channel]?.textColor} border-0`}>
                      {CHANNEL_CONFIG[selectedCampaign.channel]?.label}
                    </Badge>
                    {selectedCampaign.source === "klaviyo" && (
                      <Badge className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20">Klaviyo</Badge>
                    )}
                    {selectedCampaign.source === "batch" && (
                      <Badge className="bg-[#5327F2]/10 text-[#5327F2] border-[#5327F2]/20">Lote</Badge>
                    )}
                  </div>

                  {/* Subject Line */}
                  {selectedCampaign.subjectLine && (
                    <div className="rounded-lg bg-slate-50 dark:bg-[#1A1F2E] border border-slate-100 dark:border-slate-700/30 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                        <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide">Assunto</p>
                      </div>
                      <p className="text-sm text-slate-800 dark:text-slate-100">{selectedCampaign.subjectLine}</p>
                    </div>
                  )}

                  {/* Segment */}
                  {selectedCampaign.segmentName && (
                    <div className="rounded-lg bg-slate-50 dark:bg-[#1A1F2E] border border-slate-100 dark:border-slate-700/30 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                        <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide">Segmento</p>
                      </div>
                      <p className="text-sm text-slate-800 dark:text-slate-100">{selectedCampaign.segmentName}</p>
                    </div>
                  )}

                  {/* Description */}
                  {selectedCampaign.description && (
                    <div>
                      <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">Descrição</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{selectedCampaign.description}</p>
                    </div>
                  )}

                  {/* Performance Metrics (only for sent campaigns) */}
                  {selectedCampaign.status === "sent" && (
                    <div className="border-t border-slate-200/80 dark:border-slate-700/40 pt-5">
                      <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-4">Performance</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-lg bg-sky-50 dark:bg-sky-500/10 border border-sky-100 dark:border-sky-500/20 p-3">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-[#05AFF2]" />
                            <span className="text-xs text-slate-500 dark:text-slate-400">Enviados</span>
                          </div>
                          <p className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1">
                            {formatNumber(selectedCampaign.recipients || 0)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 p-3">
                          <div className="flex items-center gap-2">
                            <Eye className="h-4 w-4 text-emerald-600" />
                            <span className="text-xs text-slate-500 dark:text-slate-400">Abertura</span>
                          </div>
                          <p className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1">
                            {formatPercent(selectedCampaign.opened || 0, selectedCampaign.delivered || 0)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 p-3">
                          <div className="flex items-center gap-2">
                            <MousePointerClick className="h-4 w-4 text-amber-600" />
                            <span className="text-xs text-slate-500 dark:text-slate-400">Cliques</span>
                          </div>
                          <p className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1">
                            {formatPercent(selectedCampaign.clicked || 0, selectedCampaign.delivered || 0)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-[#5327F2]/5 border border-[#5327F2]/10 p-3">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-[#5327F2]" />
                            <span className="text-xs text-slate-500 dark:text-slate-400">Conversões</span>
                          </div>
                          <p className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1">
                            {formatNumber(selectedCampaign.converted || 0)}
                          </p>
                        </div>
                      </div>
                      {(selectedCampaign.revenue || 0) > 0 && (
                        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 p-4 mt-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-5 w-5 text-emerald-600" />
                              <span className="text-sm text-slate-500 dark:text-slate-400">Receita Gerada</span>
                            </div>
                            <p className="text-xl font-bold text-emerald-600">
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
          <DialogContent className="bg-white dark:bg-[#151922] border-slate-200/80 dark:border-slate-700/40 text-slate-800 dark:text-slate-100">
            <DialogHeader>
              <DialogTitle className="text-slate-800 dark:text-slate-100">
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
                    className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 dark:bg-[#1A1F2E] border border-slate-200/80 dark:border-slate-700/40 cursor-pointer hover:bg-white dark:hover:bg-[#151922] hover:shadow-md dark:hover:shadow-slate-900/30 transition-all"
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: campaign.color || "#3b82f6" }}
                    >
                      <ChannelIcon className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 dark:text-slate-100 truncate">{campaign.name}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
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
