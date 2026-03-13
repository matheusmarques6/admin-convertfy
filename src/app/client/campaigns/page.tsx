"use client"

import { useState, useCallback, useMemo } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  MessageSquare,
  Store,
  AlertCircle,
  RefreshCw,
  DollarSign,
  Users,
  Eye,
  Send,
  Filter,
  LayoutGrid,
  List,
  Target,
  CheckCircle,
  FileText,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
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
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils/format"
import { usePortalCampaignsCalendar } from "@/lib/hooks/use-portal-campaigns-calendar"
import type { PortalCampaign } from "@/lib/hooks/use-portal-campaigns-calendar"

// ============================================
// TYPES
// ============================================

// Use PortalCampaign from hook as the canonical type
type Campaign = PortalCampaign

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
  weightedOpenRate: number | null
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
    lightColor: "bg-primary/10",
    textColor: "text-primary",
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

// formatCurrency and formatCurrencyCompact imported from @/lib/utils/format

function formatNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
  return new Intl.NumberFormat("pt-BR").format(value)
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
          text-xs px-2 py-1 rounded-md flex flex-col
          text-white cursor-pointer hover:opacity-80 transition-all
        `}
        style={{ backgroundColor: campaign.color || "#3b82f6" }}
        title={campaign.name}
      >
        <div className="flex items-center gap-1.5 truncate">
          <ChannelIcon className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{campaign.name}</span>
        </div>
        {campaign.hasKlaviyoMetrics && campaign.status === "sent" && (
          <span className="text-[10px] text-white/70 truncate">
            {(campaign.openRate ?? 0).toFixed(1)}% ab · {formatCurrencyCompact(campaign.revenue ?? 0)}
          </span>
        )}
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
          <p className="font-medium text-slate-800 dark:text-slate-100 text-sm truncate group-hover:text-primary transition-colors">
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

// ============================================
// TRANSFORM: Pure function — converts API response to Campaign type
// Moved outside component (QA note C3 from 41.3)
// ============================================

interface ApiCampaignRaw {
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
  open_rate?: number | null
  click_rate?: number | null
  bounce_rate?: number | null
  conversion_rate?: number | null
  revenue_per_recipient?: number | null
  average_order_value?: number | null
  has_klaviyo_metrics?: boolean | null
  metrics_fetched_at?: string | null
  currency?: string | null
  color?: string | null
  store_ids?: string[]
  store_names?: string[]
  stores_count?: number
  source?: string
}

const STATUS_MAP: Record<string, Campaign["status"]> = {
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

const CHANNEL_MAP: Record<string, Campaign["channel"]> = {
  email: "email",
  sms: "sms",
  push: "push",
  whatsapp: "sms",
}

const COLOR_MAP: Record<string, string> = {
  email: "#3b82f6",
  sms: "#10b981",
  push: "#8b5cf6",
  whatsapp: "#25d366",
}

function transformCampaignData(apiCampaign: ApiCampaignRaw): Campaign {
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

  const rawChannel = apiCampaign.channel || apiCampaign.campaign_type
  const resolvedChannel = CHANNEL_MAP[rawChannel] || "email"

  const storeIds = apiCampaign.store_ids || []
  const storeNames = apiCampaign.store_names || []

  return {
    id: apiCampaign.id,
    name: apiCampaign.name,
    description: apiCampaign.description || undefined,
    channel: resolvedChannel,
    type: apiCampaign.campaign_type,
    status: STATUS_MAP[apiCampaign.status] || "scheduled",
    scheduledDate: dateStr,
    scheduledTime: timeStr,
    color: apiCampaign.color || COLOR_MAP[rawChannel] || "#3b82f6",
    subjectLine: apiCampaign.subject_line || undefined,
    segmentName: apiCampaign.segment_name || undefined,
    recipients: apiCampaign.recipients || undefined,
    delivered: apiCampaign.delivered || undefined,
    opened: apiCampaign.opened || undefined,
    clicked: apiCampaign.clicked || undefined,
    converted: apiCampaign.converted || undefined,
    revenue: apiCampaign.revenue || undefined,
    currency: apiCampaign.currency || "BRL",
    source: (apiCampaign.source as Campaign["source"]) || "manual",
    storeNames: storeNames.length > 0 ? storeNames : undefined,
    store: storeIds.length > 0 ? {
      id: storeIds[0],
      store_name: storeNames[0] || "Loja",
    } : undefined,
    openRate: apiCampaign.open_rate ?? 0,
    clickRate: apiCampaign.click_rate ?? 0,
    bounceRate: apiCampaign.bounce_rate ?? 0,
    conversionRate: apiCampaign.conversion_rate ?? 0,
    revenuePerRecipient: apiCampaign.revenue_per_recipient ?? 0,
    averageOrderValue: apiCampaign.average_order_value ?? 0,
    hasKlaviyoMetrics: apiCampaign.has_klaviyo_metrics ?? false,
    metricsFetchedAt: apiCampaign.metrics_fetched_at ?? null,
  }
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function PortalCampaignsPage() {
  // ============================================
  // HOOK: campaign list + navigation + lazy metrics (SWR)
  // ============================================
  const {
    campaigns: rawApiCampaigns,
    selectedCampaign,
    campaignMetrics,
    month,
    year,
    goToPreviousMonth,
    goToNextMonth,
    goToToday,
    selectedStore: hookSelectedStore,
    setSelectedStore: hookSetSelectedStore,
    selectCampaign,
    isLoading: loading,
    isLoadingMetrics,
    error: hookError,
    mutate: mutateCampaigns,
  } = usePortalCampaignsCalendar()

  // View mode (month/week) — local to page
  const [viewMode, setViewMode] = useState<"month" | "week">("month")

  // Additional filters — applied client-side
  const [selectedChannel, setSelectedChannel] = useState("all")
  const [selectedStatus, setSelectedStatus] = useState("all")

  // Day-campaigns list modal state
  const [selectedDayCampaigns, setSelectedDayCampaigns] = useState<Campaign[] | null>(null)
  const [selectedDayDate, setSelectedDayDate] = useState<string | null>(null)

  // Adapt hook store filter to "all" pattern used by Select component
  const selectedStore = hookSelectedStore ?? "all"
  const setSelectedStore = useCallback((value: string) => {
    hookSetSelectedStore(value === "all" ? null : value)
  }, [hookSetSelectedStore])

  // Error as string for backward compat
  const error = hookError?.message ?? null

  // Calendar calculations
  const currentDate = new Date(year, month, 1)
  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  const startingDayOfWeek = firstDayOfMonth.getDay()

  // Week calculations - memoized to prevent infinite loops
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weekStart = useMemo(() => getStartOfWeek(currentDate), [year, month])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weekEnd = useMemo(() => getEndOfWeek(currentDate), [year, month])
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  // Transform raw API campaigns (from SWR hook) into calendar format
  // Raw API data is snake_case Record<string, any>, cast to match transform signature
  const allTransformed = useMemo(
    () => rawApiCampaigns.map((c) => transformCampaignData(c as ApiCampaignRaw)),
    [rawApiCampaigns]
  )

  // Extract unique stores from raw API data for the store filter
  const stores = useMemo(() => {
    const uniqueStores = new Map<string, StoreOption>()
    rawApiCampaigns.forEach((c) => {
      const ids: string[] = c.store_ids || []
      const names: string[] = c.store_names || []
      ids.forEach((id: string, index: number) => {
        if (!uniqueStores.has(id)) {
          uniqueStores.set(id, { id, store_name: names[index] || "Loja" })
        }
      })
    })
    return Array.from(uniqueStores.values())
  }, [rawApiCampaigns])

  // Apply client-side channel and status filters
  const campaigns = useMemo(() => {
    let filtered = allTransformed
    if (selectedChannel !== "all") {
      filtered = filtered.filter(c => c.channel === selectedChannel)
    }
    if (selectedStatus !== "all") {
      filtered = filtered.filter(c => c.status === selectedStatus)
    }
    return filtered
  }, [allTransformed, selectedChannel, selectedStatus])

  // Calculate stats from filtered campaigns
  const stats = useMemo<Stats>(() => {
    const sentCampaigns = campaigns.filter(c => c.status === "sent")
    const withMetrics = sentCampaigns.filter(c => c.hasKlaviyoMetrics)

    const totalRecipientsWithMetrics = withMetrics.reduce((s, c) => s + (c.recipients ?? 0), 0)
    const weightedOpenRate = withMetrics.length > 0 && totalRecipientsWithMetrics > 0
      ? withMetrics.reduce((s, c) => s + (c.openRate ?? 0) * (c.recipients ?? 0), 0) / totalRecipientsWithMetrics
      : null

    return {
      total: campaigns.length,
      sent: sentCampaigns.length,
      scheduled: campaigns.filter(c => c.status === "scheduled").length,
      draft: campaigns.filter(c => c.status === "draft").length,
      totalRevenue: withMetrics.reduce((s, c) => s + (c.revenue ?? 0), 0),
      totalRecipients: sentCampaigns.reduce((s, c) => s + (c.recipients ?? 0), 0),
      totalOpens: campaigns.reduce((sum, c) => sum + (c.opened || 0), 0),
      totalClicks: campaigns.reduce((sum, c) => sum + (c.clicked || 0), 0),
      weightedOpenRate,
    }
  }, [campaigns])

  // Refetch helper (for manual refresh button)
  const fetchCampaigns = useCallback(() => { mutateCampaigns() }, [mutateCampaigns])

  // Navigation handlers — delegate to hook for month, local for week
  const goToPrev = () => {
    if (viewMode === "month") {
      goToPreviousMonth()
    } else {
      // Week navigation: hook doesn't manage week view, use month nav as fallback
      goToPreviousMonth()
    }
  }

  const goToNext = () => {
    if (viewMode === "month") {
      goToNextMonth()
    } else {
      goToNextMonth()
    }
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
      selectCampaign(dayCampaigns[0])
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
          <Button onClick={fetchCampaigns} className="bg-primary hover:bg-primary/85 text-white shadow-sm dark:shadow-slate-900/20">
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
            ${dayIsToday ? "bg-primary/5 border-primary/30" : "bg-white dark:bg-[#151922]"}
          `}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className={`
                text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full
                ${dayIsToday ? "bg-primary text-white" : "text-slate-500 dark:text-slate-400"}
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
                onClick={() => selectCampaign(campaign)}
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
                  ? "bg-primary/5 border-primary/30"
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
                    ${dayIsToday ? "text-primary" : "text-slate-800 dark:text-slate-100"}
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
                      onClick={() => selectCampaign(campaign)}
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
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Campanhas</h1>
            <p className="text-slate-500 dark:text-slate-400">
              Acompanhe campanhas de marketing e gere copies
            </p>
          </div>
        </div>

        {/* ========== CALENDAR CONTENT ========== */}
        <div className="space-y-6">

          {/* Calendar refresh button */}
          <div className="flex justify-end">
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
                title="Taxa de Abertura"
                value={stats.weightedOpenRate !== null ? `${stats.weightedOpenRate.toFixed(1)}%` : "--"}
                subtitle="media ponderada por destinatarios"
                icon={Eye}
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
                value={formatCurrencyCompact(stats.totalRevenue)}
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
                        ? "bg-primary text-white shadow-sm dark:shadow-slate-900/20"
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
                        ? "bg-primary text-white shadow-sm dark:shadow-slate-900/20"
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
          <Dialog open={!!selectedCampaign} onOpenChange={() => selectCampaign(null)}>
            <DialogContent className="bg-white dark:bg-[#151922] border-slate-200/80 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 max-w-lg sm:max-w-2xl">
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
                        <Badge className="bg-primary/10 text-primary border-primary/20">Lote</Badge>
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

                        {selectedCampaign.hasKlaviyoMetrics ? (
                          <>
                            {isLoadingMetrics ? (
                              <div className="grid grid-cols-3 gap-3">
                                {Array.from({ length: 6 }).map((_, i) => (
                                  <Skeleton key={i} className="h-20 rounded-lg" />
                                ))}
                              </div>
                            ) : campaignMetrics ? (
                              <>
                                <div className="grid grid-cols-3 gap-3">
                                  <div className="rounded-lg border p-3 text-center">
                                    <p className="text-2xl font-bold">{(campaignMetrics.delivered ?? 0).toLocaleString("pt-BR")}</p>
                                    <p className="text-xs text-muted-foreground">Entregues</p>
                                    <p className="text-sm text-muted-foreground">{(campaignMetrics.delivery_rate ?? 0).toFixed(1)}%</p>
                                  </div>
                                  <div className="rounded-lg border p-3 text-center">
                                    <p className="text-2xl font-bold">{(campaignMetrics.opened ?? 0).toLocaleString("pt-BR")}</p>
                                    <p className="text-xs text-muted-foreground">Aberturas</p>
                                    <p className="text-sm text-muted-foreground">{(campaignMetrics.open_rate ?? 0).toFixed(1)}%</p>
                                  </div>
                                  <div className="rounded-lg border p-3 text-center">
                                    <p className="text-2xl font-bold">{(campaignMetrics.clicked ?? 0).toLocaleString("pt-BR")}</p>
                                    <p className="text-xs text-muted-foreground">Cliques</p>
                                    <p className="text-sm text-muted-foreground">{(campaignMetrics.click_rate ?? 0).toFixed(1)}%</p>
                                  </div>
                                  <div className="rounded-lg border p-3 text-center">
                                    <p className="text-2xl font-bold">{(campaignMetrics.conversions ?? 0).toLocaleString("pt-BR")}</p>
                                    <p className="text-xs text-muted-foreground">Conversoes</p>
                                    <p className="text-sm text-muted-foreground">{(campaignMetrics.conversion_rate ?? 0).toFixed(1)}%</p>
                                  </div>
                                  <div className="rounded-lg border p-3 text-center">
                                    <p className="text-2xl font-bold">{formatCurrency(campaignMetrics.conversion_value ?? 0, selectedCampaign.currency || "BRL")}</p>
                                    <p className="text-xs text-muted-foreground">Receita</p>
                                  </div>
                                  <div className="rounded-lg border p-3 text-center">
                                    <p className="text-2xl font-bold">{formatCurrency(campaignMetrics.revenue_per_recipient ?? 0, selectedCampaign.currency || "BRL")}</p>
                                    <p className="text-xs text-muted-foreground">RPR</p>
                                  </div>
                                </div>
                                {campaignMetrics.fetched_at && (
                                  <p className="text-xs text-muted-foreground mt-2">
                                    Ultima atualizacao: {formatDistanceToNow(new Date(campaignMetrics.fetched_at), { locale: ptBR })} atras
                                  </p>
                                )}
                              </>
                            ) : (
                              /* campaignMetrics is null after loading — fallback to list data */
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
                                    {(selectedCampaign.openRate ?? 0).toFixed(1)}%
                                  </p>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">
                            Metricas disponiveis apos envio via Klaviyo
                          </p>
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
                        selectCampaign(campaign)
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
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge className={statusConfig?.color}>
                          {statusConfig?.label}
                        </Badge>
                        {campaign.status === "sent" && campaign.hasKlaviyoMetrics && (campaign.revenue ?? 0) > 0 && (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            {formatCurrencyCompact(campaign.revenue ?? 0)}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </DialogContent>
          </Dialog>

        </div>

      </div>
    </div>
  )
}
