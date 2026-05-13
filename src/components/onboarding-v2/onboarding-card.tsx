"use client"

/**
 * OnboardingCard — versao DS v3 (store-cêntrico).
 *
 * Baseado no design canonical Convertfy DS v3 (h/tnEChylo4M0Fuos_UiRdsg).
 * Estruturalmente DISTINTO do DealCard (que e pessoa-cêntrico):
 *
 *   ┌─[ accent edge se bloqueado/em risco ]─┐
 *   │  [icon store] Nome da Loja      ⋯    │
 *   │  [Plano]  [Plataforma]                │
 *   │  Frase de status humana (ou flag erro)│
 *   │  Tarefas              N/M             │
 *   │  ▓▓▓▓░░░░ (barra fina 3px)            │
 *   │  ─────────────────────────            │
 *   │  [Resp]                  Xd · DD/MM   │
 *   └───────────────────────────────────────┘
 *
 * Sem MRR, sem payment status, sem WhatsApp visual — esses dados ficam
 * no detail panel (LeadDrawer-like). O card e PRIORIZACAO no kanban.
 */

import { useMemo, useState } from "react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import {
  Store,
  MoreHorizontal,
  Flag,
  Clock,
  Calendar,
  Eye,
  Pencil,
  ArrowRightLeft,
  RotateCcw,
  Archive,
  Copy,
} from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import type { OnboardingPipelineItem } from "@/types/onboarding-pipeline"

// ─── Helpers ────────────────────────────────────────────────────────────

