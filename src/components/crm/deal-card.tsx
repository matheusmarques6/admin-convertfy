"use client"

import { useMemo } from "react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import {
  ArrowRightLeft,
  Calendar,
  CalendarPlus,
  Check,
  CircleDollarSign,
  Clock,
  Flag,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Trash2,
  Trophy,
  X as XIcon,
} from "lucide-react"

// ─── Tipos ──────────────────────────────────────────────────────

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
  last_activity_type?:
    | "wa_message"
    | "call"
    | "email"
    | "meeting"
    | "note"
    | null
  activities_pending?: number | null
  contact_email?: string | null
  contact_phone?: string | null
  created_at?: string | null
  card_number?: number | null
  /** Proxima atividade pendente (calculada pela view ou via fetch). */
  next_step?: {
    label: string
    when: string
    tone?: "info" | "warn" | "neg" | "pos" | "neut"
  } | null
  /** Plano/segmento opcional (ex: "Performance · 12m"). */
  plan?: string | null
  /** Segmento opcional (ex: "Moda · Shopify"). Usa store.segment quando existir. */
  segment?: string | null
  /** Quando true, card recebe accent amber (atencao). */
  warn?: boolean
  /** Quando true, card recebe accent vermelho + badge Critico. */
  critical?: boolean
}

interface DealCardProps {
  deal: DealCardData
  slaHours?: number | null
  /** Cor do estagio (vinda do header). Acento sutil no card. */
  stageColor?: string
  onClick?: (id: string) => void
  onWin?: (id: string) => void
  onLose?: (id: string) => void
  onMove?: (id: string) => void
  onAddActivity?: (id: string) => void
  onDelete?: (id: string) => void
  isDragging?: boolean
}

// ─── Formatters ─────────────────────────────────────────────────

const fmtBRL = (v: number): string =>
  "R$ " +
  Number(v).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 86400000),
  )
}

function formatDateBR(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function avatarColorFromName(name: string): { bg: string; fg: string } {
  const palette: Array<{ bg: string; fg: string }> = [
    { bg: "#EEF0FB", fg: "#4E62D8" },
    { bg: "#ECFDF5", fg: "#065F46" },
    { bg: "#FFFBEB", fg: "#92400E" },
    { bg: "#F3E8FF", fg: "#7C3AED" },
    { bg: "#FEF2F2", fg: "#991B1B" },
    { bg: "#F3F4F6", fg: "#4B5563" },
  ]
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h + name.charCodeAt(i)) | 0
  }
  return palette[Math.abs(h) % palette.length]
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

// ─── Card V2 ────────────────────────────────────────────────────

