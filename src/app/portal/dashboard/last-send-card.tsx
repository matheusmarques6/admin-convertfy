import { Mail, ArrowRight } from "lucide-react"
import Link from "next/link"
import { formatCurrency } from "@/lib/utils/format"
import { GlowCard } from "@/components/ui/glow-card"

interface Campaign {
  id: string
  name: string
  status: string
  sentAt: string
  openRate: number
  clickRate: number
  revenue: number
}

interface LastSendCardProps {
  campaigns?: Campaign[]
}

export function LastSendCard({ campaigns }: LastSendCardProps) {
  // Find most recent sent campaign
  const sentCampaigns = (campaigns || [])
    .filter(c => c.status === "sent")
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())

  const lastCampaign = sentCampaigns[0]

  if (!lastCampaign) {
    return (
      <GlowCard color="primary" intensity="subtle" surfaceClassName="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Último Envio</span>
        </div>
        <p className="text-sm text-muted-foreground">Nenhum envio recente</p>
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

  const sentDate = new Date(lastCampaign.sentAt)

  return (
    <GlowCard color="primary" intensity="subtle" surfaceClassName="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground uppercase tracking-wide">Último Envio</span>
      </div>

      <p className="text-sm font-semibold text-foreground truncate mb-1">{lastCampaign.name}</p>
      <p className="text-xs text-muted-foreground mb-3">
        {sentDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
      </p>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-sm font-bold text-foreground">{lastCampaign.openRate.toFixed(1)}%</p>
          <p className="text-[10px] text-muted-foreground">Abertura</p>
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">{lastCampaign.clickRate.toFixed(1)}%</p>
          <p className="text-[10px] text-muted-foreground">Cliques</p>
        </div>
        <div>
          <p className="text-sm font-bold text-success">{formatCurrency(lastCampaign.revenue)}</p>
          <p className="text-[10px] text-muted-foreground">Receita</p>
        </div>
      </div>
    </GlowCard>
  )
}
