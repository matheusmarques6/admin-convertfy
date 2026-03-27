"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Package,
  Search,
  RefreshCw,
  AlertCircle,
  Truck,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

interface TrackingCode {
  id: string
  tracking_number: string
  carrier_code: string
  carrier_name: string
  status: string
  status_detail: string
  last_event: string
  last_event_at: string | null
  estimated_delivery: string | null
}

interface TrackingOrder {
  id: string
  shopify_order_id: string
  shopify_order_number: string
  order_name: string
  customer_name: string
  customer_email: string
  financial_status: string
  fulfillment_status: string
  total_price: number
  currency: string
  order_created_at: string
  shipped_at: string | null
  delivered_at: string | null
  tracking_codes: TrackingCode[]
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: "Pendente", color: "text-slate-500 bg-slate-50 dark:bg-slate-800 dark:text-slate-400", icon: Clock },
  in_transit: { label: "Em Trânsito", color: "text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400", icon: Truck },
  delivered: { label: "Entregue", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400", icon: CheckCircle2 },
  pick_up: { label: "Pronto p/ Retirada", color: "text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400", icon: Package },
  expired: { label: "Expirado", color: "text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400", icon: XCircle },
  alert: { label: "Alerta", color: "text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400", icon: AlertCircle },
  undelivered: { label: "Não Entregue", color: "text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400", icon: XCircle },
}

function getTrackingStatus(codes: TrackingCode[]): { label: string; color: string; icon: React.ElementType } {
  if (!codes || codes.length === 0) return STATUS_LABELS.pending
  const mainCode = codes[0]
  return STATUS_LABELS[mainCode.status] || STATUS_LABELS.pending
}

