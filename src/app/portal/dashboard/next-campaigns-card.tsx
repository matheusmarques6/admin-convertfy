import { Send, Calendar, ArrowRight } from "lucide-react"
import Link from "next/link"
import { GlowCard } from "@/components/ui/glow-card"

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
      <GlowCard color="info" intensity="subtle" surfaceClassName="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Send className="h-4 w-4 text-info" />
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Próximas Campanhas</span>
        </div>
        <p className="text-sm text-muted-foreground">Nenhuma campanha agendada</p>
        <Link
          href="/portal/campaigns"
          className="inline-flex items-center gap-1 text-xs text-info hover:text-info/80 mt-2 transition-colors"
        >
          Ver campanhas
          <ArrowRight className="h-3 w-3" />
        </Link>
      </GlowCard>
    )
  }

  // Show scheduled/upcoming campaigns (up to 3)
  const upcoming = campaigns
    .filter(c => c.status === "scheduled" || c.status === "draft" || new Date(c.sentAt) > new Date())
    .slice(0, 3)

  // If no upcoming, show recent
  const displayCampaigns = upcoming.length > 0 ? upcoming : campaigns.slice(0, 3)

  return (
    <GlowCard color="info" intensity="subtle" surfaceClassName="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-info" />
          <span className="text-xs text-muted-foreground uppercase tracking-wide">
            {upcoming.length > 0 ? "Próximas Campanhas" : "Campanhas Recentes"}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {displayCampaigns.map((campaign) => {
          const date = new Date(campaign.sentAt)
          const statusColor =
            campaign.status === "scheduled" ? "text-blue-400" :
            campaign.status === "draft" ? "text-muted-foreground" :
            campaign.status === "sent" ? "text-success" : "text-muted-foreground"

          return (
            <div key={campaign.id} className="flex items-center gap-3 py-1.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{campaign.name}</p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
        className="inline-flex items-center gap-1 text-xs text-info hover:text-info/80 mt-2 transition-colors"
      >
        Ver todas
        <ArrowRight className="h-3 w-3" />
      </Link>
    </GlowCard>
  )
}
