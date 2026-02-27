"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Package,
  MapPin,
  Truck,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { AnimatedContainer, AnimatedItem } from "@/components/ui/animated-container"
import { TRACKING_STATUS_LABELS } from "@/types/tracking"
import type { TrackingStatus, TrackingEvent } from "@/types/tracking"

interface TrackingCodeFull {
  id: string
  tracking_number: string
  carrier_name: string | null
  status: TrackingStatus
  status_detail: string | null
  last_event: string | null
  last_event_at: string | null
  estimated_delivery: string | null
  tracking_events: TrackingEvent[]
}

interface Order {
  id: string
  order_name: string | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  total_price: number | null
  currency: string
  financial_status: string | null
  fulfillment_status: string | null
  shipped_at: string | null
  delivered_at: string | null
  order_created_at: string | null
  tracking_codes: TrackingCodeFull[]
}

const statusBadgeColors: Record<string, string> = {
  pending: "bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300",
  info_received: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
  in_transit: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
  out_for_delivery: "bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400",
  delivered: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  failed_attempt: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400",
  exception: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400",
  expired: "bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400",
}

const timelineDotColors: Record<string, string> = {
  pending: "bg-slate-400",
  info_received: "bg-blue-500",
  in_transit: "bg-amber-500",
  out_for_delivery: "bg-purple-500",
  delivered: "bg-emerald-500",
  failed_attempt: "bg-red-500",
  exception: "bg-red-500",
  expired: "bg-slate-400",
}

function formatDate(d: string | null) {
  if (!d) return "-"
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

function formatDateTime(d: string | null) {
  if (!d) return "-"
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

function formatCurrency(value: number | null, currency = "BRL") {
  if (!value) return "R$ 0,00"
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value)
}

export default function PortalTrackingOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  const limit = 20

  const fetchOrders = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (search) params.set("search", search)

      const response = await fetch(`/api/portal/tracking/orders?${params}`)
      if (!response.ok) throw new Error("Erro ao carregar pedidos")
      const result = await response.json()
      setOrders(result.orders || [])
      setTotal(result.total || 0)
    } catch (err) {
      console.error("Error fetching orders:", err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [page, statusFilter, search])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const handleSearch = () => {
    setPage(1)
    setSearch(searchInput)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Pedidos</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {total} pedidos rastreados
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => fetchOrders(true)}
          disabled={refreshing}
          className="h-10 w-10 bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40 text-slate-500 dark:text-slate-400 rounded-lg"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <AnimatedContainer className="space-y-4">
        <AnimatedItem>
          <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm">
            {/* Filters */}
            <div className="p-4 border-b border-slate-200/80 dark:border-slate-700/40">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Buscar por pedido, email, nome ou rastreio..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="pl-9 h-9 bg-white dark:bg-[#0d1117] border-slate-200 dark:border-slate-700/40 text-sm"
                  />
                </div>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
                  <SelectTrigger className="w-[160px] h-9 bg-white dark:bg-[#0d1117] border-slate-200 dark:border-slate-700/40 text-sm">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="info_received">Info Recebida</SelectItem>
                    <SelectItem value="in_transit">Em Trânsito</SelectItem>
                    <SelectItem value="out_for_delivery">Saiu p/ Entrega</SelectItem>
                    <SelectItem value="delivered">Entregue</SelectItem>
                    <SelectItem value="exception">Exceção</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleSearch} size="sm" className="h-9">
                  Buscar
                </Button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full bg-slate-100 dark:bg-slate-800 rounded-lg" />
                  ))}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-700/40">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pedido</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cliente</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden md:table-cell">Email</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Valor</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Rastreio</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden lg:table-cell">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/30">
                    {orders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-16 text-center text-slate-400">
                          Nenhum pedido encontrado
                        </td>
                      </tr>
                    ) : (
                      orders.map((order) => {
                        const mainCode = order.tracking_codes?.[0]
                        const status = mainCode?.status || "pending"
                        return (
                          <tr
                            key={order.id}
                            className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
                            onClick={() => setSelectedOrder(order)}
                          >
                            <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                              {order.order_name || "-"}
                            </td>
                            <td className="px-4 py-3 text-slate-700 dark:text-slate-300 truncate max-w-[150px]">
                              {order.customer_name || "-"}
                            </td>
                            <td className="px-4 py-3 text-slate-500 dark:text-slate-400 truncate max-w-[180px] hidden md:table-cell">
                              {order.customer_email || "-"}
                            </td>
                            <td className="px-4 py-3 text-slate-700 dark:text-slate-300 tabular-nums">
                              {formatCurrency(order.total_price, order.currency)}
                            </td>
                            <td className="px-4 py-3">
                              {mainCode ? (
                                <span className="text-xs font-mono text-slate-600 dark:text-slate-400">{mainCode.tracking_number}</span>
                              ) : (
                                <span className="text-xs text-slate-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadgeColors[status] || statusBadgeColors.pending}`}>
                                {TRACKING_STATUS_LABELS[status as TrackingStatus] || status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 hidden lg:table-cell">
                              {formatDate(order.order_created_at)}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-100 dark:border-slate-700/40 flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  Página {page} de {totalPages} ({total} pedidos)
                </p>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </AnimatedItem>
      </AnimatedContainer>

      {/* Order Detail Modal */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              {selectedOrder?.order_name || "Detalhes do Pedido"}
            </DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-5">
              {/* Order Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Cliente</p>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{selectedOrder.customer_name || "-"}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{selectedOrder.customer_email}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Valor</p>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{formatCurrency(selectedOrder.total_price, selectedOrder.currency)}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{formatDate(selectedOrder.order_created_at)}</p>
                </div>
              </div>

              {selectedOrder.shipped_at && (
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <Truck className="h-4 w-4" />
                  Enviado em {formatDate(selectedOrder.shipped_at)}
                  {selectedOrder.delivered_at && ` · Entregue em ${formatDate(selectedOrder.delivered_at)}`}
                </div>
              )}

              {/* Tracking Codes & Timeline */}
              {selectedOrder.tracking_codes?.map((code) => (
                <div key={code.id} className="border border-slate-200 dark:border-slate-700/40 rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-mono font-medium text-slate-800 dark:text-slate-200">{code.tracking_number}</p>
                      {code.carrier_name && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{code.carrier_name}</p>
                      )}
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadgeColors[code.status] || statusBadgeColors.pending}`}>
                      {TRACKING_STATUS_LABELS[code.status] || code.status}
                    </span>
                  </div>

                  {code.tracking_events && code.tracking_events.length > 0 ? (
                    <div className="relative pl-6 space-y-4">
                      <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-200 dark:bg-slate-700" />
                      {code.tracking_events.map((event, idx) => (
                        <div key={idx} className="relative">
                          <div className={`absolute -left-[17px] top-1.5 w-3 h-3 rounded-full border-2 border-white dark:border-[#151922] ${idx === 0 ? timelineDotColors[event.status] || "bg-primary" : "bg-slate-300 dark:bg-slate-600"}`} />
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{event.description}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(event.date)}</span>
                            {event.location && (
                              <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {event.location}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">
                      Aguardando atualização do rastreio
                    </p>
                  )}
                </div>
              ))}

              {(!selectedOrder.tracking_codes || selectedOrder.tracking_codes.length === 0) && (
                <div className="text-center py-6 text-slate-400">
                  <Truck className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhum código de rastreio registrado</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
