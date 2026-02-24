import { Zap, Send, Mail } from "lucide-react"
import { GlowCard } from "@/components/ui/glow-card"
import { formatCurrency, formatNumber } from "@/lib/utils/format"
import type { KlaviyoData } from "./types"

interface ThreeColumnsProps {
  klaviyo?: KlaviyoData
}

export function ThreeColumns({ klaviyo }: ThreeColumnsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Top Flows */}
      <GlowCard color="success" intensity="moderate" surfaceClassName="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Fluxos com melhor desempenho
          </h3>
        </div>

        <div className="overflow-x-auto">
          {klaviyo?.topFlows && klaviyo.topFlows.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border/50">
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
                    <tr key={flow.id} className={`border-b border-border/30 last:border-0 ${index === 0 ? "bg-success/5" : ""}`}>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-foreground truncate max-w-[200px]" title={flow.name}>
                            {flow.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right text-foreground/80">{formatNumber(flow.delivered)}</td>
                      <td className="py-2.5 text-right text-foreground/80">{flow.openRate.toFixed(2)}%</td>
                      <td className="py-2.5 text-right text-foreground/80">{(flow.clickRate * 100).toFixed(2)}%</td>
                      <td className="py-2.5 text-right">
                        <span className="font-bold text-success">{formatCurrency(flow.revenue)}</span>
                        <br />
                        <span className="text-[10px] text-muted-foreground">{formatCurrency(revenuePerRecipient)} /dest.</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-8">
              <Zap className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Nenhum flow com receita</p>
            </div>
          )}
        </div>
      </GlowCard>

      {/* Top Campaigns */}
      <GlowCard color="info" intensity="moderate" surfaceClassName="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Send className="h-4 w-4 text-info" />
            Mensagens recentes de campanha
          </h3>
        </div>

        <div className="overflow-x-auto">
          {klaviyo?.recentCampaigns && klaviyo.recentCampaigns.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border/50">
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
                    <tr key={campaign.id} className={`border-b border-border/30 last:border-0 ${index === 0 ? "bg-info/5" : ""}`}>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <span className="font-medium text-foreground truncate block max-w-[220px]" title={campaign.name}>
                              {campaign.name}
                            </span>
                            {sentDate && (
                              <span className="text-[10px] text-muted-foreground">Enviada em: {sentDate}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 text-right text-foreground/80">{campaign.openRate.toFixed(2)}%</td>
                      <td className="py-2.5 text-right text-foreground/80">{(campaign.clickRate * 100).toFixed(2)}%</td>
                      <td className="py-2.5 text-right">
                        <span className="font-bold text-info">{formatCurrency(campaign.revenue)}</span>
                        <br />
                        <span className="text-[10px] text-muted-foreground">{formatCurrency(revenuePerRecipient)} /dest.</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-8">
              <Send className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Nenhuma campanha com receita</p>
            </div>
          )}
        </div>
      </GlowCard>
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
