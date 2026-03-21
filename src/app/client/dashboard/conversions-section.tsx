import { Ticket, Tag, Link2, Globe, Megaphone, Monitor } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { formatPercent, formatCurrencyCompact } from "@/lib/utils/format"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/components/ui/empty-state"
import type { ShopifyData } from "./types"

interface ConversionsSectionProps {
  shopify?: ShopifyData | null
}

/** Reusable ranked list for UTM data (top 5) */
function UtmRankingList({
  items,
  labelKey,
  icon: IconComponent,
}: {
  items: Array<Record<string, string | number>>
  labelKey: string
  icon: LucideIcon
}) {
  if (!items || items.length === 0) {
    return <EmptyState compact icon={Link2} title="Nenhum dado disponivel" />
  }

  return (
    <div className="space-y-2">
      {items.slice(0, 5).map((item, index) => (
        <div key={String(item[labelKey])} className="flex items-center gap-3 py-2 border-b border-slate-200/50 dark:border-slate-700/30 last:border-0">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
            index === 0 ? "bg-cyan-500/20 text-cyan-600 dark:text-cyan-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
          }`}>
            {index + 1}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate flex items-center gap-1">
              <Icon icon={IconComponent} customSize={12} />
              {String(item[labelKey])}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{item.orders} pedidos</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-cyan-600 dark:text-cyan-400">{formatCurrencyCompact(item.revenue as number)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export function ConversionsSection({ shopify }: ConversionsSectionProps) {
  if (!shopify?.coupons && !shopify?.utmConversions) return null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Coupon Conversions */}
      <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Icon icon={Ticket} size={16} className="text-primary" />
            Conversoes por Cupom
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">Pedidos pagos</span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#1A1F2E]">
            <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{shopify?.coupons?.totalOrdersWithCoupon || 0}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Pedidos com cupom</p>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#1A1F2E]">
            <p className="text-xl font-bold text-pink-600 dark:text-pink-400">{formatPercent(shopify?.coupons?.couponUsageRate || 0)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Taxa de uso</p>
          </div>
        </div>

        <div className="space-y-2 max-h-[160px] sm:max-h-[200px] overflow-y-auto">
          {shopify?.coupons?.topCoupons && shopify.coupons.topCoupons.length > 0 ? (
            shopify.coupons.topCoupons.slice(0, 5).map((coupon, index) => (
              <div key={coupon.code} className="flex items-center gap-3 py-2 border-b border-slate-200/50 dark:border-slate-700/30 last:border-0">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  index === 0 ? "bg-pink-500/20 text-pink-600 dark:text-pink-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                }`}>
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate flex items-center gap-1">
                    <Icon icon={Tag} customSize={12} />
                    {coupon.code}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{coupon.orders} pedidos</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-pink-600 dark:text-pink-400">{formatCurrencyCompact(coupon.revenue)}</p>
                </div>
              </div>
            ))
          ) : (
            <EmptyState compact icon={Ticket} title="Nenhum cupom utilizado" />
          )}
        </div>
      </div>

      {/* UTM Conversions */}
      <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Icon icon={Link2} size={16} className="text-[#05AFF2]" />
            Conversoes por UTM
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">Pedidos pagos</span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#1A1F2E]">
            <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{shopify?.utmConversions?.totalOrdersWithUtm || 0}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Pedidos com UTM</p>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#1A1F2E]">
            <p className="text-xl font-bold text-cyan-600 dark:text-cyan-400">{formatPercent(shopify?.utmConversions?.utmTrackingRate || 0)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Taxa de rastreio</p>
          </div>
        </div>

        <Tabs defaultValue="source" className="w-full">
          <TabsList className="w-full grid grid-cols-3 h-8 mb-3">
            <TabsTrigger value="source" className="text-xs px-2 py-1">Source</TabsTrigger>
            <TabsTrigger value="medium" className="text-xs px-2 py-1">Medium</TabsTrigger>
            <TabsTrigger value="campaign" className="text-xs px-2 py-1">Campaign</TabsTrigger>
          </TabsList>

          <div className="max-h-[160px] sm:max-h-[200px] overflow-y-auto">
            <TabsContent value="source" className="mt-0">
              <UtmRankingList
                items={(shopify?.utmConversions?.bySource || []) as unknown as Array<Record<string, string | number>>}
                labelKey="source"
                icon={Globe}
              />
            </TabsContent>

            <TabsContent value="medium" className="mt-0">
              <UtmRankingList
                items={(shopify?.utmConversions?.byMedium || []) as unknown as Array<Record<string, string | number>>}
                labelKey="medium"
                icon={Monitor}
              />
            </TabsContent>

            <TabsContent value="campaign" className="mt-0">
              <UtmRankingList
                items={(shopify?.utmConversions?.byCampaign || []) as unknown as Array<Record<string, string | number>>}
                labelKey="campaign"
                icon={Megaphone}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}
