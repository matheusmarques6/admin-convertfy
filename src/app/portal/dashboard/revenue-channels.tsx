import { Zap, Send, MessageSquare, BarChart3 } from "lucide-react"
import { formatCurrency } from "@/lib/utils/format"
import { ChannelCard, SimpleLineChart } from "./components"
import type { KlaviyoData, ShopifyData } from "./types"

interface RevenueChannelsProps {
  klaviyo?: KlaviyoData
  shopify?: ShopifyData
}

export function RevenueChannels({ klaviyo, shopify }: RevenueChannelsProps) {
  const totalShopifyRevenue = shopify?.totalRevenue || 0
  const totalKlaviyoRevenue = klaviyo?.totalRevenue || 0
  const attributionPercent = totalShopifyRevenue > 0 ? (totalKlaviyoRevenue / totalShopifyRevenue) * 100 : 0

  const flowRevenue = klaviyo?.flowRevenue || 0
  const campaignRevenue = klaviyo?.campaignRevenue || 0
  const smsRevenue = klaviyo?.smsRevenue || 0
  const flowPercent = totalKlaviyoRevenue > 0 ? (flowRevenue / totalKlaviyoRevenue) * 100 : 0
  const campaignPercent = totalKlaviyoRevenue > 0 ? (campaignRevenue / totalKlaviyoRevenue) * 100 : 0
  const smsPercent = totalKlaviyoRevenue > 0 ? (smsRevenue / totalKlaviyoRevenue) * 100 : 0

  // Fake sparkline data (would come from API in real implementation)
  const revenueSparkline = [12, 19, 15, 25, 22, 30, 28, 35, 32, 40, 38, 45]

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-purple-400" />
          Canais de Receita
        </h3>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <ChannelCard
          title="Flows"
          percent={flowPercent}
          value={flowRevenue}
          icon={Zap}
          color="bg-emerald-500/10 text-emerald-400"
          active
        />
        <ChannelCard
          title="Campanhas"
          percent={campaignPercent}
          value={campaignRevenue}
          icon={Send}
          color="bg-blue-500/10 text-blue-400"
        />
        <ChannelCard
          title="SMS"
          percent={smsPercent}
          value={smsRevenue}
          icon={MessageSquare}
          color="bg-amber-500/10 text-amber-400"
        />
      </div>

      <div className="flex items-center justify-between mb-4 p-3 rounded-lg bg-zinc-800/50">
        <span className="text-sm text-zinc-400">Total Atribuído</span>
        <div className="text-right">
          <span className="text-lg font-bold text-emerald-400 mr-2">{attributionPercent.toFixed(1)}%</span>
          <span className="text-sm text-zinc-300">{formatCurrency(totalKlaviyoRevenue)}</span>
        </div>
      </div>

      <div>
        <p className="text-xs text-zinc-500 mb-2">Receita Diária</p>
        <SimpleLineChart data={revenueSparkline} />
        <div className="flex justify-between mt-2">
          <span className="text-[10px] text-zinc-600">D1</span>
          <span className="text-[10px] text-zinc-600">D7</span>
          <span className="text-[10px] text-zinc-600">D14</span>
          <span className="text-[10px] text-zinc-600">D21</span>
          <span className="text-[10px] text-zinc-600">D30</span>
        </div>
      </div>
    </div>
  )
}
