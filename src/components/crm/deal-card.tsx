"use client"

import { Building2, AlertCircle, Flame, MessageSquare, Phone, Mail, MoreHorizontal, Check, X as XIcon, Sparkles } from "lucide-react"

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
  /**
   * Sinais opcionais que o backend pode preencher pra enriquecer o
   * card sem exigir nova request:
   * - ai_score: badge "Hot" quando >= 70
   * - last_activity_type: icone do canal do ultimo touchpoint
   * - activities_pending: contador de tasks/atividades em aberto
   */
  ai_score?: number | null
  last_activity_type?: "wa_message" | "call" | "email" | "meeting" | "note" | null
  activities_pending?: number | null
}

interface DealCardProps {
  deal: DealCardData
  slaHours?: number | null
  onClick?: (id: string) => void
  onWin?: (id: string) => void
  onLose?: (id: string) => void
  isDragging?: boolean
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v)

function daysSince(iso: string | null): number {
  if (!iso) return 0
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

// Cor estavel a partir do nome — avatares do mesmo owner sempre iguais.
function avatarColorFromName(name: string): { bg: string; fg: string } {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  const palette: Array<{ bg: string; fg: string }> = [
    { bg: "#DBEAFE", fg: "#1D4ED8" },
    { bg: "#DCFCE7", fg: "#047857" },
    { bg: "#FEE2E2", fg: "#B91C1C" },
    { bg: "#FEF3C7", fg: "#854D0E" },
    { bg: "#EDE9FE", fg: "#6D28D9" },
    { bg: "#FCE7F3", fg: "#BE185D" },
    { bg: "#CFFAFE", fg: "#0E7490" },
    { bg: "#FFEDD5", fg: "#C2410C" },
  ]
  return palette[Math.abs(hash) % palette.length]
}

const ACTIVITY_ICONS = {
  wa_message: MessageSquare,
  call: Phone,
  email: Mail,
  meeting: Building2,
  note: MoreHorizontal,
} as const

export function DealCard({
  deal,
  slaHours,
  onClick,
  onWin,
  onLose,
  isDragging,
}: DealCardProps) {
  const days = daysSince(deal.last_stage_changed_at)
  const slaDays = slaHours ? Math.ceil(slaHours / 24) : null
  const slaBreach = slaDays != null && days > slaDays
  const isHot = (deal.ai_score ?? 0) >= 70
  const ownerColors = deal.owner ? avatarColorFromName(deal.owner.name) : null

  // Cor da barra lateral: vermelho se SLA estourou, laranja se >= 80%, senao
  // gray. Indicacao visual passiva sem precisar olhar badge.
  const slaPct = slaDays ? days / slaDays : 0
  const stripColor = slaBreach
    ? "var(--crm-danger-fg)"
    : slaPct >= 0.8
      ? "var(--crm-warning-fg)"
      : isHot
        ? "var(--crm-success-fg)"
        : "transparent"

  const ActivityIcon = deal.last_activity_type
    ? ACTIVITY_ICONS[deal.last_activity_type]
    : null

  return (
    <div
      onClick={() => onClick?.(deal.id)}
      style={{
        position: "relative",
        width: "100%",
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-gray-200)",
        borderRadius: "var(--crm-radius-md)",
        padding: "10px 12px 10px 14px",
        cursor: "pointer",
        boxShadow: isDragging ? "var(--crm-shadow-md)" : undefined,
        transform: isDragging ? "rotate(1deg)" : undefined,
        transition:
          "border-color var(--crm-duration-fast) var(--crm-ease), box-shadow var(--crm-duration-fast) var(--crm-ease), transform var(--crm-duration-fast) var(--crm-ease)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        overflow: "hidden",
      }}
      className="group hover:border-[color:var(--crm-gray-300)] hover:shadow-[var(--crm-shadow-sm)]"
    >
      {/* Barra lateral colorida (SLA / hot) */}
      {stripColor !== "transparent" && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            background: stripColor,
          }}
        />
      )}

      {/* Linha 1: titulo + badges direita */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {isHot && (
              <Flame
                className="h-3 w-3 shrink-0"
                style={{ color: "var(--crm-success-fg)" }}
                aria-label="Hot deal"
              />
            )}
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
          </div>
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

        {/* Quick actions no hover (won/lost) */}
        {(onWin || onLose) && (
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {onWin && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onWin(deal.id)
                }}
                title="Marcar como ganho"
                aria-label="Marcar como ganho"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "var(--crm-radius-sm)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--crm-success-bg)",
                  color: "var(--crm-success-fg)",
                  border: "1px solid var(--crm-success-border)",
                  cursor: "pointer",
                }}
              >
                <Check className="h-3 w-3" />
              </button>
            )}
            {onLose && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onLose(deal.id)
                }}
                title="Marcar como perdido"
                aria-label="Marcar como perdido"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "var(--crm-radius-sm)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--crm-danger-bg)",
                  color: "var(--crm-danger-fg)",
                  border: "1px solid var(--crm-danger-border)",
                  cursor: "pointer",
                }}
              >
                <XIcon className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {/* SLA breach badge (sempre visivel quando estoura) */}
        {slaBreach && !((onWin || onLose) && false) && (
          <span
            className="group-hover:hidden"
            style={{
              fontSize: 10,
              color: "var(--crm-danger-fg)",
              background: "var(--crm-danger-bg)",
              padding: "2px 5px",
              borderRadius: "var(--crm-radius-sm)",
              fontWeight: "var(--crm-weight-medium)",
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              flexShrink: 0,
            }}
            title={`Estagio ha ${days}d (SLA: ${slaDays}d)`}
          >
            <AlertCircle className="h-3 w-3" />
            +{days - (slaDays || 0)}d
          </span>
        )}
      </div>

      {/* Linha 2: valor (destaque) */}
      {deal.value != null && deal.value > 0 && (
        <div className="flex items-baseline justify-between">
          <p
            style={{
              fontSize: "var(--crm-text-md)",
              fontWeight: "var(--crm-weight-medium)",
              color: "var(--crm-gray-900)",
              fontFamily: "var(--crm-font-mono)",
              lineHeight: 1.2,
            }}
          >
            {fmtBRL(deal.value)}
          </p>
          {deal.ai_score != null && deal.ai_score > 0 && (
            <span
              style={{
                fontSize: 10,
                color: isHot ? "var(--crm-success-fg)" : "var(--crm-gray-500)",
                display: "inline-flex",
                alignItems: "center",
                gap: 2,
                fontWeight: "var(--crm-weight-medium)",
              }}
              title="IA score"
            >
              <Sparkles className="h-3 w-3" />
              {deal.ai_score}
            </span>
          )}
        </div>
      )}

      {/* Linha 3: tags */}
      {deal.tags && deal.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {deal.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              style={{
                fontSize: 10,
                color: "var(--crm-gray-600)",
                background: "var(--crm-gray-100)",
                padding: "1px 6px",
                borderRadius: "var(--crm-radius-sm)",
                lineHeight: 1.4,
              }}
            >
              {t}
            </span>
          ))}
          {deal.tags.length > 3 && (
            <span
              style={{
                fontSize: 10,
                color: "var(--crm-gray-500)",
                padding: "1px 4px",
              }}
            >
              +{deal.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Linha 4 (footer): owner avatar + ultima atividade + days */}
      <div
        className="flex items-center justify-between"
        style={{ marginTop: 2 }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {deal.owner ? (
            deal.owner.avatar_url ? (
              <img
                src={deal.owner.avatar_url}
                alt={deal.owner.name}
                className="h-5 w-5 shrink-0 rounded-full object-cover"
                title={deal.owner.name}
              />
            ) : (
              <div
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-medium"
                style={{
                  background: ownerColors!.bg,
                  color: ownerColors!.fg,
                }}
                title={deal.owner.name}
              >
                {deal.owner.name
                  .split(" ")
                  .map((s) => s[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </div>
            )
          ) : (
            <span
              style={{ fontSize: 10, color: "var(--crm-gray-400)" }}
            >
              Sem owner
            </span>
          )}
          {/* Activities pending bubble */}
          {deal.activities_pending != null && deal.activities_pending > 0 && (
            <span
              style={{
                fontSize: 9,
                color: "var(--crm-warning-fg)",
                background: "var(--crm-warning-bg)",
                border: "1px solid var(--crm-warning-border)",
                padding: "0px 5px",
                borderRadius: "var(--crm-radius-full)",
                fontWeight: "var(--crm-weight-medium)",
                fontFamily: "var(--crm-font-mono)",
              }}
              title={`${deal.activities_pending} atividade(s) pendente(s)`}
            >
              {deal.activities_pending}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {ActivityIcon && (
            <ActivityIcon
              className="h-3 w-3"
              style={{ color: "var(--crm-gray-400)" }}
            />
          )}
          {deal.last_stage_changed_at && (
            <span
              style={{
                fontSize: 10,
                color: slaBreach
                  ? "var(--crm-danger-fg)"
                  : "var(--crm-gray-500)",
                fontFamily: "var(--crm-font-mono)",
                fontWeight: slaBreach ? "var(--crm-weight-medium)" : "var(--crm-weight-regular)",
              }}
            >
              {days}d
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