function avatarColorFromName(name: string): { bg: string; fg: string } {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  const palette = [
    { bg: "#EEF0FB", fg: "#4E62D8" }, // brand
    { bg: "#ECFDF5", fg: "#065F46" }, // pos
    { bg: "#FFFBEB", fg: "#92400E" }, // warn
    { bg: "#F3E8FF", fg: "#7C3AED" }, // purple
    { bg: "#FEF2F2", fg: "#991B1B" }, // neg
    { bg: "#F3F4F6", fg: "#4B5563" }, // neut
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

function hoursBetween(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000
}

function fmtBR(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

const PLATFORM_LABEL: Record<string, string> = {
  klaviyo: "Klaviyo",
  omnisend: "Omnisend",
  mailchimp: "Mailchimp",
  activecampaign: "ActiveCampaign",
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  vtex: "VTEX",
  other: "Outro",
}

/** Converte briefing_status em frase humana (PT-BR direto). */
function briefingStatusSentence(
  status: string | undefined | null,
  hasFormResponses: boolean,
): { text: string; blocked: boolean } {
  if (status === "approved")
    return { text: "Briefing aprovado, indo pra design", blocked: false }
  if (status === "generated_pending_review")
    return { text: "Cliente revisando briefing", blocked: false }
  if (status === "generating")
    return { text: "Gerando briefing com IA…", blocked: false }
  if (status === "needs_review")
    return { text: "Briefing precisa de revisao", blocked: true }
  if (status === "form_partially_filled" || hasFormResponses)
    return { text: "Cliente preencheu o formulario", blocked: false }
  return { text: "Aguardando preenchimento do formulario", blocked: false }
}

// ─── Props ──────────────────────────────────────────────────────────────

interface OnboardingCardProps {
  onb: OnboardingPipelineItem
  /** Cor do estagio (vinda da coluna pai). Usado no dot/header da coluna. */
  stageColor?: string
  isDragging?: boolean
  onView?: (id: string) => void
  onEdit?: (id: string) => void
  onForceAdvance?: (id: string) => void
  onRequestAdjustments?: (id: string) => void
  onArchive?: (id: string) => void
}

// ─── Card principal ──────────────────────────────────────────────────────

export function OnboardingCard({
  onb,
  stageColor: _stageColor,
  isDragging,
  onView,
  onEdit,
  onForceAdvance,
  onRequestAdjustments,
  onArchive,
}: OnboardingCardProps) {
  void _stageColor // intencional: stage color usado no header da coluna, nao no card
  const toast = useToast()
  const [menuOpen, setMenuOpen] = useState(false)

  const storeName = onb.store?.store_name ?? "Loja"
  const platformRaw = (onb.store?.platform ?? "").toLowerCase()
  const platformLabel = PLATFORM_LABEL[platformRaw] ?? platformRaw

  // Frase de status humana
  const status = briefingStatusSentence(
    onb.briefing_status,
    !!onb.form_responses,
  )
  // Risco: SLA estourou, pagamento overdue, briefing com erro, ou status='needs_review'
  const hoursIn = hoursBetween(onb.last_column_change_at)
  const slaHours = onb.current_column?.sla_hours ?? 0
  const slaBreached = slaHours > 0 && hoursIn >= slaHours
  const slaPct = slaHours > 0 ? Math.min(100, (hoursIn / slaHours) * 100) : 0
  const briefingError =
    typeof onb.briefing === "object" &&
    onb.briefing &&
    "error" in onb.briefing
  const blocked = slaBreached || briefingError || status.blocked

  // Progresso: usa tasks da coluna atual (tasksInCurrent/total)
  const tasksInCurrent = (onb.tasks ?? []).filter(
    (t) => t.operational_column_id === onb.current_column_id,
  )
  const tasksTotal = tasksInCurrent.length
  const tasksDone = tasksInCurrent.filter((t) => t.status === "completed").length
  const pct = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0

  // Responsavel: primeiro assignee_role das tasks da coluna
  const firstTask = tasksInCurrent[0]
  const responsibleRole = firstTask?.assignee_role ?? null
  const avatarColors = useMemo(
    () => avatarColorFromName(responsibleRole ?? storeName),
    [responsibleRole, storeName],
  )
  const initials = getInitials(responsibleRole ?? storeName).slice(0, 2)

  const daysIn = Math.floor(hoursIn / 24)
  const enteredLabel = fmtBR(onb.entered_at ?? onb.created_at)

  // Plan tag + Platform tag
  const planTag = onb.plan ?? null
  const showPlatform = !!platformLabel && platformLabel !== "Outro"

  function copyFormLink() {
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    const url = `${origin}/form/${onb.form_token}`
    navigator.clipboard.writeText(url)
    toast.toast({ title: "Link copiado", description: url })
  }

  // Cor do edge esquerdo
  const accentColor = blocked ? "#991B1B" : slaBreached ? "#92400E" : null

  return (
    <div
      className="cf-card group relative bg-white dark:bg-[#1A1D27]"
      style={{
        position: "relative",
        borderRadius: 8,
        padding: accentColor ? "12px 12px 12px 16px" : "12px",
        cursor: "pointer",
        boxShadow: isDragging
          ? "0 12px 24px rgba(15, 23, 42, 0.12)"
          : undefined,
        transform: isDragging ? "rotate(0.4deg) scale(1.01)" : undefined,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {accentColor && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 8,
            bottom: 8,
            width: 3,
            background: accentColor,
            borderRadius: 0,
          }}
          aria-hidden
        />
      )}

      {/* Header: ícone store + nome + 3-dots */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="text-slate-500 dark:text-white/55 shrink-0"
            style={{ display: "inline-flex" }}
            aria-hidden
          >
            <Store className="h-[14px] w-[14px]" strokeWidth={2} />
          </span>
          <h3 className="text-[13px] font-semibold leading-tight text-slate-900 dark:text-white truncate">
            {storeName}
          </h3>
        </div>
        {onb.current_version > 1 && (
          <span
            className="cf-pill cf-warn shrink-0"
            style={{ padding: "1px 5px", fontSize: 9.5 }}
            title={`Versão ${onb.current_version}`}
          >
            v{onb.current_version}
          </span>
        )}
        <CardActionsMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          onView={onView ? () => onView(onb.id) : undefined}
          onEdit={onEdit ? () => onEdit(onb.id) : undefined}
          onForceAdvance={onForceAdvance ? () => onForceAdvance(onb.id) : undefined}
          onRequestAdjustments={
            onRequestAdjustments ? () => onRequestAdjustments(onb.id) : undefined
          }
          onArchive={onArchive ? () => onArchive(onb.id) : undefined}
          onCopyFormLink={copyFormLink}
        />
      </div>

      {/* Tag chips: plano + plataforma */}
      {(planTag || showPlatform) && (
        <div className="flex gap-1.5 flex-wrap">
          {planTag && (
            <span
              className="px-2 py-0.5 rounded text-[11px] font-medium bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-300"
              style={{ borderRadius: 4 }}
            >
              {planTag}
            </span>
          )}
          {showPlatform && (
            <span
              className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-white/65"
              style={{ borderRadius: 4 }}
            >
              {platformLabel}
            </span>
          )}
        </div>
      )}

      {/* Frase de status humana (com flag se bloqueado) */}
      <div
        className={
          "flex items-start gap-1.5 text-[12px] leading-snug " +
          (status.blocked || blocked
            ? "text-rose-700 dark:text-rose-400 font-medium"
            : "text-slate-700 dark:text-white/75")
        }
      >
        {(status.blocked || blocked) && (
          <span className="mt-0.5 shrink-0">
            <Flag className="h-3 w-3" strokeWidth={2} />
          </span>
        )}
        <span className="cf-anim-statusin">{status.text}</span>
      </div>

      {/* Progresso de tarefas */}
      {tasksTotal > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-slate-500 dark:text-white/55">
              Tarefas
            </span>
            <span
              className="text-[11px] font-medium text-slate-600 dark:text-white/65"
              style={{
                fontVariantNumeric: "tabular-nums lining-nums",
                fontFeatureSettings: '"tnum" 1, "lnum" 1',
              }}
            >
              {tasksDone}/{tasksTotal}
            </span>
          </div>
          <div
            className="bg-slate-100 dark:bg-white/[0.06] overflow-hidden"
            style={{ height: 3, borderRadius: 2 }}
          >
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                background: pct === 100 ? "#065F46" : "#4E62D8",
                borderRadius: 2,
                transition: "width 200ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />
          </div>
        </div>
      )}

      {/* SLA bar fina quando nao tem tasks pra progresso */}
      {tasksTotal === 0 && slaHours > 0 && (
        <div
          className="bg-slate-100 dark:bg-white/[0.06] overflow-hidden"
          style={{ height: 3, borderRadius: 2 }}
          title={`SLA: ${Math.round(slaPct)}% de ${Math.ceil(slaHours / 24)}d`}
        >
          <div
            style={{
              height: "100%",
              width: `${slaPct}%`,
              background:
                slaPct >= 100 ? "#991B1B" : slaPct >= 80 ? "#92400E" : "#065F46",
              borderRadius: 2,
            }}
          />
        </div>
      )}

      {/* Footer: responsavel + tempo + data entrada */}
      <div
        className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-white/[0.04]"
        style={{ marginTop: 2 }}
      >
        <div
          className="flex h-[22px] w-[22px] items-center justify-center rounded-full font-semibold"
          style={{
            background: avatarColors.bg,
            color: avatarColors.fg,
            fontSize: 9,
            letterSpacing: "-0.01em",
          }}
          title={responsibleRole ?? "Sem responsável"}
          aria-label={responsibleRole ?? "Sem responsável"}
        >
          {initials || "?"}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={
              "inline-flex items-center gap-0.5 text-[10px] " +
              (blocked
                ? "text-rose-600 dark:text-rose-400 font-semibold"
                : "text-slate-400 dark:text-white/40")
            }
            style={{
              fontVariantNumeric: "tabular-nums lining-nums",
              fontFeatureSettings: '"tnum" 1, "lnum" 1',
            }}
          >
            <Clock className="h-[11px] w-[11px]" strokeWidth={2} />
            {daysIn === 0 ? "hoje" : `${daysIn}d`}
          </span>
          <span
            className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 dark:text-white/40"
            style={{
              fontVariantNumeric: "tabular-nums lining-nums",
              fontFeatureSettings: '"tnum" 1, "lnum" 1',
            }}
          >
            <Calendar className="h-[11px] w-[11px]" strokeWidth={2} />
            {enteredLabel}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── 3-dots menu (reusa Radix DropdownMenu) ─────────────────────────────

function CardActionsMenu({
  open,
  onOpenChange,
  onView,
  onEdit,
  onForceAdvance,
  onRequestAdjustments,
  onArchive,
  onCopyFormLink,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onView?: () => void
  onEdit?: () => void
  onForceAdvance?: () => void
  onRequestAdjustments?: () => void
  onArchive?: () => void
  onCopyFormLink: () => void
}) {
  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          aria-label="Acoes do onboarding"
          className="cf-focusable flex h-6 w-6 items-center justify-center rounded text-slate-400 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/80 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors shrink-0"
        >
          <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          align="end"
          sideOffset={4}
          className="z-50 min-w-[220px] rounded-md border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#1A1D27] shadow-[0_8px_24px_rgba(15,23,42,0.12)] py-1"
        >
          {onView && (
            <MenuItem
              icon={<Eye className="h-3.5 w-3.5" strokeWidth={2} />}
              title="Ver detalhes"
              onClick={onView}
            />
          )}
          <MenuItem
            icon={<Copy className="h-3.5 w-3.5" strokeWidth={2} />}
            title="Copiar link do form"
            description="URL pra mandar ao cliente"
            onClick={onCopyFormLink}
          />
          {onEdit && (
            <MenuItem
              icon={<Pencil className="h-3.5 w-3.5" strokeWidth={2} />}
              title="Editar onboarding"
              onClick={onEdit}
            />
          )}
          {(onForceAdvance || onRequestAdjustments) && (
            <DropdownMenu.Separator className="h-px bg-slate-100 dark:bg-white/[0.06] my-1" />
          )}
          {onForceAdvance && (
            <MenuItem
              icon={<ArrowRightLeft className="h-3.5 w-3.5" strokeWidth={2} />}
              title="Forçar avanço"
              description="Pula validacoes pra proxima coluna"
              tone="warn"
              onClick={onForceAdvance}
            />
          )}
          {onRequestAdjustments && (
            <MenuItem
              icon={<RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />}
              title="Pedir ajustes"
              description="Volta uma coluna com feedback"
              tone="warn"
              onClick={onRequestAdjustments}
            />
          )}
          {onArchive && (
            <>
              <DropdownMenu.Separator className="h-px bg-slate-100 dark:bg-white/[0.06] my-1" />
              <MenuItem
                icon={<Archive className="h-3.5 w-3.5" strokeWidth={2} />}
                title="Arquivar"
                description="Soft delete (status=cancelled)"
                tone="danger"
                onClick={onArchive}
              />
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function MenuItem({
  icon,
  title,
  description,
  tone,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  description?: string
  tone?: "warn" | "danger"
  onClick: () => void
}) {
  const toneClass =
    tone === "warn"
      ? "text-amber-700 dark:text-amber-400"
      : tone === "danger"
        ? "text-rose-700 dark:text-rose-400"
        : "text-slate-700 dark:text-white/80"
  return (
    <DropdownMenu.Item
      onSelect={onClick}
      className="flex cursor-pointer items-start gap-2.5 rounded mx-1 px-2 py-2 outline-none data-[highlighted]:bg-slate-50 dark:data-[highlighted]:bg-white/[0.04]"
    >
      <span className={"shrink-0 mt-0.5 " + toneClass}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className={"text-[12px] font-medium leading-tight " + toneClass}>
          {title}
        </div>
        {description && (
          <div className="text-[10px] text-slate-500 dark:text-white/50 mt-0.5 leading-tight">
            {description}
          </div>
        )}
      </div>
    </DropdownMenu.Item>
  )
}
