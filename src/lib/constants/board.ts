import {
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Ban,
  Search,
  Calendar as CalendarIcon,
} from "lucide-react"
import type { TaskType, TaskStatus, TaskPriority, MeetingStatus } from "@/types"

// =============================================
// TASK STATUS
// =============================================

export const TASK_STATUS_CONFIG: Record<
  TaskStatus,
  {
    label: string
    color: string
    calendarColor: string
    icon: typeof Clock
    showInKanban: boolean
  }
> = {
  pending: {
    label: "Pendente",
    color: "bg-slate-500",
    calendarColor: "bg-slate-100 text-slate-700 border-slate-200",
    icon: Clock,
    showInKanban: true,
  },
  in_progress: {
    label: "Em Andamento",
    color: "bg-blue-500",
    calendarColor: "bg-blue-100 text-blue-700 border-blue-200",
    icon: AlertCircle,
    showInKanban: true,
  },
  blocked: {
    label: "Bloqueado",
    color: "bg-red-500",
    calendarColor: "bg-red-100 text-red-700 border-red-200",
    icon: AlertCircle,
    showInKanban: true,
  },
  review: {
    label: "Em Revisão",
    color: "bg-amber-500",
    calendarColor: "bg-amber-100 text-amber-700 border-amber-200",
    icon: Search,
    showInKanban: true,
  },
  completed: {
    label: "Concluído",
    color: "bg-emerald-500",
    calendarColor: "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon: CheckCircle,
    showInKanban: true,
  },
  cancelled: {
    label: "Cancelado",
    color: "bg-gray-500",
    calendarColor: "bg-gray-100 text-gray-700 border-gray-200",
    icon: Ban,
    showInKanban: false,
  },
}

// Colunas do Kanban (só os status com showInKanban: true)
export const KANBAN_COLUMNS = (
  Object.entries(TASK_STATUS_CONFIG) as [TaskStatus, typeof TASK_STATUS_CONFIG[TaskStatus]][]
)
  .filter(([, config]) => config.showInKanban)
  .map(([id, config]) => ({
    id: id as TaskStatus,
    title: config.label,
    color: config.color,
  }))

// Status que o board/page.tsx busca do banco
export const KANBAN_FETCH_STATUSES = KANBAN_COLUMNS.map((col) => col.id)

// Todas as opções de status (para menus "Mover para", selects, etc.)
export const TASK_STATUS_OPTIONS = (
  Object.entries(TASK_STATUS_CONFIG) as [TaskStatus, typeof TASK_STATUS_CONFIG[TaskStatus]][]
).map(([value, config]) => ({
  value: value as TaskStatus,
  label: config.label,
}))

// =============================================
// TASK PRIORITY
// =============================================

export const TASK_PRIORITY_CONFIG: Record<
  TaskPriority,
  {
    label: string
    color: string
    calendarColor: string
  }
> = {
  low: {
    label: "Baixa",
    color: "bg-slate-500",
    calendarColor: "bg-slate-100 text-slate-700 border-slate-200",
  },
  medium: {
    label: "Média",
    color: "bg-blue-500",
    calendarColor: "bg-blue-100 text-blue-700 border-blue-200",
  },
  high: {
    label: "Alta",
    color: "bg-orange-500",
    calendarColor: "bg-amber-100 text-amber-700 border-amber-200",
  },
  urgent: {
    label: "Urgente",
    color: "bg-red-500",
    calendarColor: "bg-red-100 text-red-700 border-red-200",
  },
}

export const TASK_PRIORITY_OPTIONS = (
  Object.entries(TASK_PRIORITY_CONFIG) as [TaskPriority, typeof TASK_PRIORITY_CONFIG[TaskPriority]][]
).map(([value, config]) => ({
  value: value as TaskPriority,
  label: config.label,
}))

// =============================================
// TASK TYPE
// =============================================

export const TASK_TYPE_CONFIG: Record<
  TaskType,
  {
    label: string
    variant: "default" | "secondary" | "outline" | "destructive" | "warning"
  }
> = {
  general: { label: "Geral", variant: "secondary" },
  onboarding: { label: "Onboarding", variant: "secondary" },
  campaign: { label: "Campanha", variant: "default" },
  request: { label: "Solicitação", variant: "outline" },
  meeting: { label: "Reunião", variant: "warning" },
  deadline: { label: "Prazo/Entrega", variant: "destructive" },
}

export const TASK_TYPE_OPTIONS = (
  Object.entries(TASK_TYPE_CONFIG) as [TaskType, typeof TASK_TYPE_CONFIG[TaskType]][]
).map(([value, config]) => ({
  value: value as TaskType,
  label: config.label,
}))

// =============================================
// MEETING STATUS
// =============================================

export const MEETING_STATUS_CONFIG: Record<
  MeetingStatus,
  {
    label: string
    variant: "default" | "secondary" | "outline" | "destructive"
    icon: typeof Clock
  }
> = {
  scheduled: { label: "Agendada", variant: "default", icon: Clock },
  completed: { label: "Realizada", variant: "secondary", icon: CheckCircle },
  cancelled: { label: "Cancelada", variant: "outline", icon: XCircle },
  no_show: { label: "Não Compareceu", variant: "destructive", icon: AlertCircle },
}

export const MEETING_STATUS_OPTIONS = (
  Object.entries(MEETING_STATUS_CONFIG) as [MeetingStatus, typeof MEETING_STATUS_CONFIG[MeetingStatus]][]
).map(([value, config]) => ({
  value: value as MeetingStatus,
  label: config.label,
}))

// =============================================
// MEETING DURATION
// =============================================

export const MEETING_DURATION_OPTIONS = [
  { value: 15, label: "15 minutos" },
  { value: 30, label: "30 minutos" },
  { value: 45, label: "45 minutos" },
  { value: 60, label: "1 hora" },
  { value: 90, label: "1h 30min" },
  { value: 120, label: "2 horas" },
]

// =============================================
// CALENDAR
// =============================================

export const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
