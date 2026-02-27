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
  Settings,
  Code2,
  ShoppingBag,
  ArrowRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

interface TrackingStoreData {
  client_store_id: string
  store_name: string
  platform: string
  shopify_connected: boolean
  shopify_store_domain: string
  tracking_store_id: string | null
  tracking_active: boolean
  has_17track_key: boolean
  last_sync_at: string | null
  stats: {
    orders: number
    pending: number
    delivered: number
  }
}

export default function PortalTrackingDashboard() {
  const [stores, setStores] = useState<TrackingStoreData[]>([])
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
      setStores(data.stores || [])
      setError(null)
    } catch {
      setError("Não foi possível carregar os dados de rastreamento")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-7 w-48 bg-slate-200 dark:bg-slate-700 mb-2" />
            <Skeleton className="h-4 w-64 bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 bg-white dark:bg-[#151922] rounded-xl border border-slate-100 dark:border-slate-700/30" />
          ))}
        </div>
        <Skeleton className="h-64 bg-white dark:bg-[#151922] rounded-xl border border-slate-100 dark:border-slate-700/30" />
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
          <Button onClick={() => fetchData()} className="bg-primary hover:bg-primary/85 text-white shadow-sm">
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  // Aggregate stats across all stores
  const totalOrders = stores.reduce((acc, s) => acc + s.stats.orders, 0)
  const totalPending = stores.reduce((acc, s) => acc + s.stats.pending, 0)
  const totalDelivered = stores.reduce((acc, s) => acc + s.stats.delivered, 0)
  const activeStores = stores.filter((s) => s.tracking_active).length
  const hasAnyTracking = stores.some((s) => s.tracking_store_id)

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Rastreamento</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Acompanhe os envios e rastreamento de pedidos
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="h-10 w-10 bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06] rounded-lg shadow-sm dark:shadow-slate-900/20"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          icon={Package}
          iconBg="bg-blue-50 dark:bg-blue-500/10"
          iconColor="text-blue-600"
          label="Total de Pedidos"
          value={String(totalOrders)}
        />
        <KpiCard
          icon={Truck}
          iconBg="bg-amber-50 dark:bg-amber-500/10"
          iconColor="text-amber-600"
          label="Em Trânsito"
          value={String(totalPending)}
        />
        <KpiCard
          icon={CheckCircle2}
          iconBg="bg-emerald-50 dark:bg-emerald-500/10"
          iconColor="text-emerald-600"
          label="Entregues"
          value={String(totalDelivered)}
        />
        <KpiCard
          icon={ShoppingBag}
          iconBg="bg-purple-50 dark:bg-purple-500/10"
          iconColor="text-purple-600"
          label="Lojas Ativas"
          value={`${activeStores} / ${stores.length}`}
        />
      </div>

      {/* Store Status Cards */}
      {stores.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">Status por Loja</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {stores.map((store) => (
              <div key={store.client_store_id} className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <ShoppingBag className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{store.store_name}</h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">{store.platform}</p>
                      </div>
                    </div>
                    {store.tracking_active ? (
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                        Ativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        Inativo
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-5 space-y-3">
                  {/* Integration status */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">Shopify</span>
                      {store.shopify_connected ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Conectado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                          <Clock className="h-3 w-3" />
                          Não conectado
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">17track</span>
                      {store.has_17track_key ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Configurado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 dark:text-slate-500">
                          <Clock className="h-3 w-3" />
                          Opcional
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  {store.tracking_active && (
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/30">
                      <div className="text-center">
                        <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{store.stats.orders}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Pedidos</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-amber-600">{store.stats.pending}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Em trânsito</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-emerald-600">{store.stats.delivered}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Entregues</p>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  {!store.tracking_active && store.shopify_connected && (
                    <Link
                      href="/portal/tracking/integrations"
                      className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg bg-primary hover:bg-primary/85 text-white text-sm font-medium transition-colors shadow-sm"
                    >
                      Ativar Rastreamento
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                  {!store.shopify_connected && (
                    <Link
                      href="/portal/stores"
                      className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg border border-slate-200/80 dark:border-slate-700/40 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors"
                    >
                      Conectar Shopify
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Links */}
      {hasAnyTracking && (
        <div className="grid gap-4 md:grid-cols-3">
          <Link
            href="/portal/tracking/orders"
            className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-5 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow group"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                <Package className="h-4 w-4 text-blue-600" />
              </div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Ver Pedidos</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Visualize todos os pedidos e seus códigos de rastreio
            </p>
          </Link>

          <Link
            href="/portal/tracking/integrations"
            className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-5 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow group"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center">
                <Settings className="h-4 w-4 text-purple-600" />
              </div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Integrações</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configure Shopify webhooks e 17track API
            </p>
          </Link>

          <Link
            href="/portal/tracking/script"
            className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-5 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow group"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-50 dark:bg-cyan-500/10 flex items-center justify-center">
                <Code2 className="h-4 w-4 text-cyan-600" />
              </div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Script</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Gere o código para instalar o widget na sua loja
            </p>
          </Link>
        </div>
      )}

      {/* Empty state */}
      {stores.length === 0 && (
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <Package className="h-8 w-8 text-slate-400 dark:text-slate-500" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Nenhuma loja configurada</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-6">
            Configure suas lojas na seção de Lojas para começar a usar o rastreamento de pedidos.
          </p>
          <Button asChild className="bg-primary hover:bg-primary/85 text-white shadow-sm">
            <Link href="/portal/stores">
              <ShoppingBag className="h-4 w-4 mr-2" />
              Gerenciar Lojas
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}

function KpiCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
}: {
  icon: React.ElementType
  iconBg: string
  iconColor: string
  label: string
  value: string
}) {
  return (
    <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-4 shadow-sm dark:shadow-slate-900/20 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow duration-200">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{label}</span>
      </div>
      <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  )
}
