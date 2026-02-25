import { Send, Calendar, ArrowRight } from "lucide-react"
import Link from "next/link"

interface Campaign {
  id: string
  name: string
  status: string
  sentAt: string
}

interface NextCampaignsCardProps {
  campaigns?: Campaign[]
}

export function NextCampaignsCard({ campaigns }: NextCampaignsCardProps) {
  if (!campaigns || campaigns.length === 0) {
    return (
      <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 shadow-sm dark:shadow-slate-900/20 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow duration-200">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-cyan-50 dark:bg-cyan-500/10">
            <Send className="h-4 w-4 text-cyan-600" />
          </div>
          <span className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">Próximas Campanhas</span>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma campanha agendada</p>
        <Link
          href="/portal/campaigns"
          className="inline-flex items-center gap-1 text-xs text-[#05AFF2] hover:text-[#05AFF2]/80 mt-2 transition-colors"
        >
          Ver campanhas
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    )
  }

  // Show scheduled/upcoming campaigns (up to 3)
  const upcoming = campaigns
    .filter(c => c.status === "scheduled" || c.status === "draft" || new Date(c.sentAt) > new Date())
    .slice(0, 3)

  // If no upcoming, show recent
  const displayCampaigns = upcoming.length > 0 ? upcoming : campaigns.slice(0, 3)

  return (
    <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 shadow-sm dark:shadow-slate-900/20 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow duration-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-cyan-50 dark:bg-cyan-500/10">
            <Send className="h-4 w-4 text-cyan-600" />
          </div>
          <span className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            {upcoming.length > 0 ? "Próximas Campanhas" : "Campanhas Recentes"}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {displayCampaigns.map((campaign) => {
          const date = new Date(campaign.sentAt)
          const statusColor =
            campaign.status === "scheduled" ? "text-blue-600 dark:text-blue-400" :
            campaign.status === "draft" ? "text-slate-400 dark:text-slate-500" :
            campaign.status === "sent" ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"

          return (
            <div key={campaign.id} className="flex items-center gap-3 py-1.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{campaign.name}</p>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <Calendar className="h-3 w-3" />
                  <span>{date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className={`capitalize ${statusColor}`}>
                    {campaign.status === "sent" ? "Enviada" : campaign.status === "scheduled" ? "Agendada" : campaign.status === "draft" ? "Rascunho" : campaign.status}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <Link
        href="/portal/campaigns"
        className="inline-flex items-center gap-1 text-xs text-[#05AFF2] hover:text-[#05AFF2]/80 mt-2 transition-colors"
      >
        Ver todas
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  )
}
