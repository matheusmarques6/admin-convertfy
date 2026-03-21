import { Send, Calendar, ArrowRight } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import Link from "next/link"
import { EmptyState } from "@/components/ui/empty-state"
import type { UpcomingCampaign } from "./types"

interface RecentCampaign {
  id: string
  name: string
  status: string
  sentAt: string
}

interface NextCampaignsCardProps {
  campaigns?: RecentCampaign[]
  upcomingCampaigns?: UpcomingCampaign[]
}

export function NextCampaignsCard({ campaigns, upcomingCampaigns }: NextCampaignsCardProps) {
  // Priority 1: upcoming scheduled campaigns (NOT period-dependent)
  const hasUpcoming = upcomingCampaigns && upcomingCampaigns.length > 0
  // Priority 2: recent sent campaigns from Klaviyo cache
  const hasRecent = campaigns && campaigns.length > 0

  if (!hasUpcoming && !hasRecent) {
    return (
      <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 shadow-sm dark:shadow-slate-900/20 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow duration-200">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-cyan-50 dark:bg-cyan-500/10">
            <Send className="h-4 w-4 text-cyan-600" />
          </div>
          <span className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">Próximas Campanhas</span>
        </div>
        <EmptyState compact title="Nenhuma campanha agendada" link={{ label: "Ver campanhas", href: "/client/campaigns" }} />
      </div>
    )
  }

  // Show upcoming if available, else fallback to recent
  const isShowingUpcoming = hasUpcoming
  const label = isShowingUpcoming ? "Próximas Campanhas" : "Campanhas Recentes"

  // Normalize both sources to a common shape for rendering
  const displayItems: Array<{
    id: string
    name: string
    status: string
    dateStr: string
  }> = isShowingUpcoming
    ? upcomingCampaigns!.slice(0, 3).map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        dateStr: new Date(c.scheduledDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      }))
    : campaigns!.slice(0, 3).map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        dateStr: new Date(c.sentAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
      }))

  const statusLabel = (status: string) => {
    switch (status) {
      case "scheduled": return "Agendada"
      case "draft": return "Rascunho"
      case "sent": return "Enviada"
      case "approved": return "Aprovada"
      case "pending_review": return "Em Revisao"
      case "rejected": return "Rejeitada"
      case "cancelled": return "Cancelada"
      default: return status
    }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "scheduled": return "text-blue-600 dark:text-blue-400"
      case "draft": return "text-slate-400 dark:text-slate-500"
      case "sent": return "text-emerald-600 dark:text-emerald-400"
      case "approved": return "text-teal-600 dark:text-teal-400"
      case "pending_review": return "text-blue-500 dark:text-blue-400"
      case "rejected": return "text-orange-500 dark:text-orange-400"
      case "cancelled": return "text-red-500 dark:text-red-400"
      default: return "text-slate-400 dark:text-slate-500"
    }
  }

  return (
    <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 shadow-sm dark:shadow-slate-900/20 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow duration-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-cyan-50 dark:bg-cyan-500/10">
            <Send className="h-4 w-4 text-cyan-600" />
          </div>
          <span className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            {label}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {displayItems.map((item) => (
          <div key={item.id} className="flex items-center gap-3 py-1.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{item.name}</p>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Calendar className="h-3 w-3" />
                <span>{item.dateStr}</span>
                <span className={statusColor(item.status)}>
                  {statusLabel(item.status)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Link
        href="/client/campaigns"
        className="inline-flex items-center gap-1 text-xs text-[#05AFF2] hover:text-[#05AFF2]/80 mt-2 transition-colors"
      >
        Ver todas
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  )
}
