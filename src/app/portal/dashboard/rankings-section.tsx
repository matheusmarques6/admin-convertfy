import { Crown, ShoppingCart } from "lucide-react"
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils/format"
import type { ShopifyData } from "./types"

interface RankingsSectionProps {
  shopify?: ShopifyData
}

export function RankingsSection({ shopify }: RankingsSectionProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Top Customers */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-slate-800 flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-400" />
            Top Clientes
          </h3>
          <span className="text-xs text-slate-500">Por receita no período</span>
        </div>

        <div className="space-y-2 max-h-[320px] overflow-y-auto">
          {shopify?.topCustomers && shopify.topCustomers.length > 0 ? (
            shopify.topCustomers.slice(0, 10).map((customer, index) => (
              <div key={customer.email} className="flex items-center gap-3 py-3 border-b border-slate-200/50 last:border-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  index === 0 ? "bg-amber-500/20 text-amber-400" :
                  index === 1 ? "bg-slate-100 text-slate-800/80" :
                  index === 2 ? "bg-orange-700/20 text-orange-400" :
                  "bg-slate-100 text-slate-500"
                }`}>
                  {index < 3 ? <Crown className="h-3.5 w-3.5" /> : index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{customer.email}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>{customer.ordersCount} pedidos</span>
                    <span>Ticket: {formatCurrency(customer.averageOrderValue)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-amber-400">{formatCurrencyCompact(customer.totalSpent)}</p>
                  <p className="text-[10px] text-slate-400/70">
                    {customer.lastOrderDate ? new Date(customer.lastOrderDate).toLocaleDateString("pt-BR") : ""}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <Crown className="h-10 w-10 mx-auto mb-2 text-slate-400/50" />
              <p className="text-sm text-slate-500">Nenhum cliente no período</p>
            </div>
          )}
        </div>
      </div>

      {/* Top Products */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-slate-800 flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-[#05AFF2]" />
            Top Produtos
          </h3>
          <span className="text-xs text-slate-500">Por receita no período</span>
        </div>

        <div className="space-y-2 max-h-[320px] overflow-y-auto">
          {shopify?.topProducts && shopify.topProducts.length > 0 ? (
            shopify.topProducts.slice(0, 10).map((product, index) => (
              <div key={product.name} className="flex items-center gap-3 py-3 border-b border-slate-200/50 last:border-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  index === 0 ? "bg-[#5327F2]/20 text-[#5327F2]" :
                  index === 1 ? "bg-blue-500/20 text-blue-400" :
                  index === 2 ? "bg-purple-500/20 text-purple-400" :
                  "bg-slate-100 text-slate-500"
                }`}>
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{product.name}</p>
                  <p className="text-xs text-slate-500">{product.quantity} unidades</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-[#05AFF2]">{formatCurrencyCompact(product.revenue)}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <ShoppingCart className="h-10 w-10 mx-auto mb-2 text-slate-400/50" />
              <p className="text-sm text-slate-500">Nenhum produto no período</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
