import { Crown, ShoppingCart } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils/format"
import { EmptyState } from "@/components/ui/empty-state"
import type { ShopifyData } from "./types"

interface RankingsSectionProps {
  shopify?: ShopifyData | null
}

export function RankingsSection({ shopify }: RankingsSectionProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Top Customers */}
      <div className="bg-white dark:bg-[#1A1D27] rounded-[8px] border border-slate-200/80 dark:border-slate-700/40 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Icon icon={Crown} size={16} className="text-amber-400" />
            Top Clientes
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">Por receita no período</span>
        </div>

        <div className="space-y-2 max-h-[240px] sm:max-h-[320px] overflow-y-auto">
          {shopify?.topCustomers && shopify.topCustomers.length > 0 ? (
            shopify.topCustomers.slice(0, 10).map((customer, index) => (
              <div key={customer.email} className="flex items-center gap-3 py-3 border-b border-slate-200/50 dark:border-slate-700/30 last:border-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  index === 0 ? "bg-amber-500/20 text-amber-400" :
                  index === 1 ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200" :
                  index === 2 ? "bg-orange-500/15 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400" :
                  "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                }`}>
                  {index < 3 ? <Icon icon={Crown} customSize={14} /> : index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{customer.email}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span>{customer.ordersCount} pedidos</span>
                    <span>Ticket: {formatCurrency(customer.averageOrderValue)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-amber-400">{formatCurrencyCompact(customer.totalSpent)}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    {customer.lastOrderDate ? new Date(customer.lastOrderDate).toLocaleDateString("pt-BR") : ""}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <EmptyState compact icon={Crown} title="Nenhum cliente no período" className="py-8" />
          )}
        </div>
      </div>

      {/* Top Products */}
      <div className="bg-white dark:bg-[#1A1D27] rounded-[8px] border border-slate-200/80 dark:border-slate-700/40 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Icon icon={ShoppingCart} size={16} className="text-[#4E62D8] dark:text-[#7B8CEA]" />
            Top Produtos
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">Por receita no período</span>
        </div>

        <div className="space-y-2 max-h-[240px] sm:max-h-[320px] overflow-y-auto">
          {shopify?.topProducts && shopify.topProducts.length > 0 ? (
            shopify.topProducts.slice(0, 10).map((product, index) => (
              <div key={product.name} className="flex items-center gap-3 py-3 border-b border-slate-200/50 dark:border-slate-700/30 last:border-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  index === 0 ? "bg-primary/20 text-primary" :
                  index === 1 ? "bg-blue-500/20 text-blue-400" :
                  index === 2 ? "bg-purple-500/20 text-purple-400" :
                  "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                }`}>
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{product.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{product.quantity} unidades</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-[#4E62D8] dark:text-[#7B8CEA]">{formatCurrencyCompact(product.revenue)}</p>
                </div>
              </div>
            ))
          ) : (
            <EmptyState compact icon={ShoppingCart} title="Nenhum produto no período" className="py-8" />
          )}
        </div>
      </div>
    </div>
  )
}
