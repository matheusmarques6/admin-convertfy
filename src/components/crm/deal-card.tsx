"use client"

import { useMemo } from "react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import {
  AlertCircle,
  Flame,
  MessageSquare,
  Phone,
  Mail,
  X as XIcon,
  Calendar as CalendarIcon,
  MoreHorizontal,
  ArrowRightLeft,
  Trash2,
  Trophy,
  CalendarPlus,
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
  /** Posicao no funil (0-indexed) e total — usados pra renderizar
   *  o mini stepper no rodape. Quando undefined, stepper fica oculto. */
  stagePosition?: { current: number; total: number }
  onClick?: (id: string) => void
  onWin?: (id: string) => void
  onLose?: (id: string) => void
  /** Acoes extras do menu de contexto (DataCrazy-inspired). Quando
   *  fornecidas, o botao ⋯ no card abre dropdown rico com as 5+
   *  acoes principais. */
  onMove?: (id: string) => void
  onAddActivity?: (id: string) => void
  onDelete?: (id: string) => void
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
  stagePosition,
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
  const slaWarning = slaDays != null && !slaBreach && days >= Math.max(1, slaDays - 1)
  // % de tempo do SLA ja consumido (0-100). Vira a barra de progresso
  // fina no topo do card. Quando nao ha SLA, vira null e a barra some.
  const slaProgressPct = slaDays != null
    ? Math.min(100, Math.max(0, (days / slaDays) * 100))
    : null
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
      className="group bg-white dark:bg-[#1A1D27] border border-black/[0.06] dark:border-white/[0.06] hover:border-black/[0.12] dark:hover:border-white/[0.16] hover:shadow-[0_2px_8px_rgba(15,23,42,0.08)]"
    >
      {/* ── SLA progress bar — barra fina absoluta no topo ── */}
      {slaProgressPct != null && (
        <div
          className="absolute left-0 right-0 top-0 overflow-hidden"
          style={{ height: 2, borderRadius: "5px 5px 0 0" }}
          aria-hidden
          title={`${days}d / SLA ${slaDays}d`}
        >
          <div
            className="h-full transition-all"
            style={{
              width: `${slaProgressPct}%`,
              background: slaBreach
                ? "#DC2626"
                : slaWarning
                  ? "#D97706"
                  : "#10B981",
            }}
          />
        </div>
      )}

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
                className="h-3 w-3 shrink-0 text-orange-500"
                aria-label="Hot deal"
              />
            )}
            <p
              className="truncate text-slate-900 dark:text-white/90"
              style={{
                fontSize: 13,
                fontWeight: 600,
                lineHeight: 1.25,
              }}
            >
              {deal.title}
            </p>
          </div>
          <p
            className="truncate text-slate-500 dark:text-white/55"
            style={{
              fontSize: 11,
              marginTop: 2,
              fontStyle: deal.client ? "normal" : "italic",
            }}
          >
            {deal.client?.name || deal.contact_email || "Sem cliente"}
          </p>
        </div>

        {/* Menu de acoes (estilo DataCrazy): botao ⋯ que abre dropdown
            com Ganhar / Perder / Mover / Atividade / Excluir. Aparece
            sempre (nao so no hover) pra ser descobrivel. */}
        {(onWin || onLose || onMove || onAddActivity || onDelete) && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                aria-label="Acoes do deal"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-white/40 dark:hover:text-white/80 dark:hover:bg-white/[0.06] transition-colors"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                onClick={(e) => e.stopPropagation()}
                align="end"
                sideOffset={4}
                className="z-50 min-w-[220px] rounded-[6px] border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#1A1D27] shadow-[0_8px_24px_rgba(15,23,42,0.12)] py-1 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
              >
                {onAddActivity && (
                  <DealMenuItem
                    icon={<CalendarPlus className="h-3.5 w-3.5" />}
                    title="Criar atividade"
                    description="Adiciona nota, tarefa ou ligacao"
                    onClick={() => onAddActivity(deal.id)}
                  />
                )}
                {onMove && (
                  <DealMenuItem
                    icon={<ArrowRightLeft className="h-3.5 w-3.5" />}
                    title="Mover negocio"
                    description="Move para outra etapa"
                    onClick={() => onMove(deal.id)}
                  />
                )}
                {(onAddActivity || onMove) && (onWin || onLose) && (
                  <DropdownMenu.Separator className="h-px bg-slate-100 dark:bg-white/[0.06] my-1" />
                )}
                {onWin && (
                  <DealMenuItem
                    icon={<Trophy className="h-3.5 w-3.5" />}
                    title="Ganhar negocio"
                    description="Move para Ganho e fecha o deal"
                    tone="success"
                    onClick={() => onWin(deal.id)}
                  />
                )}
                {onLose && (
                  <DealMenuItem
                    icon={<XIcon className="h-3.5 w-3.5" />}
                    title="Perder negocio"
                    description="Pede razao da perda e arquiva"
                    tone="danger"
                    onClick={() => onLose(deal.id)}
                  />
                )}
                {onDelete && (
                  <>
                    <DropdownMenu.Separator className="h-px bg-slate-100 dark:bg-white/[0.06] my-1" />
                    <DealMenuItem
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      title="Excluir"
                      description="Remove o deal definitivamente"
                      tone="danger"
                      onClick={() => onDelete(deal.id)}
                    />
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>

      {/* ── Valor em destaque (estilo DataCrazy) ── */}
      {deal.value != null && deal.value > 0 && (
        <div
          className="flex items-center justify-between"
          style={{
            background: hexAlpha(accent, 0.10),
            borderRadius: 4,
            padding: "6px 10px",
          }}
        >
          <span
            className="text-slate-500 dark:text-white/55"
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Valor
          </span>
          <span
            className="text-slate-900 dark:text-white"
            style={{
              fontSize: 14,
              fontWeight: 700,
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
              className="text-slate-400 dark:text-white/40"
              style={{
                fontSize: 10,
                padding: "2px 4px",
                fontWeight: 500,
              }}
            >
              +{deal.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* ── Mini stepper: posicao no funil (DataCrazy-inspired) ── */}
      {stagePosition && stagePosition.total > 1 && (
        <div
          className="flex items-center gap-0.5"
          aria-label={`Etapa ${stagePosition.current + 1} de ${stagePosition.total}`}
          title={`Etapa ${stagePosition.current + 1} de ${stagePosition.total}`}
        >
          {Array.from({ length: stagePosition.total }).map((_, i) => {
            const isPast = i < stagePosition.current
            const isCurrent = i === stagePosition.current
            return (
              <div
                key={i}
                className="flex-1 rounded-full transition-colors"
                style={{
                  height: 3,
                  background:
                    isCurrent || isPast
                      ? accent
                      : "rgba(148, 163, 184, 0.20)",
                  opacity: isCurrent ? 1 : isPast ? 0.55 : 1,
                }}
              />
            )
          })}
        </div>
      )}

      {/* ── Footer fixo: owner + meta + acoes ── */}
      <div
        className="flex items-center justify-between gap-2 border-t border-black/5 dark:border-white/[0.06]"
        style={{
          paddingTop: 8,
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
              className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-white/[0.04] text-slate-400 dark:text-white/30 border border-dashed border-slate-300 dark:border-white/[0.12]"
              style={{
                fontSize: 9,
                fontWeight: 600,
              }}
            >
              ?
            </span>
          )}

          {/* Data + dias na etapa */}
          <div className="flex items-center gap-1 min-w-0">
            {createdLabel && (
              <span
                className="inline-flex items-center gap-1 truncate text-slate-500 dark:text-white/55"
                style={{ fontSize: 10 }}
              >
                <CalendarIcon className="h-2.5 w-2.5 shrink-0" />
                {createdLabel}
              </span>
            )}

            {deal.last_stage_changed_at != null && (
              <span
                title={`${days} dias na etapa atual${slaDays ? ` · SLA ${slaDays}d` : ""}`}
                className={
                  slaBreach
                    ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                    : slaWarning
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                      : "bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-white/60"
                }
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "1px 5px",
                  borderRadius: 3,
                  whiteSpace: "nowrap",
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
              className="h-3 w-3 text-slate-400 dark:text-white/40"
              aria-label="Ultima atividade: ligacao"
            />
          )}
          {deal.last_activity_type === "email" && (
            <Mail
              className="h-3 w-3 text-slate-400 dark:text-white/40"
              aria-label="Ultima atividade: email"
            />
          )}
          {deal.last_activity_type === "wa_message" && (
            <MessageSquare
              className="h-3 w-3 text-emerald-500"
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

// ── DealMenuItem ─────────────────────────────────────────────────
//
// Item do dropdown de acoes do card. Estilo DataCrazy: icone +
// titulo + descricao curta. Tons opcionais (success/danger) tingem
// o icone e o titulo.

function DealMenuItem({
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
  const toneClass =
    tone === "success"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "danger"
        ? "text-red-700 dark:text-red-400"
        : "text-slate-700 dark:text-white/80"

  return (
    <DropdownMenu.Item
      onSelect={onClick}
      className="flex cursor-pointer items-start gap-2.5 rounded-[4px] mx-1 px-2 py-2 outline-none data-[highlighted]:bg-slate-50 dark:data-[highlighted]:bg-white/[0.04]"
    >
      <span className={"shrink-0 mt-0.5 " + toneClass}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className={"text-[12px] font-medium leading-tight " + toneClass}>
          {title}
        </div>
        <div className="text-[10px] text-slate-500 dark:text-white/50 mt-0.5 leading-tight">
          {description}
        </div>
      </div>
    </DropdownMenu.Item>
  )
}
