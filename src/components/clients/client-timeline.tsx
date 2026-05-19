"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import {
  UserPlus,
  DollarSign,
  Calendar,
  FileText,
  MessageSquare,
  Edit,
  Tag,
  Mail,
  Loader2,
  Download,
  Plus,
  Smartphone,
  ArrowRight,
  Store as StoreIcon,
  TestTube2,
  Plug,
  RefreshCw,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { getInitials } from "@/lib/utils"
import type { Activity, Meeting } from "@/types"

interface ClientTimelineProps {
  clientId: string
}

// ─── Activity type → meta ─────────────────────────────────

interface ActivityMeta {
  icon: LucideIcon
  label: string
  category: ActivityCategory
  badgeBg: string
  badgeText: string
  iconBg: string
  iconColor: string
}

type ActivityCategory = "feedback" | "financeiro" | "reuniao" | "teste" | "sistema" | "loja" | "integracao"

// Preset visuals per category (used for metadata.kind sobrescritas)
const CATEGORY_VISUAL: Record<ActivityCategory, { icon: typeof Edit; label: string; badgeBg: string; badgeText: string; iconBg: string; iconColor: string }> = {
  feedback: {
    icon: MessageSquare,
    label: "FEEDBACK",
    badgeBg: "bg-[#EEF0FB] dark:bg-[#141C3D]",
    badgeText: "text-[#2137B6] dark:text-[#7B8CEA]",
    iconBg: "bg-[#EEF0FB] dark:bg-[#141C3D]",
    iconColor: "text-[#2137B6] dark:text-[#7B8CEA]",
  },
  financeiro: {
    icon: DollarSign,
    label: "FINANCEIRO",
    badgeBg: "bg-[#ECFDF5] dark:bg-[#0B2C24]",
    badgeText: "text-[#065F46] dark:text-[#6EE7B7]",
    iconBg: "bg-[#ECFDF5] dark:bg-[#0B2C24]",
    iconColor: "text-[#065F46] dark:text-[#6EE7B7]",
  },
  reuniao: {
    icon: Calendar,
    label: "REUNIÃO",
    badgeBg: "bg-[#FFFBEB] dark:bg-[#3D2A0D]",
    badgeText: "text-[#92400E] dark:text-[#FCD34D]",
    iconBg: "bg-[#FFFBEB] dark:bg-[#3D2A0D]",
    iconColor: "text-[#92400E] dark:text-[#FCD34D]",
  },
  teste: {
    icon: TestTube2,
    label: "TESTE A/B",
    badgeBg: "bg-[#F3E8FF] dark:bg-[#2D1B4E]",
    badgeText: "text-[#6B21A8] dark:text-[#C4B5FD]",
    iconBg: "bg-[#F3E8FF] dark:bg-[#2D1B4E]",
    iconColor: "text-[#6B21A8] dark:text-[#C4B5FD]",
  },
  loja: {
    icon: StoreIcon,
    label: "LOJA",
    badgeBg: "bg-[#F3F4F6] dark:bg-[rgba(255,255,255,0.04)]",
    badgeText: "text-gray-700 dark:text-[#EAEDF3]",
    iconBg: "bg-[#1F1F1F] dark:bg-[#0B0B0B]",
    iconColor: "text-white",
  },
  integracao: {
    icon: Plug,
    label: "INTEGRAÇÃO",
    badgeBg: "bg-[#ECFDF5] dark:bg-[#0B2C24]",
    badgeText: "text-[#065F46] dark:text-[#6EE7B7]",
    iconBg: "bg-[#ECFDF5] dark:bg-[#0B2C24]",
    iconColor: "text-[#065F46] dark:text-[#6EE7B7]",
  },
  sistema: {
    icon: Edit,
    label: "SISTEMA",
    badgeBg: "bg-[#F3F4F6] dark:bg-[rgba(255,255,255,0.04)]",
    badgeText: "text-gray-600 dark:text-[#8B92A5]",
    iconBg: "bg-[#F3F4F6] dark:bg-[rgba(255,255,255,0.04)]",
    iconColor: "text-gray-500 dark:text-[#5C6378]",
  },
}

