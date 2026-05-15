"use client"

import { useMemo } from "react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import {
  AlertCircle,
  Flame,
  MessageSquare,
  User as UserIcon,
  CalendarDays,
  Bell,
  DollarSign,
  Tag as TagIcon,
  MoreHorizontal,
  ArrowRightLeft,
  Trash2,
  Trophy,
  CalendarPlus,
  X as XIcon,
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
  contact_email?: string | null
  contact_phone?: string | null
  created_at?: string | null
  /** Numero sequencial do deal (#1, #2 etc) — exibido no canto. */
  card_number?: number | null
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

// ─── Formatters ───────────────────────────────────────────────────

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
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function avatarColorFromName(name: string): { bg: string; fg: string } {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  // Tons pasteis estilo DataCrazy
  const palette: Array<{ bg: string; fg: string }> = [
    { bg: "#FECACA", fg: "#991B1B" },
    { bg: "#FED7AA", fg: "#9A3412" },
    { bg: "#FEF3C7", fg: "#92400E" },
    { bg: "#BBF7D0", fg: "#166534" },
    { bg: "#A7F3D0", fg: "#065F46" },
    { bg: "#BFDBFE", fg: "#1E40AF" },
    { bg: "#C7D2FE", fg: "#3730A3" },
    { bg: "#DDD6FE", fg: "#5B21B6" },
    { bg: "#FBCFE8", fg: "#9D174D" },
    { bg: "#F5D0FE", fg: "#86198F" },
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

// Tags customizadas com cores semanticas
const TAG_PALETTE: Record<string, { bg: string; fg: string }> = {
  inbound: { bg: "#DCFCE7", fg: "#166534" },
  outbound: { bg: "#E2E8F0", fg: "#334155" },
  "projeto em andamento": { bg: "#FFEDD5", fg: "#9A3412" },
  "ads facebook": { bg: "#DBEAFE", fg: "#1E40AF" },
  "ads google": { bg: "#FEE2E2", fg: "#B91C1C" },
  "form site": { bg: "#D1FAE5", fg: "#065F46" },
  indicacao: { bg: "#A7F3D0", fg: "#047857" },
  "demo solicitada": { bg: "#EDE9FE", fg: "#6D28D9" },
  "black friday": { bg: "#0F172A", fg: "#F8FAFC" },
  renovacao: { bg: "#DCFCE7", fg: "#166534" },
  upsell: { bg: "#FFEDD5", fg: "#9A3412" },
  urgente: { bg: "#FEE2E2", fg: "#991B1B" },
}

function tagStyle(tag: string): { bg: string; fg: string } {
  return TAG_PALETTE[tag.toLowerCase()] ?? { bg: "#F1F5F9", fg: "#475569" }
}

// ─── Card principal ──────────────────────────────────────────────

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

  const isHot = (deal.ai_score ?? 0) >= 70
  const contactName = deal.client?.name || deal.title
  const avatarColors = avatarColorFromName(contactName)
  const avatarInitial = getInitials(contactName).slice(0, 1)

  const waLink = useMemo(() => {
    if (!deal.contact_phone) return null
    const digits = deal.contact_phone.replace(/\D/g, "")
    if (digits.length < 10) return null
    return `https://wa.me/${digits}`
  }, [deal.contact_phone])

  const createdLabel = formatDateBR(deal.created_at ?? null)
  const accent = stageColor ?? avatarColors.fg

  const ownerLabel = deal.owner?.name ?? null
  const productLabel = deal.source ?? null
  const visibleTag =
    deal.tags && deal.tags.length > 0
      ? deal.tags[0]
      : deal.status === "won"
        ? null
        : null

  const activitiesLabel =
    deal.activities_pending && deal.activities_pending > 0
      ? `${deal.activities_pending} atividade${deal.activities_pending > 1 ? "s" : ""}`
      : "Sem atividades"

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
      className="group relative bg-white dark:bg-[#1A1D27] border border-black/[0.06] dark:border-white/[0.08] rounded-[8px] cursor-pointer overflow-hidden hover:border-black/[0.16] dark:hover:border-white/[0.16] hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)] hover:-translate-y-px transition-all"
      style={{
        boxShadow: isDragging
          ? "0 12px 32px rgba(15, 23, 42, 0.18)"
          : undefined,
        transform: isDragging ? "rotate(0.6deg) scale(1.02)" : undefined,
        borderLeft: `3px solid ${accent}`,
      }}
    >
      {/* Conteudo principal: avatar esquerdo + info direita */}
      <div className="flex gap-3 p-3">
        {/* Avatar grande circular */}
        <div className="shrink-0">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full font-bold"
            style={{
              background: avatarColors.bg,
              color: avatarColors.fg,
              fontSize: 16,
              letterSpacing: "-0.02em",
            }}
            aria-hidden
          >
            {avatarInitial}
          </div>
        </div>

        {/* Info empilhada */}
        <div className="min-w-0 flex-1 space-y-1">
          {/* Linha 1: nome + #N + ⋯ */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {isHot && (
                <Flame
                  className="h-3 w-3 shrink-0 text-orange-500"
                  aria-label="Hot deal"
                />
              )}
              <span className="truncate font-semibold text-[14px] leading-tight text-slate-900 dark:text-white">
                {deal.title}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {deal.card_number != null && (
                <span className="text-[11px] font-medium text-slate-400 dark:text-white/40 tabular-nums">
                  #{deal.card_number}
                </span>
              )}
              {slaBreach && (
                <span
                  title={`${days}d na etapa · SLA ${slaDays}d`}
                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 rounded-[3px] bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                >
                  <AlertCircle className="h-2.5 w-2.5" />
                  {days}d
                </span>
              )}
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
          </div>

          {/* Linha 2: produto/fonte (link estilo DataCrazy) */}
          <div className="text-[12px]">
            {productLabel ? (
              <span className="text-slate-700 dark:text-white/75">
                {productLabel}
              </span>
            ) : (
              <span className="text-blue-600 dark:text-blue-400 underline-offset-2 hover:underline">
                Sem produto
              </span>
            )}
          </div>

          {/* Linha 3: atendente */}
          <MetaLine
            icon={<UserIcon className="h-3 w-3" />}
            placeholder="Sem atendente"
            value={ownerLabel}
          />

          {/* Linha 4: valor */}
          <MetaLine
            icon={<DollarSign className="h-3 w-3" />}
            placeholder="R$ 0,00"
            value={deal.value != null && deal.value > 0 ? fmtBRL(deal.value) : null}
            highlight
          />

          {/* Linha 5: data de criacao */}
          {createdLabel && (
            <MetaLine
              icon={<CalendarDays className="h-3 w-3" />}
              value={createdLabel}
            />
          )}

          {/* Linha 6: atividades */}
          <MetaLine
            icon={<Bell className="h-3 w-3" />}
            value={activitiesLabel}
            placeholder="Sem atividades"
            muted={!deal.activities_pending}
          />
        </div>
      </div>

      {/* Tag colorida no rodape (estilo DataCrazy) + WhatsApp */}
      {(visibleTag || waLink) && (
        <div className="flex items-center justify-between px-3 pb-3 -mt-1 gap-2">
          {visibleTag ? (
            <Tag label={visibleTag} />
          ) : (
            <span aria-hidden />
          )}

          <div className="flex items-center gap-1 shrink-0">
            {/* Indicador de ultima atividade */}
            {deal.last_activity_type === "wa_message" && (
              <MessageSquare
                className="h-3 w-3 text-emerald-500"
                aria-label="Ultima atividade: WhatsApp"
              />
            )}

            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                aria-label="Abrir no WhatsApp"
                title="Abrir no WhatsApp"
                className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
              >
                <MessageSquare className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MetaLine: linha de meta com icone ──────────────────────────

function MetaLine({
  icon,
  value,
  placeholder,
  highlight,
  muted,
}: {
  icon: React.ReactNode
  value?: string | null
  placeholder?: string
  highlight?: boolean
  muted?: boolean
}) {
  if (value) {
    return (
      <div className="flex items-center gap-1.5 text-[12px]">
        <span className="shrink-0 text-slate-400 dark:text-white/40">
          {icon}
        </span>
        <span
          className={
            highlight
              ? "font-semibold text-slate-900 dark:text-white tabular-nums truncate"
              : muted
                ? "text-slate-500 dark:text-white/50 truncate"
                : "text-slate-700 dark:text-white/75 truncate"
          }
        >
          {value}
        </span>
      </div>
    )
  }
  if (!placeholder) return null
  return (
    <div className="flex items-center gap-1.5 text-[12px]">
      <span className="shrink-0 text-slate-400 dark:text-white/40">{icon}</span>
      <span className="text-blue-600 dark:text-blue-400 underline-offset-2 hover:underline truncate">
        {placeholder}
      </span>
    </div>
  )
}

// ─── Tag: pill colorida ────────────────────────────────────────

function Tag({ label }: { label: string }) {
  const c = tagStyle(label)
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium truncate max-w-full"
      style={{ background: c.bg, color: c.fg }}
    >
      <TagIcon className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  )
}

// ─── Menu de acoes ⋯ ──────────────────────────────────────────

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
          aria-label="Acoes do deal (criar atividade, mover, ganhar, perder, excluir)"
          title="Ações do negócio"
          className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-slate-100/70 hover:bg-slate-200 dark:bg-white/[0.06] dark:hover:bg-white/[0.12] text-slate-600 hover:text-slate-900 dark:text-white/70 dark:hover:text-white transition-colors data-[state=open]:bg-slate-200 dark:data-[state=open]:bg-white/[0.12]"
        >
          <MoreHorizontal className="h-4 w-4" />
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
            <Item
              icon={<CalendarPlus className="h-3.5 w-3.5" />}
              title="Criar atividade"
              description="Nota, tarefa ou ligacao"
              onClick={() => onAddActivity(dealId)}
            />
          )}
          {onMove && (
            <Item
              icon={<ArrowRightLeft className="h-3.5 w-3.5" />}
              title="Mover negocio"
              description="Mover para outra etapa"
              onClick={() => onMove(dealId)}
            />
          )}
          {(onAddActivity || onMove) && (onWin || onLose) && (
            <DropdownMenu.Separator className="h-px bg-slate-100 dark:bg-white/[0.06] my-1" />
          )}
          {onWin && (
            <Item
              icon={<Trophy className="h-3.5 w-3.5" />}
              title="Ganhar negocio"
              description="Move para Ganho"
              tone="success"
              onClick={() => onWin(dealId)}
            />
          )}
          {onLose && (
            <Item
              icon={<XIcon className="h-3.5 w-3.5" />}
              title="Perder negocio"
              description="Pede razao da perda"
              tone="danger"
              onClick={() => onLose(dealId)}
            />
          )}
          {onDelete && (
            <>
              <DropdownMenu.Separator className="h-px bg-slate-100 dark:bg-white/[0.06] my-1" />
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
