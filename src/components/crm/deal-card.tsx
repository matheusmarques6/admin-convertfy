"use client"

import { useMemo } from "react"
import {
  AlertCircle,
  Flame,
  MessageSquare,
  Phone,
  Mail,
  Check,
  X as XIcon,
  Calendar as CalendarIcon,
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
  /** Cor do estagio (vinda do header). Usada como acento sutil no card. */
  stageColor?: string
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
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))
}

function formatDateBR(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

// Cor estavel a partir do nome — sempre mesma cor pra mesmo nome.
// Paleta DataCrazy-inspired: tons saturados mas sem chocar.
function avatarColorFromName(name: string): { bg: string; fg: string } {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  const palette: Array<{ bg: string; fg: string }> = [
    { bg: "#FECACA", fg: "#991B1B" }, // vermelho
    { bg: "#FED7AA", fg: "#9A3412" }, // laranja
    { bg: "#FDE68A", fg: "#92400E" }, // amarelo
    { bg: "#BBF7D0", fg: "#166534" }, // verde claro
    { bg: "#A7F3D0", fg: "#065F46" }, // verde
    { bg: "#BFDBFE", fg: "#1E40AF" }, // azul
    { bg: "#C7D2FE", fg: "#3730A3" }, // indigo
    { bg: "#DDD6FE", fg: "#5B21B6" }, // violeta
    { bg: "#FBCFE8", fg: "#9D174D" }, // pink
    { bg: "#F5D0FE", fg: "#86198F" }, // fucsia
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

// Paleta de tags em pílulas estilo DataCrazy.
const TAG_COLORS: Record<string, { bg: string; fg: string }> = {
  Inbound: { bg: "#DCFCE7", fg: "#166534" },
  Outbound: { bg: "#E2E8F0", fg: "#334155" },
  "Ads Facebook": { bg: "#DBEAFE", fg: "#1E40AF" },
  "Ads Google": { bg: "#FEE2E2", fg: "#B91C1C" },
  "Ads YouTube": { bg: "#FECACA", fg: "#991B1B" },
  "Ads TikTok": { bg: "#F1F5F9", fg: "#0F172A" },
  "Form site": { bg: "#D1FAE5", fg: "#065F46" },
  Indicacao: { bg: "#A7F3D0", fg: "#047857" },
  "Demo solicitada": { bg: "#EDE9FE", fg: "#6D28D9" },
  "Black Friday": { bg: "#0F172A", fg: "#F8FAFC" },
  Renovacao: { bg: "#DCFCE7", fg: "#166534" },
  Upsell: { bg: "#FFEDD5", fg: "#9A3412" },
  Urgente: { bg: "#FEE2E2", fg: "#991B1B" },
}

function tagStyle(tag: string): { bg: string; fg: string } {
  return TAG_COLORS[tag] || { bg: "#F1F5F9", fg: "#475569" }
}

function hexAlpha(hex: string, alpha: number): string {
  const m = hex.replace("#", "").match(/.{2}/g)
  if (!m || m.length !== 3) return hex
  const [r, g, b] = m.map((x) => parseInt(x, 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function DealCard({
  deal,
  slaHours,
  stageColor,
  onClick,
  onWin,
  onLose,
  isDragging,
}: DealCardProps) {
  const days = daysSince(deal.last_stage_changed_at)
  const slaDays = slaHours ? Math.ceil(slaHours / 24) : null
  const slaBreach = slaDays != null && days > slaDays
  const slaWarning = slaDays != null && !slaBreach && days >= Math.max(1, slaDays - 1)
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

  // Acento lateral esquerdo — usa cor do estagio quando disponivel, senao
  // a cor estavel do nome do contato (fallback do design original).
  const accent = stageColor ?? contactColors.fg

  return (
    <div
      onClick={() => onClick?.(deal.id)}
      style={{
        position: "relative",
        width: "100%",
        background: "#FFFFFF",
        border: "1px solid rgba(15, 23, 42, 0.06)",
        borderLeft: `3px solid ${accent}`,
        borderRadius: 6,
        padding: "10px 12px 12px",
        cursor: "pointer",
        boxShadow: isDragging
          ? "0 8px 24px rgba(15, 23, 42, 0.16)"
          : "0 1px 2px rgba(15, 23, 42, 0.04)",
        transform: isDragging ? "rotate(0.5deg) scale(1.02)" : undefined,
        transition: "box-shadow 150ms ease, transform 150ms ease, border-color 150ms ease",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        overflow: "hidden",
      }}
      className="group hover:border-[rgba(15,23,42,0.12)] hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)]"
    >
      {/* ── Header: avatar + titulo + acoes hover ── */}
      <div className="flex items-start gap-2.5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-semibold"
          style={{
            background: contactColors.bg,
            color: contactColors.fg,
            fontSize: 11,
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
                color: "#0F172A",
                lineHeight: 1.25,
              }}
            >
              {deal.title}
            </p>
          </div>
          <p
            className="truncate"
            style={{
              fontSize: 11,
              color: "#64748B",
              marginTop: 2,
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
      </div>

      {/* ── Valor em destaque (estilo DataCrazy) ── */}
      {deal.value != null && deal.value > 0 && (
        <div
          className="flex items-center justify-between"
          style={{
            background: hexAlpha(accent, 0.06),
            borderRadius: 4,
            padding: "6px 10px",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#64748B",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Valor
          </span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#0F172A",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {fmtBRL(deal.value)}
          </span>
        </div>
      )}

      {/* ── Tags coloridas ── */}
      {deal.tags && deal.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {deal.tags.slice(0, 3).map((t) => {
            const c = tagStyle(t)
            return (
              <span
                key={t}
                style={{
                  fontSize: 10,
                  color: c.fg,
                  background: c.bg,
                  padding: "2px 7px",
                  borderRadius: 999,
                  fontWeight: 500,
                  lineHeight: 1.4,
                  whiteSpace: "nowrap",
                }}
              >
                {t}
              </span>
            )
          })}
          {deal.tags.length > 3 && (
            <span
              style={{
                fontSize: 10,
                color: "#94A3B8",
                padding: "2px 4px",
                fontWeight: 500,
              }}
            >
              +{deal.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* ── Footer fixo: owner + meta + acoes ── */}
      <div
        className="flex items-center justify-between gap-2"
        style={{
          paddingTop: 8,
          borderTop: "1px solid rgba(15, 23, 42, 0.05)",
          marginTop: deal.tags && deal.tags.length > 0 ? 0 : 2,
        }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Owner avatar */}
          {deal.owner && ownerColors ? (
            deal.owner.avatar_url ? (
              // Avatar 18x18 — next/image exigiria configurar remotePatterns
              // pra todos os hosts possiveis (Supabase, Google, Gravatar).
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={deal.owner.avatar_url}
                alt={deal.owner.name}
                title={deal.owner.name}
                className="h-[18px] w-[18px] shrink-0 rounded-full object-cover"
                style={{ border: "1px solid rgba(15,23,42,0.08)" }}
              />
            ) : (
              <span
                title={deal.owner.name}
                className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full font-semibold"
                style={{
                  background: ownerColors.bg,
                  color: ownerColors.fg,
                  fontSize: 8,
                  letterSpacing: "0.02em",
                  border: "1px solid rgba(15,23,42,0.04)",
                }}
              >
                {getInitials(deal.owner.name)}
              </span>
            )
          ) : (
            <span
              title="Sem owner"
              className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
              style={{
                background: "#F1F5F9",
                color: "#94A3B8",
                fontSize: 9,
                fontWeight: 600,
                border: "1px dashed #CBD5E1",
              }}
            >
              ?
            </span>
          )}

          {/* Data + dias na etapa */}
          <div className="flex items-center gap-1 min-w-0">
            {createdLabel && (
              <span
                className="inline-flex items-center gap-1 truncate"
                style={{ fontSize: 10, color: "#64748B" }}
              >
                <CalendarIcon className="h-2.5 w-2.5 shrink-0" />
                {createdLabel}
              </span>
            )}

            {deal.last_stage_changed_at != null && (
              <span
                title={`${days} dias na etapa atual${slaDays ? ` · SLA ${slaDays}d` : ""}`}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "1px 5px",
                  borderRadius: 3,
                  whiteSpace: "nowrap",
                  background: slaBreach
                    ? "#FEE2E2"
                    : slaWarning
                      ? "#FEF3C7"
                      : "#F1F5F9",
                  color: slaBreach
                    ? "#991B1B"
                    : slaWarning
                      ? "#92400E"
                      : "#475569",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                {slaBreach && <AlertCircle className="h-2.5 w-2.5" />}
                {days}d
              </span>
            )}
          </div>
        </div>

        {/* Atividade + WhatsApp */}
        <div className="flex items-center gap-1 shrink-0">
          {deal.activities_pending && deal.activities_pending > 0 ? (
            <span
              title={`${deal.activities_pending} atividade(s) pendente(s)`}
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: "#FFFFFF",
                background: "#DC2626",
                padding: "1px 5px",
                borderRadius: 999,
                lineHeight: 1.5,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {deal.activities_pending}
            </span>
          ) : null}

          {deal.last_activity_type === "call" && (
            <Phone
              className="h-3 w-3"
              style={{ color: "#94A3B8" }}
              aria-label="Ultima atividade: ligacao"
            />
          )}
          {deal.last_activity_type === "email" && (
            <Mail
              className="h-3 w-3"
              style={{ color: "#94A3B8" }}
              aria-label="Ultima atividade: email"
            />
          )}
          {deal.last_activity_type === "wa_message" && (
            <MessageSquare
              className="h-3 w-3"
              style={{ color: "#22C55E" }}
              aria-label="Ultima atividade: whatsapp"
            />
          )}

          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Abrir no WhatsApp"
              aria-label="Abrir no WhatsApp"
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
      </div>
    </div>
  )
}
