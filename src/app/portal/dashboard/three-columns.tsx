import { Zap, Send, Mail } from "lucide-react"
import { formatCurrency, formatNumber } from "@/lib/utils/format"
import type { KlaviyoData } from "./types"

interface ThreeColumnsProps {
  klaviyo?: KlaviyoData
}

export function ThreeColumns({ klaviyo }: ThreeColumnsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Top Flows */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-slate-800 flex items-center gap-2">
            <Zap className="h-4 w-4 text-[#5327F2]" />
            Fluxos com melhor desempenho
          </h3>
        </div>

        <div className="overflow-x-auto">
          {klaviyo?.topFlows && klaviyo.topFlows.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-200/50">
                  <th className="text-left pb-2 font-medium">Fluxo</th>
                  <th className="text-right pb-2 font-medium">Entregas</th>
                  <th className="text-right pb-2 font-medium">Abertura</th>
                  <th className="text-right pb-2 font-medium">Cliques</th>
                  <th className="text-right pb-2 font-medium">Receita</th>
                </tr>
              </thead>
              <tbody>
                {klaviyo.topFlows.slice(0, 7).map((flow, index) => {
                  const revenuePerRecipient = flow.delivered > 0 ? flow.revenue / flow.delivered : 0
                  return (
                    <tr key={flow.id} className={`border-b border-slate-200/30 last:border-0 ${index === 0 ? "bg-emerald-50/50" : ""}`}>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Mail className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                          <span className="font-medium text-slate-800 truncate max-w-[200px]" title={flow.name}>
                            {flow.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right text-slate-800/80">{formatNumber(flow.delivered)}</td>
                      <td className="py-2.5 text-right text-slate-800/80">{flow.openRate.toFixed(2)}%</td>
                      <td className="py-2.5 text-right text-slate-800/80">{(flow.clickRate * 100).toFixed(2)}%</td>
                      <td className="py-2.5 text-right">
                        <span className="font-bold text-emerald-600">{formatCurrency(flow.revenue)}</span>
                        <br />
                        <span className="text-[10px] text-slate-500">{formatCurrency(revenuePerRecipient)} /dest.</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-8">
              <Zap className="h-8 w-8 mx-auto mb-2 text-slate-400/50" />
              <p className="text-sm text-slate-500">Nenhum flow com receita</p>
            </div>
          )}
        </div>
      </div>

      {/* Top Campaigns */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-slate-800 flex items-center gap-2">
            <Send className="h-4 w-4 text-[#05AFF2]" />
            Mensagens recentes de campanha
          </h3>
        </div>

        <div className="overflow-x-auto">
          {klaviyo?.recentCampaigns && klaviyo.recentCampaigns.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-200/50">
                  <th className="text-left pb-2 font-medium">Campanha</th>
                  <th className="text-right pb-2 font-medium">Abertura</th>
                  <th className="text-right pb-2 font-medium">Cliques</th>
                  <th className="text-right pb-2 font-medium">Receita</th>
                </tr>
              </thead>
              <tbody>
                {klaviyo.recentCampaigns.slice(0, 7).map((campaign, index) => {
                  const delivered = campaign.delivered || campaign.recipients || 0
                  const revenuePerRecipient = delivered > 0 ? campaign.revenue / delivered : 0
                  const sentDate = campaign.sentAt ? formatSendDate(campaign.sentAt) : ""
                  return (
                    <tr key={campaign.id} className={`border-b border-slate-200/30 last:border-0 ${index === 0 ? "bg-sky-50/50" : ""}`}>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Mail className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                          <div className="min-w-0">
                            <span className="font-medium text-slate-800 truncate block max-w-[220px]" title={campaign.name}>
                              {campaign.name}
                            </span>
                            {sentDate && (
                              <span className="text-[10px] text-slate-500">Enviada em: {sentDate}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 text-right text-slate-800/80">{campaign.openRate.toFixed(2)}%</td>
                      <td className="py-2.5 text-right text-slate-800/80">{(campaign.clickRate * 100).toFixed(2)}%</td>
                      <td className="py-2.5 text-right">
                        <span className="font-bold text-[#05AFF2]">{formatCurrency(campaign.revenue)}</span>
                        <br />
                        <span className="text-[10px] text-slate-500">{formatCurrency(revenuePerRecipient)} /dest.</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-8">
              <Send className="h-8 w-8 mx-auto mb-2 text-slate-400/50" />
              <p className="text-sm text-slate-500">Nenhuma campanha com receita</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function formatSendDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return ""
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return ""
  }
}
