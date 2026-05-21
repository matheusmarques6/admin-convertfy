"use client"

import { useState } from "react"
import useSWR from "swr"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  RotateCcw,
} from "lucide-react"

/**
 * Aba "Alertas" do detalhe da loja.
 *
 * Substitui o antigo fluxo de "Leads CS" — todos os alertas (operacionais
 * e CS) vivem aqui, ligados diretamente a loja. Sem duplicacao de dados.
 *
 * Tipos exibidos (criados por crons/forms):
 *   - health_critical    (cron: crm-health-compute)
 *   - renewal_due        (cron: crm-renewal-opportunities)
 *   - feedback_received  (POST /api/public/forms/[slug]/submit)
 *   - low_revenue, klaviyo_account_error, etc. (alertas operacionais)
 */

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Alert {
  id: string
  type: string
  severity: "critical" | "warning" | "info"
  title: string
  message: string
  status: "active" | "acknowledged" | "resolved"
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  resolved_by_profile?: {
    id: string
    name: string | null
    avatar_url: string | null
  } | null
}

const TYPE_LABELS: Record<string, string> = {
  health_critical: "Health crítico",
  renewal_due: "Renovação próxima",
  feedback_received: "Feedback recebido",
  churn_recovery: "Win-back",
  low_revenue: "Receita baixa",
  klaviyo_account_error: "Erro Klaviyo",
  campaign_failure: "Falha em campanha",
  low_recovery_rate: "Taxa recuperação baixa",
}

const SEVERITY_STYLE: Record<
  string,
  { color: string; bg: string; border: string; icon: typeof AlertTriangle }
> = {
  critical: {
    color: "#991B1B",
    bg: "#FEF2F2",
    border: "#FECACA",
    icon: AlertTriangle,
  },
  warning: {
    color: "#92400E",
    bg: "#FFFBEB",
    border: "#FDE68A",
    icon: AlertTriangle,
  },
  info: { color: "#1E40AF", bg: "#EFF6FF", border: "#BFDBFE", icon: Eye },
}

const STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  acknowledged: "Em andamento",
  resolved: "Resolvido",
}

interface Props {
  storeId: string
}

