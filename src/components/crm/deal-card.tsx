"use client"

import { Building2, Calendar, AlertCircle } from "lucide-react"

export interface DealCardData {
  id: string
  title: string
  value: number | null
  currency: string | null
  probability: number | null
  status: string
  last_stage_changed_at: string | null
  source: string | null
  tags: string[] | null
  owner?: { id: string; name: string; avatar_url: string | null } | null
  client?: { id: string; name: string } | null
  store?: { id: string; name: string } | null
}

interface DealCardProps {
  deal: DealCardData
  slaHours?: number | null
  onClick?: (id: string) => void
  isDragging?: boolean
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v)

function daysSince(iso: string | null): number {
  if (!iso) return 0
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

export function DealCard({ deal, slaHours, onClick, isDragging }: DealCardProps) {
  const days = daysSince(deal.last_stage_changed_at)
  const slaDays = slaHours ? Math.ceil(slaHours / 24) : null
  const slaBreach = slaDays != null && days > slaDays

  return (
    <div
      onClick={() => onClick?.(deal.id)}
      style={{
        width: "100%",
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-gray-200)",
        borderRadius: "var(--crm-radius-md)",
        padding: "var(--crm-card-padding)",
        cursor: "pointer",
        boxShadow: isDragging ? "var(--crm-shadow-md)" : undefined,
        transform: isDragging ? "rotate(1deg)" : undefined,
        transition: "border-color var(--crm-duration-fast) var(--crm-ease), box-shadow var(--crm-duration-fast) var(--crm-ease)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--crm-space-2)",
      }}
      className="group hover:border-[color:var(--crm-gray-300)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            style={{
              fontSize: "var(--crm-text-base)",
              fontWeight: "var(--crm-weight-medium)",
              color: "var(--crm-gray-900)",
              lineHeight: "var(--crm-leading-tight)",
            }}
            className="truncate"
          >
            {deal.title}
          </p>
          {deal.client && (
            <p
              style={{
                fontSize: "var(--crm-text-xs)",
                color: "var(--crm-gray-500)",
              }}
              className="mt-0.5 flex items-center gap-1 truncate"
            >
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{deal.client.name}</span>
            </p>
          )}
        </div>
        {slaBreach && (
          <span
            style={{
              fontSize: "var(--crm-text-xs)",
              color: "var(--crm-danger-fg)",
              background: "var(--crm-danger-bg)",
              padding: "2px 6px",
              borderRadius: "var(--crm-radius-sm)",
              fontWeight: "var(--crm-weight-medium)",
              border: "1px solid var(--crm-danger-border)",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
            title={`Estagio ha ${days}d (SLA: ${slaDays}d)`}
          >
            <AlertCircle className="h-3 w-3" />
            SLA
          </span>
        )}
      </div>

      {deal.value != null && deal.value > 0 && (
        <p
          style={{
            fontSize: "var(--crm-text-md)",
            fontWeight: "var(--crm-weight-medium)",
            color: "var(--crm-gray-900)",
            fontFamily: "var(--crm-font-mono)",
          }}
        >
          {fmtBRL(deal.value)}
        </p>
      )}

      {deal.tags && deal.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {deal.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              style={{
                fontSize: "var(--crm-text-xs)",
                color: "var(--crm-gray-600)",
                background: "var(--crm-gray-100)",
                padding: "1px 6px",
                borderRadius: "var(--crm-radius-sm)",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <div
        className="flex items-center justify-between"
        style={{ marginTop: 2 }}
      >
        <div className="flex items-center gap-1">
          {deal.owner ? (
            <div
              className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-medium"
              style={{
                background: "var(--crm-gray-200)",
                color: "var(--crm-gray-700)",
              }}
              title={deal.owner.name}
            >
              {deal.owner.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
            </div>
          ) : (
            <span style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-400)" }}>
              Sem owner
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {deal.last_stage_changed_at && (
            <span
              style={{
                fontSize: "var(--crm-text-xs)",
                color: slaBreach ? "var(--crm-danger-fg)" : "var(--crm-gray-500)",
                display: "inline-flex",
                alignItems: "center",
                gap: 2,
              }}
            >
              <Calendar className="h-3 w-3" />
              {days}d
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
