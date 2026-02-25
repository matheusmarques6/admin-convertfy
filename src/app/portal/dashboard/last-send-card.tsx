import { Mail, ArrowRight } from "lucide-react"
import Link from "next/link"
import { formatCurrency } from "@/lib/utils/format"

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
      <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-blue-50">
            <Mail className="h-4 w-4 text-blue-600" />
          </div>
          <span className="text-[13px] text-slate-500 uppercase tracking-wide">Último Envio</span>
        </div>
        <p className="text-sm text-slate-500">Nenhum envio recente</p>
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

  const sentDate = new Date(lastCampaign.sentAt)

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-blue-50">
          <Mail className="h-4 w-4 text-blue-600" />
        </div>
        <span className="text-[13px] text-slate-500 uppercase tracking-wide">Último Envio</span>
      </div>

      <p className="text-sm font-semibold text-slate-800 truncate mb-1">{lastCampaign.name}</p>
      <p className="text-xs text-slate-500 mb-3">
        {sentDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
      </p>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-sm font-bold text-slate-800">{lastCampaign.openRate.toFixed(1)}%</p>
          <p className="text-[10px] text-slate-400">Abertura</p>
        </div>
        <div>
          <p className="text-sm font-bold text-slate-800">{lastCampaign.clickRate.toFixed(1)}%</p>
          <p className="text-[10px] text-slate-400">Cliques</p>
        </div>
        <div>
          <p className="text-sm font-bold text-emerald-600">{formatCurrency(lastCampaign.revenue)}</p>
          <p className="text-[10px] text-slate-400">Receita</p>
        </div>
      </div>
    </div>
  )
}