export function DealCard({
  deal,
  slaHours,
  stageColor,
  onClick,
  onWin,
  onLose,
  onMove,
  onAddActivity,
  onDelete,
  isDragging,
}: DealCardProps) {
  const days = daysSince(deal.last_stage_changed_at)
  const slaDays = slaHours ? Math.ceil(slaHours / 24) : null
  const slaBreach = slaDays != null && days > slaDays

  // Critico se SLA breach > 2x o SLA OU prop critical explicita
  const isCritical = deal.critical || (slaDays != null && days > slaDays * 2)
  const isWarn = !isCritical && (deal.warn || slaBreach)

  const isWon = deal.status === "won"
  const isLost = deal.status === "lost"

  // Cor do edge esquerdo (accent)
  const accent = isCritical
    ? "var(--crm-neg)"
    : isWarn
      ? "var(--crm-amber)"
      : isWon
        ? "var(--crm-pos)"
        : null

  const leadName = deal.client?.name || deal.title
  const avatarColors = avatarColorFromName(leadName)
  const avatarInitials = getInitials(leadName)

  // Segmento da loja se disponivel
  const segment = deal.segment ?? deal.store?.name ?? null

  // Plano
  const plan = deal.plan ?? null

  // Next step
  const nextStep = useMemo<{
    label: string
    when: string
    tone: "info" | "warn" | "neg" | "pos" | "neut"
  } | null>(() => {
    if (deal.next_step) return { tone: "info", ...deal.next_step }
    // Fallback: derivado do estado
    if (isCritical) {
      return {
        label: "Sem resposta",
        when: `há ${days}d`,
        tone: "neg" as const,
      }
    }
    if (isWarn) {
      return {
        label: "Aguarda follow-up",
        when: `há ${days}d`,
        tone: "warn" as const,
      }
    }
    if (
      deal.activities_pending &&
      deal.activities_pending > 0
    ) {
      return {
        label: `${deal.activities_pending} atividade${deal.activities_pending > 1 ? "s" : ""} pendente${deal.activities_pending > 1 ? "s" : ""}`,
        when: "",
        tone: "info" as const,
      }
    }
    return null
  }, [deal.next_step, deal.activities_pending, days, isCritical, isWarn])

  // WhatsApp link
  const waLink = useMemo(() => {
    if (!deal.contact_phone) return null
    const digits = deal.contact_phone.replace(/\D/g, "")
    if (digits.length < 10) return null
    return `https://wa.me/${digits}`
  }, [deal.contact_phone])

  const mailtoLink = deal.contact_email
    ? `mailto:${deal.contact_email}`
    : null

  // Tone colors do next_step
  const toneStyles = {
    neg: {
      bg: "var(--crm-neg-bg)",
      fg: "var(--crm-neg)",
      border: "var(--crm-neg-border)",
      icon: Flag,
    },
    warn: {
      bg: "var(--crm-warn-bg)",
      fg: "var(--crm-warn)",
      border: "var(--crm-warn-border)",
      icon: Clock,
    },
    pos: {
      bg: "var(--crm-pos-bg)",
      fg: "var(--crm-pos)",
      border: "var(--crm-pos-border)",
      icon: Check,
    },
    info: {
      bg: "var(--crm-blue-50)",
      fg: "var(--crm-brand)",
      border: "var(--crm-blue-100)",
      icon: Calendar,
    },
    neut: {
      bg: "var(--crm-neut-bg)",
      fg: "var(--crm-neut)",
      border: "var(--crm-neut-border)",
      icon: Calendar,
    },
  }
  const NextStepIcon = nextStep ? toneStyles[nextStep.tone].icon : null

  return (
    <div
      onClick={() => onClick?.(deal.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && onClick) {
          e.preventDefault()
          onClick(deal.id)
        }
      }}
      className="cf-card cf-focusable relative cursor-pointer"
      style={{
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: "var(--crm-radius-xl)",
        padding: "14px 14px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        fontFamily: "var(--crm-font-sans)",
        boxShadow: isDragging
          ? "var(--crm-shadow-lg)"
          : undefined,
        transform: isDragging ? "rotate(0.6deg) scale(1.02)" : undefined,
      }}
    >
      {/* Accent edge esquerdo */}
      {accent && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            top: 10,
            bottom: 10,
            width: 3,
            background: accent,
            borderRadius: "0 2px 2px 0",
          }}
        />
      )}

      {/* ── Header: avatar + nome + #id + menu ── */}
      <div className="flex items-start gap-2.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{
            background: avatarColors.bg,
            color: avatarColors.fg,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            fontFamily: "var(--crm-font-sans)",
          }}
          aria-hidden
        >
          {avatarInitials || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-1.5">
            <span
              className="truncate"
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: "var(--crm-gray-900)",
                lineHeight: 1.3,
              }}
            >
              {leadName}
            </span>
            {deal.card_number != null && (
              <span
                className="crm-tnum shrink-0"
                style={{
                  fontSize: 11,
                  color: "var(--crm-gray-400)",
                }}
              >
                #{deal.card_number}
              </span>
            )}
          </div>
          {segment && (
            <div
              className="truncate"
              style={{
                fontSize: 11.5,
                color: "var(--crm-gray-500)",
                marginTop: 1,
              }}
            >
              {segment}
            </div>
          )}
        </div>
        {(onAddActivity || onMove || onWin || onLose || onDelete) && (
          <DealActionsMenu
            dealId={deal.id}
            onWin={onWin}
            onLose={onLose}
            onMove={onMove}
            onAddActivity={onAddActivity}
            onDelete={onDelete}
          />
        )}
      </div>

      {/* ── Info rows: owner · value · date · activity ── */}
      <div
        className="flex flex-col gap-1.5"
        style={{
          fontSize: 11.5,
          fontFamily: "var(--crm-font-sans)",
        }}
      >
        {/* Owner */}
        {deal.owner && (
          <div className="flex items-center gap-2">
            <OwnerAvatar name={deal.owner.name} size={18} />
            <span
              className="truncate"
              style={{ color: "var(--crm-gray-600)" }}
            >
              {deal.owner.name}
            </span>
          </div>
        )}
        {/* Value */}
        {deal.value != null && deal.value > 0 && (
          <div className="flex items-center gap-2">
            <span
              className="flex w-[18px] justify-center shrink-0"
              style={{ color: "var(--crm-gray-400)" }}
            >
              <CircleDollarSign className="h-3.5 w-3.5" />
            </span>
            <span
              className="crm-tnum"
              style={{
                color: "var(--crm-gray-900)",
                fontWeight: 600,
              }}
            >
              {fmtBRL(deal.value)}
              {plan ? (
                <span
                  style={{ color: "var(--crm-gray-500)", fontWeight: 400 }}
                >
                  /mês · {plan}
                </span>
              ) : (
                <span
                  style={{ color: "var(--crm-gray-500)", fontWeight: 400 }}
                >
                  /mês
                </span>
              )}
            </span>
          </div>
        )}
        {/* Created */}
        {(deal.created_at || days > 0) && (
          <div className="flex items-center gap-2">
            <span
              className="flex w-[18px] justify-center shrink-0"
              style={{ color: "var(--crm-gray-400)" }}
            >
              <Calendar className="h-3.5 w-3.5" />
            </span>
            <span className="crm-tnum" style={{ color: "var(--crm-gray-600)" }}>
              {formatDateBR(deal.created_at) ?? "—"}
              {days > 0 && (
                <span style={{ color: "var(--crm-gray-400)" }}>
                  {" "}
                  · há {days}d na etapa
                </span>
              )}
            </span>
          </div>
        )}
        {/* Next step (activity row) */}
        {nextStep && NextStepIcon && (
          <div
            className="flex items-center gap-1.5"
            style={{
              padding: "5px 8px",
              borderRadius: 6,
              background: toneStyles[nextStep.tone].bg,
              border: `1px solid ${toneStyles[nextStep.tone].border}`,
              color: toneStyles[nextStep.tone].fg,
              fontWeight: 500,
              marginLeft: -2,
              marginRight: -2,
            }}
          >
            <NextStepIcon className="h-3 w-3 shrink-0" />
            <span
              className="flex-1 truncate"
              style={{ fontSize: 11.5 }}
            >
              {nextStep.label}
            </span>
            {nextStep.when && (
              <span
                className="crm-tnum shrink-0"
                style={{ fontSize: 10, opacity: 0.85 }}
              >
                {nextStep.when}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Footer: source + critico + buttons ── */}
      <div
        className="flex items-center justify-between gap-1.5"
        style={{
          paddingTop: 10,
          borderTop: "1px solid var(--crm-gray-100)",
        }}
      >
        <div className="flex flex-wrap gap-1.5 min-w-0">
          {deal.source && (
            <Badge tone="info">{deal.source}</Badge>
          )}
          {isCritical && (
            <Badge tone="neg" dot>
              Crítico
            </Badge>
          )}
          {isWon && (
            <Badge tone="pos" dot>
              Ganho
            </Badge>
          )}
          {isLost && (
            <Badge tone="neg" dot>
              Perdido
            </Badge>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Abrir no WhatsApp"
              aria-label="Abrir no WhatsApp"
              className="flex h-[26px] w-[26px] items-center justify-center rounded-[6px]"
              style={{
                background: "var(--crm-gray-0)",
                border: "1px solid var(--crm-gray-200)",
                color: "#25D366",
              }}
            >
              <MessageSquare className="h-3 w-3" />
            </a>
          )}
          {mailtoLink && (
            <a
              href={mailtoLink}
              onClick={(e) => e.stopPropagation()}
              title="Enviar email"
              aria-label="Enviar email"
              className="flex h-[26px] w-[26px] items-center justify-center rounded-[6px]"
              style={{
                background: "var(--crm-gray-0)",
                border: "1px solid var(--crm-gray-200)",
                color: "var(--crm-gray-500)",
              }}
            >
              <Mail className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {/* Stage color visual hint no canto */}
      {stageColor && !accent && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 8,
            right: 28,
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: stageColor,
            opacity: 0.6,
          }}
        />
      )}
    </div>
  )
}