export default function PortalTrackingOrdersPage() {
  const [orders, setOrders] = useState<TrackingOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const limit = 20

  const fetchOrders = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)

    try {
      let storeId: string | null = null
      try { storeId = localStorage.getItem("portal_active_store") } catch { /* ignore */ }

      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })
      if (storeId) params.set("store_id", storeId)
      if (search) params.set("search", search)
      if (statusFilter !== "all") params.set("status", statusFilter)

      const response = await fetch(`/api/portal/tracking/orders?${params}`)
      if (!response.ok) throw new Error("Erro ao carregar pedidos")
      const data = await response.json()
      setOrders(data.orders || [])
      setTotal(data.total || 0)
      setError(null)
    } catch {
      setError("Não foi possível carregar os pedidos")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [page, search, statusFilter])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const totalPages = Math.ceil(total / limit)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-36 bg-slate-200 dark:bg-slate-700" />
        </div>
        <Skeleton className="h-12 bg-white dark:bg-[#151922] rounded-xl border border-slate-100 dark:border-slate-700/30" />
        <Skeleton className="h-96 bg-white dark:bg-[#151922] rounded-xl border border-slate-100 dark:border-slate-700/30" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="bg-white dark:bg-[#151922] rounded-2xl border border-slate-200 dark:border-slate-700/40 p-10 text-center max-w-md shadow-sm dark:shadow-slate-900/20">
          <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Erro ao carregar</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">{error}</p>
          <Button onClick={() => fetchOrders()} className="bg-primary hover:bg-primary/85 text-white shadow-sm">
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Pedidos</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {total} pedido{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => fetchOrders(true)}
          disabled={refreshing}
          className="h-10 w-10 bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06] rounded-lg shadow-sm dark:shadow-slate-900/20"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
          <Input
            placeholder="Buscar por pedido, cliente ou email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-10 h-10 bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger className="w-[180px] h-10 bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40 text-slate-700 dark:text-slate-200 rounded-lg shadow-sm dark:shadow-slate-900/20">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40 shadow-lg">
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="in_transit">Em Trânsito</SelectItem>
            <SelectItem value="delivered">Entregue</SelectItem>
            <SelectItem value="alert">Alerta</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders Table */}
      <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Package className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
            <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100 mb-1">Nenhum pedido encontrado</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Pedidos aparecerão aqui quando importados via Shopify</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700/30 bg-slate-50/50 dark:bg-slate-800/30">
                  <th className="text-left text-xs text-slate-500 dark:text-slate-400 font-medium py-3 px-5">Pedido</th>
                  <th className="text-left text-xs text-slate-500 dark:text-slate-400 font-medium py-3 px-4">Cliente</th>
                  <th className="text-left text-xs text-slate-500 dark:text-slate-400 font-medium py-3 px-4">Status</th>
                  <th className="text-left text-xs text-slate-500 dark:text-slate-400 font-medium py-3 px-4">Rastreio</th>
                  <th className="text-right text-xs text-slate-500 dark:text-slate-400 font-medium py-3 px-4">Valor</th>
                  <th className="text-right text-xs text-slate-500 dark:text-slate-400 font-medium py-3 px-5">Data</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const trackingStatus = getTrackingStatus(order.tracking_codes)
                  const StatusIcon = trackingStatus.icon
                  const isExpanded = expandedOrder === order.id

                  return (
                    <>
                      <tr
                        key={order.id}
                        className="border-b border-slate-50 dark:border-slate-700/20 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                        onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                      >
                        <td className="py-3 px-5">
                          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{order.order_name}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div>
                            <p className="text-sm text-slate-700 dark:text-slate-200 truncate max-w-[160px]">{order.customer_name || "—"}</p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate max-w-[160px]">{order.customer_email || ""}</p>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${trackingStatus.color}`}>
                            <StatusIcon className="h-3 w-3" />
                            {trackingStatus.label}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {order.tracking_codes.length > 0 ? (
                            <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
                              {order.tracking_codes[0].tracking_number}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-500">Sem rastreio</span>
                          )}
                        </td>
                        <td className="text-right py-3 px-4">
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: order.currency || "BRL" }).format(order.total_price)}
                          </span>
                        </td>
                        <td className="text-right py-3 px-5">
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {order.order_created_at ? new Date(order.order_created_at).toLocaleDateString("pt-BR") : "—"}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          {order.tracking_codes.length > 0 && (
                            isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />
                          )}
                        </td>
                      </tr>

                      {/* Expanded tracking details */}
                      {isExpanded && order.tracking_codes.length > 0 && (
                        <tr key={`${order.id}-detail`}>
                          <td colSpan={7} className="bg-slate-50/70 dark:bg-slate-800/20 px-5 py-4 border-b border-slate-100 dark:border-slate-700/20">
                            <div className="space-y-3">
                              {order.tracking_codes.map((code) => {
                                const codeStatus = STATUS_LABELS[code.status] || STATUS_LABELS.pending
                                const CodeIcon = codeStatus.icon
                                return (
                                  <div key={code.id} className="bg-white dark:bg-[#151922] rounded-lg border border-slate-200/80 dark:border-slate-700/40 p-4">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-3">
                                        <span className="text-sm font-mono font-medium text-slate-800 dark:text-slate-100">{code.tracking_number}</span>
                                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${codeStatus.color}`}>
                                          <CodeIcon className="h-3 w-3" />
                                          {codeStatus.label}
                                        </span>
                                      </div>
                                      {code.carrier_name && (
                                        <span className="text-xs text-slate-500 dark:text-slate-400">{code.carrier_name}</span>
                                      )}
                                    </div>
                                    {code.last_event && (
                                      <p className="text-xs text-slate-600 dark:text-slate-300 mb-1">{code.last_event}</p>
                                    )}
                                    <div className="flex items-center gap-4 text-[11px] text-slate-400 dark:text-slate-500">
                                      {code.last_event_at && (
                                        <span>Última atualização: {new Date(code.last_event_at).toLocaleString("pt-BR")}</span>
                                      )}
                                      {code.estimated_delivery && (
                                        <span>Previsão: {new Date(code.estimated_delivery).toLocaleDateString("pt-BR")}</span>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-700/30">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Página {page} de {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="border-slate-200/80 dark:border-slate-700/40 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="border-slate-200/80 dark:border-slate-700/40 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