const ACTIVITY_META: Record<string, ActivityMeta> = {
  note_added: {
    icon: MessageSquare,
    label: "FEEDBACK",
    category: "feedback",
    badgeBg: "bg-[#EEF0FB] dark:bg-[#141C3D]",
    badgeText: "text-[#2137B6] dark:text-[#7B8CEA]",
    iconBg: "bg-[#EEF0FB] dark:bg-[#141C3D]",
    iconColor: "text-[#2137B6] dark:text-[#7B8CEA]",
  },
  email_sent: {
    icon: Mail,
    label: "EMAIL",
    category: "sistema",
    badgeBg: "bg-[#EEF0FB] dark:bg-[#141C3D]",
    badgeText: "text-[#2137B6] dark:text-[#7B8CEA]",
    iconBg: "bg-[#EEF0FB] dark:bg-[#141C3D]",
    iconColor: "text-[#2137B6] dark:text-[#7B8CEA]",
  },
  whatsapp_sent: {
    icon: Smartphone,
    label: "WHATSAPP",
    category: "sistema",
    badgeBg: "bg-[#ECFDF5] dark:bg-[#0B2C24]",
    badgeText: "text-[#065F46] dark:text-[#6EE7B7]",
    iconBg: "bg-[#ECFDF5] dark:bg-[#0B2C24]",
    iconColor: "text-[#065F46] dark:text-[#6EE7B7]",
  },
  payment_received: {
    icon: DollarSign,
    label: "FINANCEIRO",
    category: "financeiro",
    badgeBg: "bg-[#ECFDF5] dark:bg-[#0B2C24]",
    badgeText: "text-[#065F46] dark:text-[#6EE7B7]",
    iconBg: "bg-[#ECFDF5] dark:bg-[#0B2C24]",
    iconColor: "text-[#065F46] dark:text-[#6EE7B7]",
  },
  payment_overdue: {
    icon: DollarSign,
    label: "FINANCEIRO",
    category: "financeiro",
    badgeBg: "bg-[#FEF2F2] dark:bg-[#3B1111]",
    badgeText: "text-[#991B1B] dark:text-[#FCA5A5]",
    iconBg: "bg-[#FEF2F2] dark:bg-[#3B1111]",
    iconColor: "text-[#991B1B] dark:text-[#FCA5A5]",
  },
  meeting_scheduled: {
    icon: Calendar,
    label: "REUNIÃO",
    category: "reuniao",
    badgeBg: "bg-[#FFFBEB] dark:bg-[#3D2A0D]",
    badgeText: "text-[#92400E] dark:text-[#FCD34D]",
    iconBg: "bg-[#FFFBEB] dark:bg-[#3D2A0D]",
    iconColor: "text-[#92400E] dark:text-[#FCD34D]",
  },
  meeting_completed: {
    icon: Calendar,
    label: "REUNIÃO",
    category: "reuniao",
    badgeBg: "bg-[#FFFBEB] dark:bg-[#3D2A0D]",
    badgeText: "text-[#92400E] dark:text-[#FCD34D]",
    iconBg: "bg-[#FFFBEB] dark:bg-[#3D2A0D]",
    iconColor: "text-[#92400E] dark:text-[#FCD34D]",
  },
  status_changed: {
    icon: Tag,
    label: "STATUS",
    category: "sistema",
    badgeBg: "bg-[#F3F4F6] dark:bg-[rgba(255,255,255,0.04)]",
    badgeText: "text-gray-600 dark:text-[#8B92A5]",
    iconBg: "bg-[#F3F4F6] dark:bg-[rgba(255,255,255,0.04)]",
    iconColor: "text-gray-500 dark:text-[#5C6378]",
  },
  client_created: {
    icon: UserPlus,
    label: "CLIENTE",
    category: "sistema",
    badgeBg: "bg-[#EEF0FB] dark:bg-[#141C3D]",
    badgeText: "text-[#2137B6] dark:text-[#7B8CEA]",
    iconBg: "bg-[#EEF0FB] dark:bg-[#141C3D]",
    iconColor: "text-[#2137B6] dark:text-[#7B8CEA]",
  },
  client_updated: {
    icon: Edit,
    label: "CLIENTE",
    category: "sistema",
    badgeBg: "bg-[#F3F4F6] dark:bg-[rgba(255,255,255,0.04)]",
    badgeText: "text-gray-600 dark:text-[#8B92A5]",
    iconBg: "bg-[#F3F4F6] dark:bg-[rgba(255,255,255,0.04)]",
    iconColor: "text-gray-500 dark:text-[#5C6378]",
  },
  report_uploaded: {
    icon: FileText,
    label: "RELATÓRIO",
    category: "sistema",
    badgeBg: "bg-[#FFFBEB] dark:bg-[#3D2A0D]",
    badgeText: "text-[#92400E] dark:text-[#FCD34D]",
    iconBg: "bg-[#FFFBEB] dark:bg-[#3D2A0D]",
    iconColor: "text-[#92400E] dark:text-[#FCD34D]",
  },
  deal_created: {
    icon: Tag,
    label: "DEAL",
    category: "sistema",
    badgeBg: "bg-[#EEF0FB] dark:bg-[#141C3D]",
    badgeText: "text-[#2137B6] dark:text-[#7B8CEA]",
    iconBg: "bg-[#EEF0FB] dark:bg-[#141C3D]",
    iconColor: "text-[#2137B6] dark:text-[#7B8CEA]",
  },
}