// ─── Owner avatar (component leve) ──────────────────────────────

function OwnerAvatar({ name, size = 18 }: { name: string; size?: number }) {
  const colors = avatarColorFromName(name)
  const initials = getInitials(name)
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: colors.bg,
        color: colors.fg,
        fontSize: Math.max(9, Math.round(size * 0.4)),
        fontWeight: 600,
        letterSpacing: "-0.01em",
      }}
      aria-hidden
    >
      {initials}
    </span>
  )
}

// ─── Badge (pill semantico) ─────────────────────────────────────

function Badge({
  tone,
  children,
  dot,
}: {
  tone: "info" | "neg" | "pos" | "warn" | "neut"
  children: React.ReactNode
  dot?: boolean
}) {
  const map = {
    info: {
      bg: "var(--crm-info-bg)",
      fg: "var(--crm-info)",
      b: "var(--crm-info-border)",
    },
    neg: {
      bg: "var(--crm-neg-bg)",
      fg: "var(--crm-neg)",
      b: "var(--crm-neg-border)",
    },
    pos: {
      bg: "var(--crm-pos-bg)",
      fg: "var(--crm-pos)",
      b: "var(--crm-pos-border)",
    },
    warn: {
      bg: "var(--crm-warn-bg)",
      fg: "var(--crm-warn)",
      b: "var(--crm-warn-border)",
    },
    neut: {
      bg: "var(--crm-neut-bg)",
      fg: "var(--crm-neut)",
      b: "var(--crm-neut-border)",
    },
  }
  const t = map[tone]
  return (
    <span
      className="inline-flex items-center gap-1 truncate"
      style={{
        padding: "1px 7px",
        borderRadius: 4,
        background: t.bg,
        border: `1px solid ${t.b}`,
        fontSize: 11,
        fontWeight: 500,
        color: t.fg,
        fontFamily: "var(--crm-font-sans)",
        maxWidth: 120,
      }}
    >
      {dot && (
        <span
          aria-hidden
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: t.fg,
            flexShrink: 0,
          }}
        />
      )}
      <span className="truncate">{children}</span>
    </span>
  )
}

