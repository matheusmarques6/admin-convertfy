"use client"

import { useMemo } from "react"
import {
  Building2,
  AlertCircle,
  Flame,
  MessageSquare,
  Phone,
  Mail,
  Check,
  X as XIcon,
  Calendar as CalendarIcon,
  Clock,
  DollarSign,
} from "lucide-react"

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
  ai_score?: number | null
  last_activity_type?: "wa_message" | "call" | "email" | "meeting" | "note" | null
  activities_pending?: number | null
  /** Email do contato (mostrado no header se nao tiver client) */
  contact_email?: string | null
  /** Phone E.164 — habilita botao WhatsApp */
  contact_phone?: string | null
  /** Data de criacao do deal — para "DD/MM" pequeno no card */
  created_at?: string | null
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
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(v)

function daysSince(iso: string | null): number {
  if (!iso) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))
}

function formatDateBR(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

// Cor estavel a partir do nome — sempre mesma cor pra mesmo nome.
function avatarColorFromName(name: string): { bg: string; fg: string } {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  const palette: Array<{ bg: string; fg: string }> = [
    { bg: "#FEE2E2", fg: "#B91C1C" },
    { bg: "#FED7AA", fg: "#C2410C" },
    { bg: "#FEF3C7", fg: "#854D0E" },
    { bg: "#D1FAE5", fg: "#047857" },
    { bg: "#A7F3D0", fg: "#065F46" },
    { bg: "#BFDBFE", fg: "#1D4ED8" },
    { bg: "#C7D2FE", fg: "#3730A3" },
    { bg: "#DDD6FE", fg: "#6D28D9" },
    { bg: "#FBCFE8", fg: "#BE185D" },
    { bg: "#F5D0FE", fg: "#A21CAF" },
  ]
  return palette[Math.abs(hash) % palette.length]
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
}

// Paleta de tags coloridas (semelhante ao DataCrazy)
const TAG_COLORS: Record<string, { bg: string; fg: string }> = {
  Inbound: { bg: "#DCFCE7", fg: "#166534" },
  Outbound: { bg: "#E5E7EB", fg: "#374151" },
  "Ads Facebook": { bg: "#DBEAFE", fg: "#1E40AF" },
  "Ads Google": { bg: "#FEE2E2", fg: "#B91C1C" },
  "Ads YouTube": { bg: "#FECACA", fg: "#991B1B" },
  "Ads TikTok": { bg: "#F3F4F6", fg: "#111827" },
  "Form site": { bg: "#D1FAE5", fg: "#065F46" },
  Indicacao: { bg: "#A7F3D0", fg: "#047857" },
  "Demo solicitada": { bg: "#EDE9FE", fg: "#6D28D9" },
  "Black Friday": { bg: "#1F2937", fg: "#F9FAFB" },
  Renovacao: { bg: "#DCFCE7", fg: "#166534" },
  Upsell: { bg: "#FFEDD5", fg: "#C2410C" },
  Urgente: { bg: "#FEE2E2", fg: "#B91C1C" },
}

function tagStyle(tag: string): { bg: string; fg: string } {
  return TAG_COLORS[tag] || { bg: "#F3F4F6", fg: "#374151" }
}

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
  const contactColors = avatarColorFromName(deal.title)
  const contactInitials = getInitials(deal.title)

  // WhatsApp link (E.164 sem +, fallback aceita "+55..." ou raw digits)
  const waLink = useMemo(() => {
    if (!deal.contact_phone) return null
    const digits = deal.contact_phone.replace(/\D/g, "")
    if (digits.length < 10) return null
    return `https://wa.me/${digits}`
  }, [deal.contact_phone])

  const createdLabel = formatDateBR(deal.created_at ?? null)
  const activitiesLabel =
    deal.activities_pending && deal.activities_pending > 0
      ? `${deal.activities_pending} atividade${deal.activities_pending > 1 ? "s" : ""}`
      : "Sem atividades"

  return (
    <div
      onClick={() => onClick?.(deal.id)}
      style={{
        position: "relative",
        width: "100%",
        background: "#FFFFFF",
        border: "1px solid rgba(0,0,0,0.06)",
        borderRadius: 8,
        padding: 12,
        cursor: "pointer",
        boxShadow: isDragging
          ? "0 8px 24px rgba(0,0,0,0.12)"
          : "0 1px 2px rgba(0,0,0,0.04)",
        transform: isDragging ? "rotate(0.5deg)" : undefined,
        transition: "box-shadow 150ms ease, transform 150ms ease, border-color 150ms ease",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        overflow: "hidden",
      }}
      className="group hover:border-[rgba(0,0,0,0.12)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
    >
      {/* Header: avatar + nome + acoes */}
      <div className="flex items-start gap-2.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-semibold"
          style={{
            background: contactColors.bg,
            color: contactColors.fg,
            fontSize: 12,
            letterSpacing: "0.02em",
          }}
        >
          {contactInitials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            {isHot && (
              <Flame
                className="h-3 w-3 shrink-0"
                style={{ color: "#F97316" }}
                aria-label="Hot deal"
              />
            )}
            <p
              className="truncate"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#111827",
                lineHeight: 1.3,
              }}
            >
              {deal.title}
            </p>
          </div>
          <p
            className="truncate"
            style={{
              fontSize: 11,
              color: "#9CA3AF",
              marginTop: 1,
              fontStyle: deal.client ? "normal" : "italic",
            }}
          >
            {deal.client?.name || deal.contact_email || "Sem cliente"}
          </p>
        </div>

        {/* Hover quick actions (won / lost) */}
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
                  borderRadius: 4,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#DCFCE7",
                  color: "#166534",
                  border: "1px solid #86EFAC",
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
                  borderRadius: 4,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#FEE2E2",
                  color: "#991B1B",
                  border: "1px solid #FCA5A5",
                  cursor: "pointer",
                }}
              >
                <XIcon className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {!onWin && !onLose && slaBreach && (
          <span
            style={{
              fontSize: 9,
              color: "#991B1B",
              background: "#FEE2E2",
              padding: "2px 5px",
              borderRadius: 3,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 2,
              flexShrink: 0,
            }}
            title={`Estagio ha ${days}d (SLA: ${slaDays}d)`}
          >
            <AlertCircle className="h-2.5 w-2.5" />
            +{days - (slaDays || 0)}d
          </span>
        )}
      </div>

      {/* Owner inline — avatar pequeno + nome */}
      {deal.owner && ownerColors && (
        <div className="flex items-center gap-1.5 -mt-1">
          {deal.owner.avatar_url ? (
            <img
              src={deal.owner.avatar_url}
              alt={deal.owner.name}
              className="h-4 w-4 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full font-semibold"
              style={{
                background: ownerColors.bg,
                color: ownerColors.fg,
                fontSize: 8,
              }}
            >
              {getInitials(deal.owner.name)}
            </span>
          )}
          <span
            className="truncate"
            style={{ fontSize: 11, color: "#6B7280" }}
          >
            {deal.owner.name}
          </span>
        </div>
      )}

      {/* Linhas de meta com icones */}
      <div className="space-y-1">
        {deal.value != null && deal.value > 0 && (
          <div className="flex items-center gap-1.5">
            <DollarSign
              className="h-3 w-3 shrink-0"
              style={{ color: "#9CA3AF" }}
            />
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#0F766E",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtBRL(deal.value)}
            </span>
          </div>
        )}

        {createdLabel && (
          <div className="flex items-center gap-1.5">
            <CalendarIcon
              className="h-3 w-3 shrink-0"
              style={{ color: "#9CA3AF" }}
            />
            <span style={{ fontSize: 11, color: "#6B7280" }}>{createdLabel}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3 shrink-0" style={{ color: "#9CA3AF" }} />
          <span
            style={{
              fontSize: 11,
              color: slaBreach ? "#B91C1C" : "#6B7280",
              fontWeight: slaBreach ? 600 : 400,
            }}
          >
            {activitiesLabel}
            {deal.last_stage_changed_at && (
              <span style={{ color: "#D1D5DB" }}> · {days}d na etapa</span>
            )}
          </span>
        </div>
      </div>

      {/* Tags coloridas */}
      {deal.tags && deal.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {deal.tags.slice(0, 4).map((t) => {
            const c = tagStyle(t)
            return (
              <span
                key={t}
                style={{
                  fontSize: 10,
                  color: c.fg,
                  background: c.bg,
                  padding: "1px 6px",
                  borderRadius: 3,
                  fontWeight: 500,
                  lineHeight: 1.5,
                }}
              >
                {t}
              </span>
            )
          })}
          {deal.tags.length > 4 && (
            <span
              style={{
                fontSize: 10,
                color: "#9CA3AF",
                padding: "1px 4px",
              }}
            >
              +{deal.tags.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Footer: WhatsApp / activity icon */}
      {(waLink || deal.last_activity_type) && (
        <div
          className="flex items-center justify-between pt-2"
          style={{ borderTop: "1px dashed rgba(0,0,0,0.06)" }}
        >
          <div className="flex items-center gap-1">
            {deal.last_activity_type === "call" && (
              <Phone className="h-3 w-3" style={{ color: "#9CA3AF" }} />
            )}
            {deal.last_activity_type === "email" && (
              <Mail className="h-3 w-3" style={{ color: "#9CA3AF" }} />
            )}
            {deal.last_activity_type === "wa_message" && (
              <MessageSquare className="h-3 w-3" style={{ color: "#22C55E" }} />
            )}
          </div>
          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Abrir no WhatsApp"
              style={{
                width: 22,
                height: 22,
                borderRadius: 4,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#25D366",
                color: "#FFFFFF",
                transition: "transform 150ms",
              }}
              className="hover:scale-110"
            >
              <MessageSquare className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  )
}
