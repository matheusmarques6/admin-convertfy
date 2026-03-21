import { Mail, MessageSquare, Send } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Icon } from "@/components/ui/icon"

// ============================================
// TYPES
// ============================================

export interface ChannelConfigEntry {
  icon: LucideIcon
  color: string
  lightColor: string
  textColor: string
  label: string
}

export interface StatusConfigEntry {
  label: string
  color: string
  dotColor: string
}

// ============================================
// CHANNEL CONFIG (merged admin + portal + WhatsApp)
// ============================================

export const CHANNEL_CONFIG: Record<string, ChannelConfigEntry> = {
  email: {
    icon: Mail,
    color: "bg-blue-500",
    lightColor: "bg-blue-50 dark:bg-blue-500/10",
    textColor: "text-blue-600",
    label: "Email",
  },
  sms: {
    icon: MessageSquare,
    color: "bg-emerald-500",
    lightColor: "bg-emerald-50 dark:bg-emerald-500/10",
    textColor: "text-emerald-600",
    label: "SMS",
  },
  push: {
    icon: Send,
    color: "bg-purple-500",
    lightColor: "bg-primary/10",
    textColor: "text-primary",
    label: "Push",
  },
  whatsapp: {
    icon: MessageSquare,
    color: "bg-emerald-500",
    lightColor: "bg-emerald-50 dark:bg-emerald-500/10",
    textColor: "text-emerald-600",
    label: "WhatsApp",
  },
}

// ============================================
// STATUS CONFIG
// ============================================

export const STATUS_CONFIG: Record<string, StatusConfigEntry> = {
  draft: {
    label: "Rascunho",
    color: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/40",
    dotColor: "bg-slate-400",
  },
  pending_review: {
    label: "Em Revisão",
    color: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20",
    dotColor: "bg-blue-500",
  },
  approved: {
    label: "Aprovada",
    color: "bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-500/20",
    dotColor: "bg-teal-500",
  },
  rejected: {
    label: "Rejeitada",
    color: "bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-500/20",
    dotColor: "bg-orange-500",
  },
  scheduled: {
    label: "Agendada",
    color: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20",
    dotColor: "bg-blue-500",
  },
  sent: {
    label: "Enviada",
    color: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20",
    dotColor: "bg-emerald-500",
  },
  cancelled: {
    label: "Cancelada",
    color: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20",
    dotColor: "bg-red-500",
  },
}

// ============================================
// CALENDAR LABELS (Portuguese)
// ============================================

export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

export const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

// ============================================
// CAMPAIGN MAPPING CONSTANTS
// ============================================

/** Maps API status to display status (normalisation). */
export const STATUS_MAP: Record<string, "draft" | "scheduled" | "sent" | "cancelled"> = {
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

/** Maps API channel / campaign_type to display channel. */
export const CHANNEL_MAP: Record<string, "email" | "sms" | "push"> = {
  email: "email",
  sms: "sms",
  push: "push",
  whatsapp: "sms",
}

/** Default campaign colour per channel. */
export const COLOR_MAP: Record<string, string> = {
  email: "#3b82f6",
  sms: "#10b981",
  push: "#8b5cf6",
  whatsapp: "#25d366",
}
