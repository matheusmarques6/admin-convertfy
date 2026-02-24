"use client"

import { useState, useEffect, useCallback } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Loader2,
  TrendingDown,
  Mail,
  Zap,
  ShieldAlert,
  Eye,
  Clock,
  Filter,
  Store,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { GlowCard } from "@/components/ui/glow-card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/lib/hooks/use-toast"

interface StoreAlert {
  id: string
  store_id: string
  client_id: string | null
  type: "low_revenue" | "klaviyo_account_error" | "campaign_failure" | "low_recovery_rate"
  severity: "critical" | "warning" | "info"
  title: string
  message: string
  status: "active" | "acknowledged" | "resolved"
  metadata: Record<string, unknown>
  resolved_at: string | null
  created_at: string
  updated_at: string
  store_name?: string
  client_name?: string
}

const ALERT_TYPE_CONFIG = {
  low_revenue: {
    label: "Faturamento Baixo",
    icon: TrendingDown,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
  klaviyo_account_error: {
    label: "Erro Klaviyo",
    icon: ShieldAlert,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
  campaign_failure: {
    label: "Falha de Campanha",
    icon: Mail,
    color: "text-warning",
    bgColor: "bg-warning/10",
  },
  low_recovery_rate: {
    label: "Recuperação Baixa",
    icon: Zap,
    color: "text-warning",
    bgColor: "bg-warning/10",
  },
} as const

const SEVERITY_CONFIG = {
  critical: {
    label: "Crítico",
    className: "bg-destructive/15 text-destructive border-destructive/30",
  },
  warning: {
    label: "Aviso",
    className: "bg-warning/15 text-warning border-warning/30",
  },
  info: {
    label: "Info",
    className: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  },
} as const

const STATUS_CONFIG = {
  active: { label: "Ativo", className: "bg-destructive/15 text-destructive" },
  acknowledged: { label: "Visto", className: "bg-warning/15 text-warning" },
  resolved: { label: "Resolvido", className: "bg-success/15 text-success" },
} as const

function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMin < 1) return "agora"
  if (diffMin < 60) return `${diffMin}min atrás`
  if (diffHours < 24) return `${diffHours}h atrás`
  if (diffDays < 7) return `${diffDays}d atrás`
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

export function StoreAlertsPanel() {
  const { toast } = useToast()
  const [alerts, setAlerts] = useState<StoreAlert[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isChecking, setIsChecking] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>("active")
  const [filterType, setFilterType] = useState<string>("all")

  const fetchAlerts = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/stores/alerts?limit=200")
      const data = await res.json()
      if (data.success) {
        setAlerts(data.alerts)
      }
    } catch (error) {
      console.error("Error fetching alerts:", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  const handleRunCheckAll = async () => {
    setIsChecking(true)
    try {
      const res = await fetch("/api/stores/alerts/check", {
        method: "POST",
      })
      const data = await res.json()

      if (data.success) {
        toast({
          title: "Verificação concluída",
          description: `${data.stores_checked} loja(s) verificada(s) — ${data.alerts_created} alerta(s) criado(s), ${data.alerts_resolved} resolvido(s)`,
        })
        fetchAlerts()
      } else {
        toast({
          title: "Erro na verificação",
          description: data.error,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error running check:", error)
      toast({
        title: "Erro de conexão",
        description: "Não foi possível executar a verificação",
        variant: "destructive",
      })
    } finally {
      setIsChecking(false)
    }
  }

  const handleUpdateAlert = async (alertId: string, action: "acknowledge" | "resolve") => {
    try {
      const res = await fetch(`/api/stores/alerts/${alertId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()

      if (data.success) {
        toast({
          title: action === "acknowledge" ? "Alerta marcado como visto" : "Alerta resolvido",
        })
        fetchAlerts()
      }
    } catch (error) {
      console.error("Error updating alert:", error)
    }
  }

  const filteredAlerts = alerts.filter((alert) => {
    const matchesStatus = filterStatus === "all" || alert.status === filterStatus
    const matchesType = filterType === "all" || alert.type === filterType
    return matchesStatus && matchesType
  })

  const activeCount = alerts.filter((a) => a.status === "active").length
  const acknowledgedCount = alerts.filter((a) => a.status === "acknowledged").length

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div
          className={`rounded-xl border p-4 transition-all ${
            activeCount > 0
              ? "bg-gradient-to-br from-destructive/10 to-destructive/5 border-destructive/20"
              : "bg-card/50 border-border"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              activeCount > 0 ? "bg-destructive/10" : "bg-muted"
            }`}>
              <AlertTriangle className={`w-5 h-5 ${activeCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className={`text-2xl font-bold ${activeCount > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                {activeCount}
              </p>
              <p className="text-xs text-muted-foreground">Alertas Ativos</p>
            </div>
          </div>
        </div>

        {(Object.keys(ALERT_TYPE_CONFIG) as Array<keyof typeof ALERT_TYPE_CONFIG>).map((type) => {
          const config = ALERT_TYPE_CONFIG[type]
          const Icon = config.icon
          const count = alerts.filter((a) => a.type === type && a.status !== "resolved").length

          return (
            <button
              key={type}
              onClick={() => {
                setFilterType(type)
                setFilterStatus("all")
              }}
              className={`rounded-xl border p-4 text-left transition-all hover:bg-card/70 ${
                filterType === type ? "ring-1 ring-border" : ""
              } ${count > 0 ? config.bgColor + " border-current/20" : "bg-card/50 border-border"}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${config.bgColor} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${count > 0 ? config.color : "text-muted-foreground/40"}`} />
                </div>
                <div>
                  <p className={`text-2xl font-bold ${count > 0 ? config.color : "text-muted-foreground"}`}>{count}</p>
                  <p className="text-xs text-muted-foreground">{config.label}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Actions & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px] bg-card border-border">
              <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="acknowledged">Vistos</SelectItem>
              <SelectItem value="resolved">Resolvidos</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[200px] bg-card border-border">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="low_revenue">Faturamento Baixo</SelectItem>
              <SelectItem value="klaviyo_account_error">Erro Klaviyo</SelectItem>
              <SelectItem value="campaign_failure">Falha Campanha</SelectItem>
              <SelectItem value="low_recovery_rate">Recuperação Baixa</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleRunCheckAll}
          disabled={isChecking}
        >
          {isChecking ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Verificando todas as lojas...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Verificar Todas as Lojas
            </>
          )}
        </Button>
      </div>

      {/* Alerts List */}
      {filteredAlerts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-success" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {alerts.length === 0
                    ? "Nenhum alerta — todas as lojas estão saudáveis!"
                    : "Nenhum alerta para os filtros selecionados"}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Clique em &quot;Verificar Todas as Lojas&quot; para executar uma verificação manual
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-card/50 border-b border-border">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Alerta</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Loja / Cliente</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Severidade</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Quando</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredAlerts.map((alert) => {
                  const typeConfig = ALERT_TYPE_CONFIG[alert.type]
                  const severityConfig = SEVERITY_CONFIG[alert.severity]
                  const statusConfig = STATUS_CONFIG[alert.status]
                  const TypeIcon = typeConfig.icon

                  return (
                    <tr key={alert.id} className="border-b border-border/50 hover:bg-card/30 transition-colors">
                      {/* Alert Info */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg ${typeConfig.bgColor} flex items-center justify-center flex-shrink-0`}>
                            <TypeIcon className={`h-5 w-5 ${typeConfig.color}`} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-foreground truncate max-w-[300px]">{alert.title}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[300px]">{alert.message}</p>
                          </div>
                        </div>
                      </td>

                      {/* Store / Client */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <Store className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium">{alert.store_name || "N/A"}</p>
                            <p className="text-xs text-muted-foreground">{alert.client_name || "Avulsa"}</p>
                          </div>
                        </div>
                      </td>

                      {/* Severity */}
                      <td className="px-4 py-4 text-center">
                        <Badge className={`${severityConfig.className} text-[10px]`}>
                          {severityConfig.label}
                        </Badge>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4 text-center">
                        <Badge className={`${statusConfig.className} text-[10px]`}>
                          {statusConfig.label}
                        </Badge>
                      </td>

                      {/* Time */}
                      <td className="px-4 py-4 text-center">
                        <span className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                          <Clock className="h-3 w-3" />
                          {timeAgo(alert.created_at)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-4 text-center">
                        {alert.status !== "resolved" ? (
                          <div className="flex items-center justify-center gap-1">
                            {alert.status === "active" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => handleUpdateAlert(alert.id, "acknowledge")}
                              >
                                <Eye className="h-3.5 w-3.5 mr-1" />
                                Visto
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-success hover:text-success"
                              onClick={() => handleUpdateAlert(alert.id, "resolve")}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                              Resolver
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-success flex items-center justify-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            {alert.resolved_at ? timeAgo(alert.resolved_at) : "Resolvido"}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