function getActivityMeta(type: string, metadata?: Record<string, unknown>): ActivityMeta {
  // metadata.kind sobrescreve categoria + visual (ex: kind="loja_criada" → categoria "loja")
  const kind = metadata?.kind as ActivityCategory | undefined
  if (kind && CATEGORY_VISUAL[kind]) {
    const visual = CATEGORY_VISUAL[kind]
    return {
      icon: visual.icon,
      label: (metadata?.label as string) ?? visual.label,
      category: kind,
      badgeBg: visual.badgeBg,
      badgeText: visual.badgeText,
      iconBg: visual.iconBg,
      iconColor: visual.iconColor,
    }
  }

  return (
    ACTIVITY_META[type] ?? {
      icon: Edit,
      label: type.replace(/_/g, " ").toUpperCase(),
      category: "sistema",
      badgeBg: "bg-[#F3F4F6] dark:bg-[rgba(255,255,255,0.04)]",
      badgeText: "text-gray-600 dark:text-[#8B92A5]",
      iconBg: "bg-[#F3F4F6] dark:bg-[rgba(255,255,255,0.04)]",
      iconColor: "text-gray-500 dark:text-[#5C6378]",
    }
  )
}

const CATEGORY_FILTERS: { value: ActivityCategory | "all"; label: string; dot?: string }[] = [
  { value: "all", label: "Todos" },
  { value: "feedback", label: "Feedbacks", dot: "bg-[#2137B6]" },
  { value: "financeiro", label: "Financeiro", dot: "bg-[#10B981]" },
  { value: "reuniao", label: "Reuniões", dot: "bg-[#F59E0B]" },
  { value: "teste", label: "Testes & Entregas", dot: "bg-[#7C3AED]" },
  { value: "loja", label: "Lojas", dot: "bg-gray-700" },
  { value: "integracao", label: "Integrações", dot: "bg-[#065F46]" },
  { value: "sistema", label: "Sistema", dot: "bg-gray-400" },
]

// ─── Upcoming meeting card ────────────────────────────────