export default function TabAlertas({ storeId }: Props) {
  const [filter, setFilter] = useState<"active" | "all">("active")
  const { data, isLoading, mutate } = useSWR<{
    alerts: Alert[]
    data?: { alerts: Alert[] }
  }>(`/api/stores/${storeId}/alerts?status=${filter}`, fetcher, {
    refreshInterval: 60_000,
  })

  const alerts = data?.data?.alerts ?? data?.alerts ?? []

  const activeCount = alerts.filter((a) => a.status === "active").length
  const ackCount = alerts.filter((a) => a.status === "acknowledged").length

  async function updateStatus(alertId: string, status: Alert["status"]) {
    await fetch(`/api/stores/${storeId}/alerts/${alertId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    mutate()
  }

  return (
    <div className="space-y-4">
      {/* Stats + filter */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Stat label="Ativos" value={activeCount} color="#991B1B" />
          <Stat label="Em andamento" value={ackCount} color="#92400E" />
        </div>
        <select
          className="crm-input"
          value={filter}
          onChange={(e) => setFilter(e.target.value as "active" | "all")}
          style={{ width: "auto", minWidth: 160 }}
        >
          <option value="active">Apenas ativos</option>
          <option value="all">Todos (incluindo resolvidos)</option>
        </select>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="text-[12px] text-slate-500 p-4">
          Carregando alertas...
        </div>
      ) : alerts.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: "center",
            background: "#fff",
            border: "1px solid var(--crm-border)",
            borderRadius: 8,
          }}
        >
          <CheckCircle2
            className="h-8 w-8 mx-auto"
            style={{ color: "#10B981" }}
          />
          <div
            style={{
              marginTop: 12,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--crm-gray-900)",
            }}
          >
            Nenhum alerta {filter === "active" ? "ativo" : ""}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--crm-gray-500)",
              marginTop: 4,
            }}
          >
            {filter === "active"
              ? "Loja sem alertas pendentes."
              : "Esta loja nunca teve alertas."}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onUpdate={updateStatus}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className="crm-tnum"
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: value > 0 ? color : "var(--crm-gray-400)",
          fontFamily: "var(--crm-font-mono)",
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontSize: 11,
          color: "var(--crm-gray-500)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </span>
    </div>
  )
}

function AlertCard({
  alert,
  onUpdate,
}: {
  alert: Alert
  onUpdate: (id: string, status: Alert["status"]) => void
}) {
  const sev = SEVERITY_STYLE[alert.severity] ?? SEVERITY_STYLE.info
  const Icon = sev.icon
  const isResolved = alert.status === "resolved"
  const typeLabel = TYPE_LABELS[alert.type] ?? alert.type

  return (
    <div
      style={{
        background: isResolved ? "var(--crm-gray-50)" : "#fff",
        border: `1px solid ${isResolved ? "var(--crm-gray-200)" : sev.border}`,
        borderRadius: 8,
        padding: "12px 14px",
        opacity: isResolved ? 0.7 : 1,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            background: sev.bg,
            color: sev.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: sev.color,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                padding: "2px 6px",
                background: sev.bg,
                border: `1px solid ${sev.border}`,
                borderRadius: 3,
              }}
            >
              {typeLabel}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--crm-gray-500)",
                textTransform: "uppercase",
              }}
            >
              {STATUS_LABEL[alert.status] ?? alert.status}
            </span>
            <span
              className="ml-auto"
              style={{
                fontSize: 11,
                color: "var(--crm-gray-500)",
                fontFamily: "var(--crm-font-mono)",
              }}
            >
              <Clock
                className="h-3 w-3 inline mr-1"
                style={{ verticalAlign: "-2px" }}
              />
              {timeAgo(alert.created_at)}
            </span>
          </div>
          <h4
            style={{
              margin: "6px 0 2px",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--crm-gray-900)",
            }}
          >
            {alert.title}
          </h4>
          <p
            style={{
              margin: 0,
              fontSize: 12.5,
              color: "var(--crm-gray-700)",
              lineHeight: 1.5,
            }}
          >
            {alert.message}
          </p>
          {alert.resolved_by_profile && isResolved && (
            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                color: "var(--crm-gray-500)",
              }}
            >
              Resolvido por {alert.resolved_by_profile.name ?? "alguem"} ·{" "}
              {alert.resolved_at && timeAgo(alert.resolved_at)}
            </div>
          )}

          {/* Actions */}
          {!isResolved && (
            <div className="flex items-center gap-2 mt-3">
              {alert.status === "active" && (
                <button
                  type="button"
                  onClick={() => onUpdate(alert.id, "acknowledged")}
                  className="cf-focusable inline-flex items-center gap-1.5"
                  style={{
                    height: 26,
                    padding: "0 10px",
                    fontSize: 11.5,
                    fontWeight: 500,
                    color: "var(--crm-gray-700)",
                    background: "#fff",
                    border: "1px solid var(--crm-border)",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  <Eye className="h-3 w-3" />
                  Marcar como em andamento
                </button>
              )}
              <button
                type="button"
                onClick={() => onUpdate(alert.id, "resolved")}
                className="cf-focusable inline-flex items-center gap-1.5"
                style={{
                  height: 26,
                  padding: "0 10px",
                  fontSize: 11.5,
                  fontWeight: 500,
                  color: "#fff",
                  background: "#10B981",
                  border: 0,
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                <CheckCircle2 className="h-3 w-3" />
                Resolver
              </button>
            </div>
          )}
          {isResolved && (
            <button
              type="button"
              onClick={() => onUpdate(alert.id, "active")}
              className="cf-focusable inline-flex items-center gap-1.5 mt-3"
              style={{
                height: 26,
                padding: "0 10px",
                fontSize: 11.5,
                fontWeight: 500,
                color: "var(--crm-gray-700)",
                background: "transparent",
                border: "1px dashed var(--crm-gray-300)",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              <RotateCcw className="h-3 w-3" />
              Reabrir
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  return `${months}mes`
}
