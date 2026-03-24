import { Zap, Send, Mail } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { formatCurrency, formatNumber } from "@/lib/utils/format"
import { EmptyState } from "@/components/ui/empty-state"
import type { KlaviyoData } from "./types"

interface ThreeColumnsProps {
  klaviyo?: KlaviyoData
}

export function ThreeColumns({ klaviyo }: ThreeColumnsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Top Flows */}
      <div className="bg-white dark:bg-[#1A1D27] rounded-[8px] border border-slate-200/80 dark:border-slate-700/40 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Icon icon={Zap} size={16} className="text-primary" />
            Fluxos com melhor desempenho
          </h3>
        </div>

        <div className="overflow-x-auto">
          {klaviyo?.topFlows && klaviyo.topFlows.length > 0 ? (
            <table className="w-full text-sm min-w-[460px]">
              <thead>
                <tr className="text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200/50 dark:border-slate-700/30">
                  <th className="text-left pb-2 font-medium bg-slate-50/50 dark:bg-slate-800/30">Fluxo</th>
                  <th className="text-right pb-2 font-medium bg-slate-50/50 dark:bg-slate-800/30">Entregas</th>
                  <th className="text-right pb-2 font-medium bg-slate-50/50 dark:bg-slate-800/30">Abertura</th>
                  <th className="text-right pb-2 font-medium bg-slate-50/50 dark:bg-slate-800/30">Cliques</th>
                  <th className="text-right pb-2 font-medium bg-slate-50/50 dark:bg-slate-800/30">Receita</th>
                </tr>
              </thead>
              <tbody>
                {klaviyo.topFlows.slice(0, 7).map((flow, index) => {
                  const revenuePerRecipient = flow.delivered > 0 ? flow.revenue / flow.delivered : 0
                  return (
                    <tr key={flow.id} className={`border-b border-slate-200/30 dark:border-slate-700/20 last:border-0 ${index === 0 ? "bg-emerald-50/50 dark:bg-emerald-500/10" : ""}`}>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon icon={Mail} customSize={14} className="text-slate-500 dark:text-slate-400" />
                          <span className="font-medium text-slate-800 dark:text-slate-100 truncate max-w-[140px] sm:max-w-[200px]" title={flow.name}>
                            {flow.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right text-slate-600 dark:text-slate-300">{formatNumber(flow.delivered)}</td>
                      <td className="py-2.5 text-right text-slate-600 dark:text-slate-300">{flow.openRate.toFixed(2)}%</td>
                      <td className="py-2.5 text-right text-slate-600 dark:text-slate-300">{(flow.clickRate * 100).toFixed(2)}%</td>
                      <td className="py-2.5 text-right">
                        <span className="font-bold text-emerald-600">{formatCurrency(flow.revenue)}</span>
                        <br />
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">{formatCurrency(revenuePerRecipient)} /dest.</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <EmptyState compact icon={Zap} title="Nenhum flow com receita" className="py-8" />
          )}
        </div>
      </div>

      {/* Top Campaigns */}
      <div className="bg-white dark:bg-[#1A1D27] rounded-[8px] border border-slate-200/80 dark:border-slate-700/40 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Icon icon={Send} size={16} className="text-[#4E62D8] dark:text-[#7B8CEA]" />
            Mensagens recentes de campanha
          </h3>
        </div>

        <div className="overflow-x-auto">
          {klaviyo?.recentCampaigns && klaviyo.recentCampaigns.length > 0 ? (
            <table className="w-full text-sm min-w-[460px]">
              <thead>
                <tr className="text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200/50 dark:border-slate-700/30">
                  <th className="text-left pb-2 font-medium bg-slate-50/50 dark:bg-slate-800/30">Campanha</th>
                  <th className="text-right pb-2 font-medium bg-slate-50/50 dark:bg-slate-800/30">Abertura</th>
                  <th className="text-right pb-2 font-medium bg-slate-50/50 dark:bg-slate-800/30">Cliques</th>
                  <th className="text-right pb-2 font-medium bg-slate-50/50 dark:bg-slate-800/30">Receita</th>
                </tr>
              </thead>
              <tbody>
                {klaviyo.recentCampaigns.slice(0, 7).map((campaign, index) => {
                  const delivered = campaign.delivered || campaign.recipients || 0
                  const revenuePerRecipient = delivered > 0 ? campaign.revenue / delivered : 0
                  const sentDate = campaign.sentAt ? formatSendDate(campaign.sentAt) : ""
                  return (
                    <tr key={campaign.id} className={`border-b border-slate-200/30 dark:border-slate-700/20 last:border-0 ${index === 0 ? "bg-sky-50/50 dark:bg-blue-500/10" : ""}`}>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon icon={Mail} customSize={14} className="text-slate-500 dark:text-slate-400" />
                          <div className="min-w-0">
                            <span className="font-medium text-slate-800 dark:text-slate-100 truncate block max-w-[140px] sm:max-w-[220px]" title={campaign.name}>
                              {campaign.name}
                            </span>
                            {sentDate && (
                              <span className="text-[10px] text-slate-500 dark:text-slate-400">Enviada em: {sentDate}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 text-right text-slate-600 dark:text-slate-300">{campaign.openRate.toFixed(2)}%</td>
                      <td className="py-2.5 text-right text-slate-600 dark:text-slate-300">{(campaign.clickRate * 100).toFixed(2)}%</td>
                      <td className="py-2.5 text-right">
                        <span className="font-bold text-[#4E62D8] dark:text-[#7B8CEA]">{formatCurrency(campaign.revenue)}</span>
                        <br />
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">{formatCurrency(revenuePerRecipient)} /dest.</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <EmptyState compact icon={Send} title="Nenhuma campanha com receita" className="py-8" />
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
