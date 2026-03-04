"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  Package,
  Search,
  MapPin,
  Calendar,
  Truck,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react"
import { TRACKING_STATUS_LABELS } from "@/types/tracking"
import type { TrackingStatus, TrackingEvent } from "@/types/tracking"

interface TrackingResult {
  order: {
    id: string
    order_name: string | null
    customer_name: string | null
    customer_email: string | null
    order_created_at: string | null
    shipped_at: string | null
    delivered_at: string | null
    total_price: number | null
    currency: string
  }
  tracking: Array<{
    id: string
    tracking_number: string
    carrier_name: string | null
    status: TrackingStatus
    status_detail: string | null
    last_event: string | null
    tracking_events: TrackingEvent[]
  }>
}

const statusConfig: Record<string, { icon: typeof Package; color: string; bg: string }> = {
  pending: { icon: Clock, color: "text-slate-500", bg: "bg-slate-100" },
  info_received: { icon: Package, color: "text-blue-500", bg: "bg-blue-50" },
  in_transit: { icon: Truck, color: "text-amber-500", bg: "bg-amber-50" },
  out_for_delivery: { icon: Truck, color: "text-purple-500", bg: "bg-purple-50" },
  delivered: { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50" },
  failed_attempt: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-50" },
  exception: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-50" },
  expired: { icon: Clock, color: "text-slate-400", bg: "bg-slate-100" },
}

function formatDate(d: string | null) {
  if (!d) return ""
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
  })
}

function formatDateTime(d: string | null) {
  if (!d) return ""
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

export default function TrackPage() {
  const params = useParams()
  const router = useRouter()
  const code = params.code as string

  const [query, setQuery] = useState(code === "search" ? "" : code || "")
  const [results, setResults] = useState<TrackingResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const doSearch = async (q: string) => {
    if (!q || q.length < 3) return
    setLoading(true)
    setSearched(true)
    try {
      const response = await fetch(`/api/tracking/lookup?q=${encodeURIComponent(q)}`)
      const data = await response.json()
      setResults(data.results || [])
    } catch (err) {
      console.error("Search error:", err)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (code && code !== "search") {
      doSearch(code)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim().length >= 3) {
      router.replace(`/track/${encodeURIComponent(query.trim())}`, { scroll: false })
      doSearch(query.trim())
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0284C7] to-[#05AFF2] flex items-center justify-center">
            <Package className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-slate-800">Rastreamento</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Search Section */}
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-2">
            Rastreie seu pedido
          </h1>
          <p className="text-slate-500 text-sm">
            Informe o código de rastreio, número do pedido (#1001) ou email
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 mb-10 max-w-xl mx-auto">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex: BR123456789BR, #1001 ou email@exemplo.com"
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#05AFF2]/30 focus:border-[#05AFF2] transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={loading || query.length < 3}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#05AFF2] text-white font-semibold text-sm hover:shadow-lg hover:shadow-[#05AFF2]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              "Buscar"
            )}
          </button>
        </form>

        {/* Results */}
        {loading && (
          <div className="text-center py-16">
            <div className="w-10 h-10 border-3 border-slate-200 border-t-[#05AFF2] rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-400 text-sm">Buscando informações...</p>
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4">
              <Package className="h-8 w-8 text-slate-300" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-1">Nenhum resultado encontrado</h2>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              Verifique o código de rastreio ou tente buscar pelo número do pedido ou email.
            </p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="space-y-6">
            {results.map((result, idx) => (
              <div key={idx} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                {/* Order Header */}
                <div className="p-5 border-b border-slate-100">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-slate-800">
                        {result.order.order_name || "Pedido"}
                      </h2>
                      {result.order.customer_name && (
                        <p className="text-sm text-slate-500 mt-0.5">{result.order.customer_name}</p>
                      )}
                    </div>
                    {result.order.order_created_at && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(result.order.order_created_at)}
                      </div>
                    )}
                  </div>

                  {result.order.shipped_at && (
                    <div className="flex items-center gap-1.5 mt-2 text-sm text-slate-500">
                      <Truck className="h-3.5 w-3.5" />
                      Enviado em {formatDate(result.order.shipped_at)}
                    </div>
                  )}
                </div>

                {/* Tracking Codes */}
                {result.tracking.map((track) => {
                  const config = statusConfig[track.status] || statusConfig.pending
                  const StatusIcon = config.icon
                  return (
                    <div key={track.id} className="p-5">
                      {/* Status Banner */}
                      <div className={`flex items-center gap-3 p-4 rounded-xl ${config.bg} mb-5`}>
                        <StatusIcon className={`h-6 w-6 ${config.color}`} />
                        <div>
                          <p className={`font-semibold text-sm ${config.color}`}>
                            {TRACKING_STATUS_LABELS[track.status] || track.status}
                          </p>
                          {track.status_detail && (
                            <p className="text-xs text-slate-500 mt-0.5">{track.status_detail}</p>
                          )}
                        </div>
                      </div>

                      {/* Tracking Number */}
                      <div className="flex items-center justify-between mb-5">
                        <div>
                          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Código de Rastreio</p>
                          <p className="text-sm font-mono font-semibold text-slate-800">{track.tracking_number}</p>
                        </div>
                        {track.carrier_name && (
                          <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-medium">
                            {track.carrier_name}
                          </span>
                        )}
                      </div>

                      {/* Timeline */}
                      {track.tracking_events && track.tracking_events.length > 0 ? (
                        <div className="relative pl-8">
                          <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-slate-200" />
                          {track.tracking_events.map((event, eventIdx) => {
                            const isFirst = eventIdx === 0
                            const isDelivered = event.status === "delivered"
                            return (
                              <div key={eventIdx} className="relative pb-6 last:pb-0">
                                <div className={`absolute -left-5 top-1 w-4 h-4 rounded-full border-[3px] ${isFirst ? "border-[#05AFF2] bg-white" : "border-slate-300 bg-white"} ${isDelivered ? "border-emerald-500" : ""}`} />
                                <div className={isFirst ? "" : "opacity-75"}>
                                  <p className={`text-sm font-medium ${isFirst ? "text-slate-800" : "text-slate-600"}`}>
                                    {event.description}
                                  </p>
                                  <div className="flex items-center gap-3 mt-1">
                                    <span className="text-xs text-slate-400">{formatDateTime(event.date)}</span>
                                    {event.location && (
                                      <span className="text-xs text-slate-400 flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        {event.location}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-slate-400">
                          <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Aguardando atualização do rastreio</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-100 mt-16 py-6 text-center">
        <a
          href="https://convertfy.me/?utm_source=track&utm_medium=referral&utm_campaign=powered_by"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-slate-400 hover:text-slate-500 transition-colors"
        >
          Powered by <span className="font-semibold text-slate-500">Convertfy</span>
        </a>
      </footer>
    </div>
  )
}
