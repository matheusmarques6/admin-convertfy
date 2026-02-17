import { Crown, ShoppingCart } from "lucide-react"
import { GlowCard } from "@/components/ui/glow-card"
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils/format"
import type { ShopifyData } from "./types"

interface RankingsSectionProps {
  shopify?: ShopifyData
}

export function RankingsSection({ shopify }: RankingsSectionProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Top Customers */}
      <GlowCard color="warning" intensity="moderate" surfaceClassName="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-400" />
            Top Clientes
          </h3>
          <span className="text-xs text-muted-foreground">Por receita no período</span>
        </div>

        <div className="space-y-2 max-h-[320px] overflow-y-auto">
          {shopify?.topCustomers && shopify.topCustomers.length > 0 ? (
            shopify.topCustomers.slice(0, 10).map((customer, index) => (
              <div key={customer.email} className="flex items-center gap-3 py-3 border-b border-border/50 last:border-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  index === 0 ? "bg-amber-500/20 text-amber-400" :
                  index === 1 ? "bg-muted text-foreground/80" :
                  index === 2 ? "bg-orange-700/20 text-orange-400" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {index < 3 ? <Crown className="h-3.5 w-3.5" /> : index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{customer.email}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{customer.ordersCount} pedidos</span>
                    <span>Ticket: {formatCurrency(customer.averageOrderValue)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-amber-400">{formatCurrencyCompact(customer.totalSpent)}</p>
                  <p className="text-[10px] text-muted-foreground/70">
                    {customer.lastOrderDate ? new Date(customer.lastOrderDate).toLocaleDateString("pt-BR") : ""}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <Crown className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Nenhum cliente no período</p>
            </div>
          )}
        </div>
      </GlowCard>

      {/* Top Products */}
      <GlowCard color="info" intensity="moderate" surfaceClassName="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-info" />
            Top Produtos
          </h3>
          <span className="text-xs text-muted-foreground">Por receita no período</span>
        </div>

        <div className="space-y-2 max-h-[320px] overflow-y-auto">
          {shopify?.topProducts && shopify.topProducts.length > 0 ? (
            shopify.topProducts.slice(0, 10).map((product, index) => (
              <div key={product.name} className="flex items-center gap-3 py-3 border-b border-border/50 last:border-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  index === 0 ? "bg-primary/20 text-primary" :
                  index === 1 ? "bg-blue-500/20 text-blue-400" :
                  index === 2 ? "bg-purple-500/20 text-purple-400" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.quantity} unidades</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-info">{formatCurrencyCompact(product.revenue)}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <ShoppingCart className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Nenhum produto no período</p>
            </div>
          )}
        </div>
      </GlowCard>
    </div>
  )
}
