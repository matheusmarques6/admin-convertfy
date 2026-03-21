"use client"

import { useState, useEffect, useCallback } from "react"
import {
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
} from "lucide-react"
import { Icon as IconWrapper } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
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
  client_id: string
  type: "low_revenue" | "klaviyo_account_error" | "campaign_failure" | "low_recovery_rate"
  severity: "critical" | "warning" | "info"
  title: string
  message: string
  status: "active" | "acknowledged" | "resolved"
  metadata: Record<string, unknown>
  resolved_at: string | null
  created_at: string
  updated_at: string
}

interface StoreAlertsTabProps {
  storeId: string
  storeName: string
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
    className: "bg-primary/10 text-primary border-primary/30",
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

export function StoreAlertsTab({ storeId }: StoreAlertsTabProps) {
  const { toast } = useToast()
  const [alerts, setAlerts] = useState<StoreAlert[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isChecking, setIsChecking] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterType, setFilterType] = useState<string>("all")

  const fetchAlerts = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/stores/alerts?store_id=${storeId}&limit=100`)
      const data = await res.json()
      if (data.success) {
        setAlerts(data.alerts)
      }
    } catch (error) {
      console.error("Error fetching alerts:", error)
    } finally {
      setIsLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  const handleRunCheck = async () => {
    setIsChecking(true)
    try {
      const res = await fetch(`/api/stores/alerts/check?store_id=${storeId}`, {
        method: "POST",
      })
      const data = await res.json()

      if (data.success) {
        toast({
          title: "Verificação concluída",
          description: `${data.alerts_created} alerta(s) criado(s), ${data.alerts_resolved} resolvido(s)`,
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
        <IconWrapper icon={Loader2} customSize={32} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">Alertas</h3>
          {activeCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {activeCount} ativo{activeCount !== 1 ? "s" : ""}
            </Badge>
          )}
          {acknowledgedCount > 0 && (
            <Badge className="bg-warning/15 text-warning border-warning/30 text-xs">
              {acknowledgedCount} visto{acknowledgedCount !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        <Button
          onClick={handleRunCheck}
          disabled={isChecking}
          size="sm"
        >
          {isChecking ? (
            <>
              <IconWrapper icon={Loader2} size={16} className="mr-2 animate-spin" />
              Verificando...
            </>
          ) : (
            <>
              <IconWrapper icon={RefreshCw} size={16} className="mr-2" />
              Verificar Agora
            </>
          )}
        </Button>
      </div>

      {/* Summary Cards */}
      {(activeCount > 0 || acknowledgedCount > 0) && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(ALERT_TYPE_CONFIG) as Array<keyof typeof ALERT_TYPE_CONFIG>).map((type) => {
            const config = ALERT_TYPE_CONFIG[type]
            const count = alerts.filter((a) => a.type === type && a.status !== "resolved").length

            return (
              <div
                key={type}
                className={`rounded-lg border p-3 flex items-center gap-3 ${
                  count > 0 ? config.bgColor + " border-border" : "bg-card border-border"
                }`}
              >
                <IconWrapper icon={config.icon} size={20} className={count > 0 ? config.color : "text-muted-foreground/40"} />
                <div>
                  <p className={`text-lg font-bold ${count > 0 ? config.color : "text-muted-foreground"}`}>{count}</p>
                  <p className="text-xs text-muted-foreground">{config.label}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <IconWrapper icon={Filter} customSize={12} className="mr-1" />
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
          <SelectTrigger className="w-[180px] h-8 text-xs">
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

      {/* Alerts List */}
      {filteredAlerts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="flex flex-col items-center gap-3">
              <IconWrapper icon={CheckCircle2} customSize={32} className="text-success" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {alerts.length === 0
                    ? "Nenhum alerta — tudo certo!"
                    : "Nenhum alerta para os filtros selecionados"}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Clique em &quot;Verificar Agora&quot; para executar uma verificação manual
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map((alert) => {
            const typeConfig = ALERT_TYPE_CONFIG[alert.type]
            const severityConfig = SEVERITY_CONFIG[alert.severity]
            const statusConfig = STATUS_CONFIG[alert.status]
            return (
              <Card
                key={alert.id}
                className={`rounded-xl ${
                  alert.status === "active" && alert.severity === "critical"
                    ? "border-destructive/30"
                    : alert.status === "active"
                    ? "border-warning/30"
                    : ""
                }`}
              >
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-lg ${typeConfig.bgColor} flex items-center justify-center flex-shrink-0`}>
                      <IconWrapper icon={typeConfig.icon} size={20} className={typeConfig.color} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{alert.title}</span>
                        <Badge className={`${severityConfig.className} text-[10px]`}>
                          {severityConfig.label}
                        </Badge>
                        <Badge className={`${statusConfig.className} text-[10px]`}>
                          {statusConfig.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <IconWrapper icon={Clock} customSize={12} />
                          {timeAgo(alert.created_at)}
                        </span>
                        {alert.status === "resolved" && alert.resolved_at && (
                          <span className="text-xs text-success flex items-center gap-1">
                            <IconWrapper icon={CheckCircle2} customSize={12} />
                            Resolvido {timeAgo(alert.resolved_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    {alert.status !== "resolved" && (
                      <div className="flex gap-1.5 flex-shrink-0">
                        {alert.status === "active" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => handleUpdateAlert(alert.id, "acknowledge")}
                            title="Marcar como visto"
                          >
                            <IconWrapper icon={Eye} customSize={14} className="mr-1" />
                            Visto
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs text-success hover:text-success"
                          onClick={() => handleUpdateAlert(alert.id, "resolve")}
                          title="Resolver alerta"
                        >
                          <IconWrapper icon={CheckCircle2} customSize={14} className="mr-1" />
                          Resolver
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
