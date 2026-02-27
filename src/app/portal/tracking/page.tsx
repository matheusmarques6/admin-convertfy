"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Code2,
  ArrowRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

interface TrackingStoreData {
  client_store_id: string
  store_name: string
  platform: string
  shopify_connected: boolean
  tracking_store_id: string | null
  tracking_active: boolean
  has_17track_key: boolean
  last_sync_at: string | null
  stats: { orders: number; pending: number; delivered: number }
}

export default function PortalTrackingPage() {
  const [store, setStore] = useState<TrackingStoreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)

    try {
      let storeId: string | null = null
      try { storeId = localStorage.getItem("portal_active_store") } catch { /* ignore */ }

      const params = new URLSearchParams()
      if (storeId) params.set("store_id", storeId)

      const response = await fetch(`/api/portal/tracking?${params}`)
      if (!response.ok) throw new Error("Erro ao carregar dados")
      const data = await response.json()

      // Use the active store (first one if filtered by store_id)
      const stores: TrackingStoreData[] = data.stores || []
      setStore(stores.length > 0 ? stores[0] : null)
      setError(null)
    } catch {
      setError("Não foi possível carregar os dados de rastreamento")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-6">
        <Skeleton className="h-7 w-48 bg-slate-200 dark:bg-slate-700" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 bg-white dark:bg-[#151922] rounded-xl border border-slate-100 dark:border-slate-700/30" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200 dark:border-slate-700/40 p-8 text-center max-w-sm shadow-sm">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{error}</p>
          <Button onClick={() => fetchData()} size="sm" className="bg-primary hover:bg-primary/85 text-white">Tentar novamente</Button>
        </div>
      </div>
    )
  }

  // Not tracking active — show setup CTA
  if (!store || !store.tracking_active) {
    return (
      <div className="max-w-[600px] mx-auto">
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
            <Package className="h-7 w-7 text-blue-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Rastreamento não ativado</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            {!store?.shopify_connected
              ? "Conecte a Shopify na página de Integrações para ativar o rastreamento."
              : "Ative o rastreamento na página de Integrações para começar a acompanhar seus pedidos."}
          </p>
          <Button asChild className="bg-primary hover:bg-primary/85 text-white shadow-sm">
            <Link href="/portal/integrations">
              Ir para Integrações
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const { stats } = store
  const inTransit = stats.pending

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Rastreamento</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Acompanhe os envios da loja <strong className="text-slate-700 dark:text-slate-200">{store.store_name}</strong>
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="h-9 w-9 bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06] rounded-lg shadow-sm"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 shadow-sm dark:shadow-slate-900/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
              <Package className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total</span>
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.orders}</p>
        </div>
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 shadow-sm dark:shadow-slate-900/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
              <Truck className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Em trânsito</span>
          </div>
          <p className="text-2xl font-bold text-amber-600">{inTransit}</p>
        </div>
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 shadow-sm dark:shadow-slate-900/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Entregues</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{stats.delivered}</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/portal/tracking/orders"
          className="flex items-center gap-4 bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-5 hover:shadow-md transition-shadow"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0">
            <Package className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Ver Pedidos</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Pedidos e códigos de rastreio</p>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
        </Link>

        <Link
          href="/portal/tracking/script"
          className="flex items-center gap-4 bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-5 hover:shadow-md transition-shadow"
        >
          <div className="w-10 h-10 rounded-lg bg-cyan-50 dark:bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
            <Code2 className="h-5 w-5 text-cyan-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Script do Widget</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Instalar widget na loja</p>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
        </Link>
      </div>

      {/* Status info */}
      {store.last_sync_at && (
        <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
          Última sincronização: {new Date(store.last_sync_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
        </p>
      )}

      {stats.orders === 0 && (
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-8 text-center">
          <Clock className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Aguardando pedidos</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Os pedidos aparecerão aqui automaticamente quando a Shopify enviar os dados via webhook.
          </p>
        </div>
      )}
    </div>
  )
}
