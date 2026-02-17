import { Ticket, Tag, Link2, Globe } from "lucide-react"
import { GlowCard } from "@/components/ui/glow-card"
import { formatPercent, formatCurrencyCompact } from "@/lib/utils/format"
import type { ShopifyData } from "./types"

interface ConversionsSectionProps {
  shopify?: ShopifyData
}

export function ConversionsSection({ shopify }: ConversionsSectionProps) {
  if (!shopify?.coupons && !shopify?.utmConversions) return null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Coupon Conversions */}
      <GlowCard color="primary" intensity="moderate" surfaceClassName="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Ticket className="h-4 w-4 text-primary" />
            Conversões por Cupom
          </h3>
          <span className="text-xs text-muted-foreground">Pedidos pagos</span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xl font-bold text-foreground">{shopify?.coupons?.totalOrdersWithCoupon || 0}</p>
            <p className="text-xs text-muted-foreground">Pedidos com cupom</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xl font-bold text-pink-400">{formatPercent(shopify?.coupons?.couponUsageRate || 0)}</p>
            <p className="text-xs text-muted-foreground">Taxa de uso</p>
          </div>
        </div>

        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {shopify?.coupons?.topCoupons && shopify.coupons.topCoupons.length > 0 ? (
            shopify.coupons.topCoupons.slice(0, 5).map((coupon, index) => (
              <div key={coupon.code} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  index === 0 ? "bg-pink-500/20 text-pink-400" : "bg-muted text-muted-foreground"
                }`}>
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    {coupon.code}
                  </p>
                  <p className="text-xs text-muted-foreground">{coupon.orders} pedidos</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-pink-400">{formatCurrencyCompact(coupon.revenue)}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-6">
              <Ticket className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Nenhum cupom utilizado</p>
            </div>
          )}
        </div>
      </GlowCard>

      {/* UTM Conversions */}
      <GlowCard color="info" intensity="moderate" surfaceClassName="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Link2 className="h-4 w-4 text-info" />
            Conversões por UTM
          </h3>
          <span className="text-xs text-muted-foreground">Pedidos pagos</span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xl font-bold text-foreground">{shopify?.utmConversions?.totalOrdersWithUtm || 0}</p>
            <p className="text-xs text-muted-foreground">Pedidos com UTM</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xl font-bold text-cyan-400">{formatPercent(shopify?.utmConversions?.utmTrackingRate || 0)}</p>
            <p className="text-xs text-muted-foreground">Taxa de rastreio</p>
          </div>
        </div>

        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {shopify?.utmConversions?.bySource && shopify.utmConversions.bySource.length > 0 ? (
            shopify.utmConversions.bySource.slice(0, 5).map((utm, index) => (
              <div key={utm.source} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  index === 0 ? "bg-cyan-500/20 text-cyan-400" : "bg-muted text-muted-foreground"
                }`}>
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    {utm.source}
                  </p>
                  <p className="text-xs text-muted-foreground">{utm.orders} pedidos</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-cyan-400">{formatCurrencyCompact(utm.revenue)}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-6">
              <Link2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Nenhum UTM rastreado</p>
            </div>
          )}
        </div>
      </GlowCard>
    </div>
  )
}
