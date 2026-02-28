"use client"

import { useState } from "react"
import {
  Package,
  Search,
  Truck,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  MapPin,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface TrackingEvent {
  date: string
  description: string
  location?: string
  status?: string
}

interface TrackingData {
  tracking_number: string
  carrier_code: string
  carrier_name: string
  status: string
  status_detail: string
  last_event: string
  last_event_at: string | null
  estimated_delivery: string | null
  events: TrackingEvent[]
  order_name?: string
  shop_domain?: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType; bg: string }> = {
  pending: { label: "Pendente", color: "text-slate-500", icon: Clock, bg: "bg-slate-100 dark:bg-slate-800" },
  in_transit: { label: "Em Trânsito", color: "text-amber-600", icon: Truck, bg: "bg-amber-50 dark:bg-amber-500/10" },
  delivered: { label: "Entregue", color: "text-emerald-600", icon: CheckCircle2, bg: "bg-emerald-50 dark:bg-emerald-500/10" },
  pick_up: { label: "Pronto p/ Retirada", color: "text-blue-600", icon: Package, bg: "bg-blue-50 dark:bg-blue-500/10" },
  expired: { label: "Expirado", color: "text-red-600", icon: XCircle, bg: "bg-red-50 dark:bg-red-500/10" },
  alert: { label: "Alerta", color: "text-red-600", icon: AlertCircle, bg: "bg-red-50 dark:bg-red-500/10" },
  undelivered: { label: "Não Entregue", color: "text-red-600", icon: XCircle, bg: "bg-red-50 dark:bg-red-500/10" },
}

export default function PublicTrackingPage() {
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<TrackingData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setResult(null)
    setNotFound(false)
    setError(null)

    try {
      const isOrderNumber = /^#?\d+$/.test(query.trim()) || query.startsWith("#")
      const body: Record<string, string> = {}

      if (isOrderNumber) {
        body.order_number = query.trim().replace(/^#/, "")
      } else {
        body.tracking_number = query.trim()
      }

      const response = await fetch("/api/tracking/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (data.found && data.tracking) {
        setResult(data.tracking)
      } else if (data.found && data.orders && data.orders.length > 0) {
        // Take first order's first tracking code
        const order = data.orders[0]
        if (order.tracking_codes && order.tracking_codes.length > 0) {
          const code = order.tracking_codes[0]
          setResult({
            ...code,
            order_name: order.order_name,
          })
        } else {
          setNotFound(true)
        }
      } else {
        setNotFound(true)
      }
    } catch {
      setError("Erro ao buscar rastreamento. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  const statusConfig = result ? (STATUS_CONFIG[result.status] || STATUS_CONFIG.pending) : null

  return (
    <div className="min-h-screen bg-[#F8F9FB] dark:bg-[#0B0E14]">
      {/* Header */}
      <div className="bg-white dark:bg-[#151922] border-b border-slate-200/80 dark:border-slate-700/40">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Rastrear Pedido</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Digite o código de rastreio ou número do pedido</p>
            </div>
          </div>

          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Código de rastreio ou nº do pedido..."
                className="pl-10 h-12 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 text-base placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl"
              />
            </div>
            <Button
              type="submit"
              disabled={loading || !query.trim()}
              className="h-12 px-6 bg-primary hover:bg-primary/85 text-white shadow-sm rounded-xl"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                "Buscar"
              )}
            </Button>
          </form>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Not found */}
        {notFound && (
          <div className="bg-white dark:bg-[#151922] rounded-2xl border border-slate-200/80 dark:border-slate-700/40 p-10 text-center shadow-sm">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
              <Search className="h-8 w-8 text-slate-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Nenhum resultado encontrado</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Verifique o código de rastreio ou número do pedido e tente novamente.
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-white dark:bg-[#151922] rounded-2xl border border-slate-200/80 dark:border-slate-700/40 p-10 text-center shadow-sm">
            <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Erro</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && statusConfig && (
          <div className="space-y-6">
            {/* Status Card */}
            <div className="bg-white dark:bg-[#151922] rounded-2xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm overflow-hidden">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    {result.order_name && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Pedido {result.order_name}</p>
                    )}
                    <p className="text-sm font-mono text-slate-700 dark:text-slate-200">{result.tracking_number}</p>
                    {result.carrier_name && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{result.carrier_name}</p>
                    )}
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${statusConfig.color} ${statusConfig.bg}`}>
                    <statusConfig.icon className="h-4 w-4" />
                    {statusConfig.label}
                  </div>
                </div>

                {result.status_detail && (
                  <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{result.status_detail}</p>
                )}

                {result.estimated_delivery && (
                  <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <Clock className="h-4 w-4" />
                    Previsão de entrega: {new Date(result.estimated_delivery).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                  </div>
                )}
              </div>
            </div>

            {/* Timeline */}
            {result.events && result.events.length > 0 && (
              <div className="bg-white dark:bg-[#151922] rounded-2xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/30">
                  <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">Histórico de Movimentação</h3>
                </div>
                <div className="p-6">
                  <div className="relative">
                    {result.events.map((event, index) => {
                      const isFirst = index === 0
                      const isLast = index === result.events.length - 1

                      return (
                        <div key={index} className="relative flex gap-4 pb-6 last:pb-0">
                          {/* Timeline line */}
                          {!isLast && (
                            <div className="absolute left-[15px] top-8 bottom-0 w-[2px] bg-slate-200 dark:bg-slate-700/50" />
                          )}

                          {/* Timeline dot */}
                          <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            isFirst
                              ? "bg-primary/10 text-primary"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
                          }`}>
                            {isFirst ? (
                              <Truck className="h-4 w-4" />
                            ) : (
                              <MapPin className="h-3.5 w-3.5" />
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${isFirst ? "font-medium text-slate-800 dark:text-slate-100" : "text-slate-600 dark:text-slate-300"}`}>
                              {event.description}
                            </p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs text-slate-400 dark:text-slate-500">
                                {event.date ? new Date(event.date).toLocaleString("pt-BR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }) : ""}
                              </span>
                              {event.location && (
                                <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
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
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center py-8">
        <a
          href={`https://convertfy.me/?utm_source=track&utm_medium=referral&utm_campaign=powered_by${result?.shop_domain ? `&utm_content=${encodeURIComponent(result.shop_domain)}` : ""}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-500 dark:hover:text-slate-400 transition-colors"
        >
          Powered by Convertfy
        </a>
      </div>
    </div>
  )
}