function UpcomingMeetingCard({
  meeting,
  ownerName,
  ownerInitials,
}: {
  meeting: Meeting
  ownerName?: string
  ownerInitials?: string
}) {
  const date = new Date(meeting.scheduled_at)
  const monthShort = date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")
  const day = date.getDate()

  return (
    <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
      <CardContent className="p-3 flex items-start gap-3">
        <div className="w-12 h-12 rounded-[6px] bg-[#EEF0FB] dark:bg-[#141C3D] flex flex-col items-center justify-center shrink-0">
          <span className="text-[9px] font-semibold uppercase text-[#2137B6] dark:text-[#7B8CEA]">
            {monthShort}
          </span>
          <span className="text-base font-semibold text-[#2137B6] dark:text-[#7B8CEA] leading-none">
            {day}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
            {meeting.title}
          </p>
          <p className="text-[11px] text-gray-500 dark:text-[#8B92A5] mt-0.5">
            {date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            {meeting.meeting_url && " · Google Meet"}
          </p>
          {ownerName && (
            <div className="flex items-center gap-1.5 mt-2">
              <Avatar className="h-4 w-4">
                <AvatarFallback className="text-[8px] bg-[#ECFDF5] text-[#065F46]">
                  {ownerInitials}
                </AvatarFallback>
              </Avatar>
              <span className="text-[11px] text-gray-500 dark:text-[#8B92A5]">
                {ownerName.split(" ")[0]}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Event item ───────────────────────────────────────────

function EventItem({
  activity,
  ownerName,
}: {
  activity: Activity
  ownerName?: string
}) {
  const metadata = activity.metadata as Record<string, unknown> | undefined
  const meta = getActivityMeta(activity.type, metadata)
  const Icon = meta.icon
  const date = new Date(activity.created_at)

  const tags = (metadata?.tags as string[] | undefined) ?? []

  return (
    <div className="grid grid-cols-[80px_24px_1fr] gap-3 items-start">
      {/* Time */}
      <div className="text-right pt-1">
        <p className="text-[11px] font-medium text-gray-500 dark:text-[#8B92A5] whitespace-nowrap">
          {date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")}
        </p>
        <p className="text-[10px] text-gray-400 dark:text-[#5C6378]">
          {date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      {/* Icon */}
      <div className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0", meta.iconBg)}>
        <Icon className={cn("h-3 w-3", meta.iconColor)} />
      </div>

      {/* Content */}
      <div
        className={cn(
          "rounded-[6px] border border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)]",
          "bg-white dark:bg-[#1A1D27] p-3",
        )}
      >
        <div className="flex items-center gap-2 mb-1">
          <span
            className={cn(
              "inline-flex items-center px-1.5 py-0.5 text-[9px] font-semibold rounded-[4px] tracking-wider",
              meta.badgeBg,
              meta.badgeText,
            )}
          >
            {meta.label}
          </span>
          <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
            {(metadata?.title as string) ?? activity.description.split(".")[0]}
          </p>
        </div>
        {activity.description && (metadata?.title || activity.description.includes(".")) && (
          <p className="text-[12px] text-gray-500 dark:text-[#8B92A5] leading-relaxed">
            {(metadata?.description as string) ?? activity.description}
          </p>
        )}
        <div className="flex items-center justify-between gap-3 mt-2 flex-wrap">
          {ownerName ? (
            <div className="flex items-center gap-1.5">
              <Avatar className="h-4 w-4">
                <AvatarFallback className="text-[8px] bg-[#ECFDF5] text-[#065F46]">
                  {getInitials(ownerName)}
                </AvatarFallback>
              </Avatar>
              <span className="text-[11px] text-gray-500 dark:text-[#8B92A5]">
                {ownerName} {meta.category === "reuniao" || meta.category === "feedback" ? "· CSM" : ""}
              </span>
            </div>
          ) : <span />}
          {tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className={cn(
                    "inline-flex items-center px-1.5 py-0 text-[10px] font-medium rounded-[4px]",
                    meta.badgeBg,
                    meta.badgeText,
                  )}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────

export function ClientTimeline({ clientId }: ClientTimelineProps) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [upcomingMeetings, setUpcomingMeetings] = useState<Meeting[]>([])
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<ActivityCategory | "all">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [dateRange, setDateRange] = useState<"all" | "7d" | "30d" | "90d">("all")
  const [refreshing, setRefreshing] = useState(false)

  async function loadData() {
    const supabase = createClient()
    const [activitiesRes, meetingsRes] = await Promise.all([
      supabase
        .from("activities")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("meetings")
        .select("*")
        .eq("client_id", clientId)
        .eq("status", "scheduled")
        .gt("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(3),
    ])

    const activitiesData = activitiesRes.data || []
    setActivities(activitiesData)
    setUpcomingMeetings(meetingsRes.data || [])

    // Load owner names for activities
    const userIds = Array.from(
      new Set([
        ...activitiesData.map((a) => a.user_id),
        ...(meetingsRes.data?.map((m) => m.user_id) ?? []),
      ].filter(Boolean)),
    )
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", userIds)
      const map: Record<string, string> = {}
      for (const u of users ?? []) {
        map[u.id] = u.name
      }
      setOwnerNames(map)
    }
  }

  useEffect(() => {
    void loadData().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await loadData()
    } finally {
      setRefreshing(false)
    }
  }

  const filteredActivities = useMemo(() => {
    let list = activities
    if (filter !== "all") {
      list = list.filter((a) => getActivityMeta(a.type, a.metadata as Record<string, unknown> | undefined).category === filter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((a) => a.description?.toLowerCase().includes(q))
    }
    if (dateRange !== "all") {
      const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
      list = list.filter((a) => new Date(a.created_at).getTime() >= cutoff)
    }
    return list
  }, [activities, filter, searchQuery, dateRange])

  // Group by month
  const groupedActivities = useMemo(() => {
    const groups: Record<string, Activity[]> = {}
    for (const activity of filteredActivities) {
      const date = new Date(activity.created_at)
      const key = `${date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase()} ${date.getFullYear()}`
      if (!groups[key]) groups[key] = []
      groups[key].push(activity)
    }
    return groups
  }, [filteredActivities])

  // Counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: activities.length }
    for (const cat of CATEGORY_FILTERS) {
      if (cat.value === "all") continue
      counts[cat.value] = activities.filter((a) => getActivityMeta(a.type, a.metadata as Record<string, unknown> | undefined).category === cat.value).length
    }
    return counts
  }, [activities])

  function handleExport() {
    const csv = ["Data;Tipo;Descrição;Autor"]
    for (const a of activities) {
      const author = ownerNames[a.user_id] ?? ""
      csv.push(
        `${new Date(a.created_at).toLocaleString("pt-BR")};${getActivityMeta(a.type, a.metadata as Record<string, unknown> | undefined).label};${a.description.replace(/;/g, ",")};${author}`,
      )
    }
    const blob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `timeline-${clientId}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-[18px] font-semibold text-gray-900 dark:text-[#EAEDF3]">
            Timeline
          </h2>
          <p className="text-[13px] text-gray-500 dark:text-[#8B92A5] mt-0.5">
            {activities.length} eventos registrados · feedbacks, reuniões, otimizações, financeiro e sistema.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-8 w-8"
            aria-label="Atualizar timeline"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExport} disabled={activities.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Exportar
          </Button>
          <Button size="sm" asChild>
            <Link href={`/admin/meetings/new?clientId=${clientId}`}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Agendar reunião
            </Link>
          </Button>
        </div>
      </div>

      {/* Upcoming meetings */}
      {upcomingMeetings.length > 0 && (
        <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">Próximas reuniões</CardTitle>
              <p className="text-[12px] text-gray-500 dark:text-[#8B92A5] mt-0.5">
                Eventos agendados com este cliente
              </p>
            </div>
            <Link
              href="/admin/meetings"
              className="inline-flex items-center gap-1 text-xs font-medium text-[#4E62D8] dark:text-[#7B8CEA] hover:underline"
            >
              Ver agenda completa
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              {upcomingMeetings.map((m) => (
                <UpcomingMeetingCard
                  key={m.id}
                  meeting={m}
                  ownerName={ownerNames[m.user_id]}
                  ownerInitials={ownerNames[m.user_id] ? getInitials(ownerNames[m.user_id]) : undefined}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap flex-1">
          <span className="text-[12px] text-gray-500 dark:text-[#8B92A5]">Filtrar por tipo:</span>
          <div className="flex items-center gap-1 flex-wrap">
            {CATEGORY_FILTERS.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setFilter(cat.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[11px] font-medium transition-colors",
                  filter === cat.value
                    ? "bg-[#1F1F1F] dark:bg-[#0B0B0B] text-white border border-[#1F1F1F] dark:border-[#0B0B0B]"
                    : "bg-white dark:bg-[#1A1D27] text-gray-700 dark:text-[#EAEDF3] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] hover:border-gray-400 dark:hover:border-[rgba(255,255,255,0.2)]",
                )}
              >
                {cat.dot && <span className={cn("w-1.5 h-1.5 rounded-full", cat.dot)} />}
                {cat.label}
                {categoryCounts[cat.value] > 0 && (
                  <span className={cn("text-[10px]", filter === cat.value ? "text-white/60" : "text-gray-400")}>
                    {categoryCounts[cat.value]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-[6px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-0.5">
            {([
              { v: "all" as const, l: "Tudo" },
              { v: "7d" as const, l: "7d" },
              { v: "30d" as const, l: "30d" },
              { v: "90d" as const, l: "90d" },
            ]).map((d) => (
              <button
                key={d.v}
                onClick={() => setDateRange(d.v)}
                className={cn(
                  "px-2 py-0.5 text-[11px] font-medium rounded-[4px] transition-colors",
                  dateRange === d.v
                    ? "bg-[#EEF0FB] text-[#2137B6] dark:bg-[#141C3D] dark:text-[#7B8CEA]"
                    : "text-gray-500 dark:text-[#8B92A5] hover:text-gray-900 dark:hover:text-[#EAEDF3]",
                )}
              >
                {d.l}
              </button>
            ))}
          </div>
          <Input
            type="text"
            placeholder="Buscar evento..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-44 text-[12px]"
            aria-label="Buscar evento na timeline"
          />
          <span className="text-[11px] text-gray-400 dark:text-[#5C6378]">
            {filteredActivities.length} eventos
          </span>
        </div>
      </div>

      {/* Timeline */}
      {filteredActivities.length === 0 ? (
        <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-gray-400 dark:text-[#5C6378]">
              Nenhum evento {filter !== "all" ? "neste filtro" : "registrado"}.
            </p>
            {filter !== "all" && (
              <Button variant="ghost" size="sm" onClick={() => setFilter("all")} className="mt-2">
                Limpar filtros
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedActivities).map(([monthKey, items]) => (
            <div key={monthKey}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[11px] font-semibold tracking-[0.08em] text-gray-400 dark:text-[#5C6378]">
                  {monthKey}
                </h3>
                <span className="text-[10px] text-gray-400 dark:text-[#5C6378]">
                  {items.length} evento{items.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="space-y-3 relative">
                {items.map((activity) => (
                  <EventItem
                    key={activity.id}
                    activity={activity}
                    ownerName={ownerNames[activity.user_id]}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