// ─── Menu de acoes ⋯ ────────────────────────────────────────────

function DealActionsMenu({
  dealId,
  onWin,
  onLose,
  onMove,
  onAddActivity,
  onDelete,
}: {
  dealId: string
  onWin?: (id: string) => void
  onLose?: (id: string) => void
  onMove?: (id: string) => void
  onAddActivity?: (id: string) => void
  onDelete?: (id: string) => void
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          aria-label="Ações do deal"
          title="Ações do negócio"
          className="flex shrink-0 items-center justify-center rounded-[4px] transition-colors"
          style={{
            width: 22,
            height: 22,
            background: "transparent",
            border: 0,
            color: "var(--crm-gray-400)",
          }}
          onMouseEnter={(e) => ((e.currentTarget.style.background = "var(--crm-gray-100)"))}
          onMouseLeave={(e) => ((e.currentTarget.style.background = "transparent"))}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          onClick={(e) => e.stopPropagation()}
          align="end"
          sideOffset={4}
          className="z-50 min-w-[220px] py-1 rounded-[6px]"
          style={{
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-border)",
            boxShadow: "var(--crm-shadow-lg)",
          }}
        >
          {onAddActivity && (
            <Item
              icon={<CalendarPlus className="h-3.5 w-3.5" />}
              title="Criar atividade"
              description="Nota, tarefa ou ligação"
              onClick={() => onAddActivity(dealId)}
            />
          )}
          {onMove && (
            <Item
              icon={<ArrowRightLeft className="h-3.5 w-3.5" />}
              title="Mover negócio"
              description="Mover para outra etapa"
              onClick={() => onMove(dealId)}
            />
          )}
          {(onAddActivity || onMove) && (onWin || onLose) && (
            <DropdownMenu.Separator
              className="h-px my-1"
              style={{ background: "var(--crm-gray-100)" }}
            />
          )}
          {onWin && (
            <Item
              icon={<Trophy className="h-3.5 w-3.5" />}
              title="Ganhar negócio"
              description="Move para Ganho"
              tone="success"
              onClick={() => onWin(dealId)}
            />
          )}
          {onLose && (
            <Item
              icon={<XIcon className="h-3.5 w-3.5" />}
              title="Perder negócio"
              description="Pede razão da perda"
              tone="danger"
              onClick={() => onLose(dealId)}
            />
          )}
          {onDelete && (
            <>
              <DropdownMenu.Separator
                className="h-px my-1"
                style={{ background: "var(--crm-gray-100)" }}
              />
              <Item
                icon={<Trash2 className="h-3.5 w-3.5" />}
                title="Excluir"
                description="Remove definitivamente"
                tone="danger"
                onClick={() => onDelete(dealId)}
              />
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function Item({
  icon,
  title,
  description,
  tone,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  description: string
  tone?: "success" | "danger"
  onClick: () => void
}) {
  const color =
    tone === "success"
      ? "var(--crm-pos)"
      : tone === "danger"
        ? "var(--crm-neg)"
        : "var(--crm-gray-700)"
  return (
    <DropdownMenu.Item
      onSelect={onClick}
      className="flex cursor-pointer items-start gap-2.5 rounded-[4px] mx-1 px-2 py-2 outline-none data-[highlighted]:bg-slate-50"
    >
      <span className="shrink-0 mt-0.5" style={{ color }}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div
          style={{ fontSize: 12, fontWeight: 500, color, lineHeight: 1.2 }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--crm-gray-500)",
            marginTop: 2,
            lineHeight: 1.2,
          }}
        >
          {description}
        </div>
      </div>
    </DropdownMenu.Item>
  )
}
