"use client"

/**
 * Card do kanban de Onboarding (versao final - PRD).
 *
 * Inspirado em DealCard (CRM). Densidade alta, brand preto, sem sombras
 * grandes. Conteudo completo:
 *  - Avatar inicial colorido por hash do nome
 *  - Nome da loja + version badge + SLA breach badge
 *  - Cliente · vertical
 *  - Responsavel atual (assignee da task corrente, role)
 *  - MRR + status pagamento
 *  - Status contrato
 *  - WhatsApp parcialmente mascarado
 *  - Tempo na coluna + SLA bar gradiente
 *  - 3-dots menu com 6 acoes (ver, editar, forcar avanco, pedir ajustes,
 *    arquivar, copiar link form)
 *  - Footer com indicadores rapidos (briefing, pagto vencido, contrato exp)
 *
 * NAO reusa TaskCard porque onboarding tem campos distintos.
 */

import { useMemo, useState } from "react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import {
  AlertTriangle,
  Clock,
  Sparkles,
  CheckCircle2,
  MessageSquare,
  CreditCard,
  FileText,
  RotateCw,
  MoreHorizontal,
  Eye,
  Pencil,
  ArrowRightLeft,
  RotateCcw,
  Archive,
  Copy,
  User as UserIcon,
} from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import type { OnboardingPipelineItem } from "@/types/onboarding-pipeline"

// ─── Formatters ─────────────────────────────────────────────────────────

function avatarColorFromName(name: string): { bg: string; fg: string } {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  const palette = [
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

function hoursBetween(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000
}

function dayLabel(days: number): string {
  if (days <= 0) return "hoje"
  if (days === 1) return "ontem"
  return `${days}d`
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v)

function maskPhone(phone: string): string {
  // Mantem +DDI + DDD + ultimos 2 digitos: "+55 31 9****-**67"
  const digits = phone.replace(/\D/g, "")
  if (digits.length < 10) return phone
  if (digits.length === 11) {
    return `+55 ${digits.slice(0, 2)} ${digits[2]}****-**${digits.slice(-2)}`
  }
  if (digits.length === 13) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits[4]}****-**${digits.slice(-2)}`
  }
  return `***${digits.slice(-4)}`
}

// ─── Props ──────────────────────────────────────────────────────────────

interface OnboardingCardProps {
  onb: OnboardingPipelineItem
  /** Cor do estagio (vinda da coluna pai). Acento na borda esquerda. */
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
  stageColor,
  isDragging,
  onView,
  onEdit,
  onForceAdvance,
  onRequestAdjustments,
  onArchive,
}: OnboardingCardProps) {
  const toast = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const clientName = onb.client?.name ?? "Cliente"
  const storeName = onb.store?.store_name ?? "Loja"
  const company = onb.client?.company ?? null
  const vertical = onb.vertical ?? null
  const platform = onb.store?.platform ?? null

  const avatarColors = useMemo(
    () => avatarColorFromName(clientName),
    [clientName],
  )
  const avatarInitial = useMemo(() => getInitials(clientName).slice(0, 1), [
    clientName,
  ])

  const accent = stageColor ?? avatarColors.fg
  const isAtRisk = onb.payment_status === "overdue" ||
    (typeof onb.briefing === "object" && onb.briefing && "error" in onb.briefing)

  const hoursIn = hoursBetween(onb.last_column_change_at)
  const daysIn = Math.floor(hoursIn / 24)
  const slaHours = onb.current_column?.sla_hours ?? 0
  const isStuck = slaHours > 0 && hoursIn >= slaHours
  const slaPct =
    slaHours > 0 ? Math.min(100, (hoursIn / slaHours) * 100) : 0
  const slaBarColor =
    slaPct >= 100
      ? "#EF4444"
      : slaPct >= 80
        ? "#F59E0B"
        : "#10B981"
  const slaDeadline = slaHours > 0
    ? new Date(new Date(onb.last_column_change_at).getTime() + slaHours * 3_600_000)
    : null

  // Briefing status visual
  const briefingPill = briefingPillFor(onb.briefing_status)

  // Indicadores rapidos no rodape
  const indicators: Array<{ key: string; icon: React.ReactNode; tone: "ok" | "warn" | "info" | "danger"; label: string }> = []
  if (onb.briefing_status === "approved") {
    indicators.push({
      key: "briefing-ok",
      icon: <Sparkles className="h-3 w-3" />,
      tone: "ok",
      label: "Briefing OK",
    })
  } else if (onb.briefing_status === "generating") {
    indicators.push({
      key: "briefing-gen",
      icon: <RotateCw className="h-3 w-3 animate-spin" />,
      tone: "info",
      label: "Gerando briefing",
    })
  } else if (onb.briefing_status === "generated_pending_review") {
    indicators.push({
      key: "briefing-review",
      icon: <Sparkles className="h-3 w-3" />,
      tone: "warn",
      label: "Cliente revisando",
    })
  }
  if (onb.payment_status === "overdue") {
    indicators.push({
      key: "pay-overdue",
      icon: <CreditCard className="h-3 w-3" />,
      tone: "danger",
      label: "Pagto vencido",
    })
  }
  if (onb.contract_status === "expiring") {
    indicators.push({
      key: "contract-exp",
      icon: <FileText className="h-3 w-3" />,
      tone: "warn",
      label: "Contrato expira",
    })
  }

  // Tasks da coluna atual (anchor task = primeira) - pra mostrar responsavel
  const firstTask = onb.tasks?.find(
    (t) => t.operational_column_id === onb.current_column_id,
  )

  function copyFormLink() {
    const origin =
      typeof window !== "undefined" ? window.location.origin : ""
    const url = `${origin}/form/${onb.form_token}`
    navigator.clipboard.writeText(url)
    toast.toast({ title: "Link copiado", description: url })
  }

  return (
    <div
      className={
        "group relative bg-white dark:bg-[#1A1D27] border " +
        (isAtRisk
          ? "border-rose-300 dark:border-rose-900/40"
          : "border-black/[0.06] dark:border-white/[0.08]") +
        " rounded-[6px] overflow-hidden hover:border-black/[0.16] dark:hover:border-white/[0.16] hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)] hover:-translate-y-px transition-all"
      }
      style={{
        boxShadow: isDragging
          ? "0 12px 32px rgba(15, 23, 42, 0.18)"
          : undefined,
        transform: isDragging ? "rotate(0.6deg) scale(1.02)" : undefined,
        borderLeft: `3px solid ${accent}`,
      }}
    >
      {/* Conteudo principal */}
      <div className="flex gap-2.5 p-3">
        {/* Avatar circular do cliente */}
        <div className="shrink-0">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full font-bold"
            style={{
              background: avatarColors.bg,
              color: avatarColors.fg,
              fontSize: 15,
              letterSpacing: "-0.02em",
            }}
            aria-hidden
          >
            {avatarInitial}
          </div>
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1 space-y-1">
          {/* Linha 1: store name + version + sla badge + 3-dots */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-[13px] font-semibold leading-tight text-slate-900 dark:text-white">
              {storeName}
            </h3>
            <div className="flex items-center gap-1 shrink-0">
              {onb.current_version > 1 && (
                <span
                  className="inline-flex items-center text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded-[3px] text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30"
                  title={`Versão ${onb.current_version}`}
                >
                  v{onb.current_version}
                </span>
              )}
              {isStuck && (
                <span
                  className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 rounded-[3px] bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                  title={`${daysIn}d na coluna · SLA ${Math.ceil(slaHours / 24)}d`}
                >
                  <AlertTriangle className="h-2.5 w-2.5" />
                  SLA
                </span>
              )}
              <CardActionsMenu
                open={menuOpen}
                onOpenChange={setMenuOpen}
                onView={onView ? () => onView(onb.id) : undefined}
                onEdit={onEdit ? () => onEdit(onb.id) : undefined}
                onForceAdvance={
                  onForceAdvance ? () => onForceAdvance(onb.id) : undefined
                }
                onRequestAdjustments={
                  onRequestAdjustments
                    ? () => onRequestAdjustments(onb.id)
                    : undefined
                }
                onArchive={onArchive ? () => onArchive(onb.id) : undefined}
                onCopyFormLink={copyFormLink}
              />
            </div>
          </div>

          {/* Linha 2: cliente · vertical · company */}
          <p className="truncate text-[11.5px] text-slate-600 dark:text-white/65">
            {clientName}
            {vertical && (
              <span className="text-slate-400 dark:text-white/40"> · {vertical}</span>
            )}
            {!vertical && company && (
              <span className="text-slate-400 dark:text-white/40"> · {company}</span>
            )}
          </p>

          {/* Linha 3: responsavel da task corrente */}
          {firstTask && (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-white/65">
              <UserIcon className="h-3 w-3 text-slate-400 shrink-0" />
              <span className="truncate">
                {firstTask.assignee_role ? (
                  <span className="font-mono uppercase tracking-wide text-[10px]">
                    {firstTask.assignee_role}
                  </span>
                ) : (
                  "Sem responsável"
                )}
              </span>
            </div>
          )}

          {/* Linha 4: MRR + plan + payment status */}
          {(onb.mrr_value || onb.plan) && (
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 min-w-0">
                <CreditCard className="h-3 w-3 text-slate-400 shrink-0" />
                <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
                  {onb.mrr_value ? fmtBRL(Number(onb.mrr_value)) : "—"}
                </span>
                {onb.plan && (
                  <span className="text-slate-500 dark:text-white/55 truncate">
                    · {onb.plan}
                  </span>
                )}
              </div>
              {onb.payment_status && onb.payment_status !== "pending" && (
                <StatusPill
                  label={onb.payment_status === "paid" ? "pago" : onb.payment_status === "overdue" ? "vencido" : "renovação"}
                  tone={
                    onb.payment_status === "paid"
                      ? "ok"
                      : onb.payment_status === "overdue"
                        ? "danger"
                        : "warn"
                  }
                />
              )}
            </div>
          )}

          {/* Linha 5: contrato status (so se nao default) */}
          {onb.contract_status && onb.contract_status !== "pending" && (
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 min-w-0">
                <FileText className="h-3 w-3 text-slate-400 shrink-0" />
                <span className="text-slate-700 dark:text-white/75 capitalize">
                  Contrato
                </span>
              </div>
              <StatusPill
                label={onb.contract_status.replaceAll("_", " ")}
                tone={
                  onb.contract_status === "signed"
                    ? "ok"
                    : onb.contract_status === "expiring"
                      ? "warn"
                      : "info"
                }
              />
            </div>
          )}

          {/* Linha 6: whatsapp parcial */}
          {onb.client_whatsapp && (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-white/65">
              <MessageSquare className="h-3 w-3 text-emerald-500 shrink-0" />
              <span className="font-mono tabular-nums">
                {maskPhone(onb.client_whatsapp)}
              </span>
            </div>
          )}

          {/* Linha 7: tempo na coluna + deadline SLA */}
          <div className="flex items-center justify-between gap-2 pt-1 text-[10.5px]">
            <div className="flex items-center gap-2 text-slate-500 dark:text-white/55">
              {platform && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-[3px] bg-slate-100 dark:bg-white/[0.06] font-mono uppercase text-[9.5px] tracking-wide">
                  {platform}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {dayLabel(daysIn)}
              </span>
            </div>
            {slaDeadline && (
              <span
                className={
                  "tabular-nums " +
                  (isStuck
                    ? "text-rose-600 dark:text-rose-400 font-semibold"
                    : "text-slate-400 dark:text-white/35")
                }
                title={slaDeadline.toISOString()}
              >
                {isStuck ? "Vencido " : "Vence "}
                {slaDeadline.toLocaleString("pt-BR", {
                  weekday: "short",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>

          {/* Briefing pill */}
          {briefingPill && (
            <div className="pt-1">{briefingPill}</div>
          )}
        </div>
      </div>

      {/* Barra de SLA + indicadores rapidos */}
      {slaHours > 0 && (
        <div
          className="h-[3px] w-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden"
          title={`SLA: ${Math.round(slaPct)}% de ${Math.ceil(slaHours / 24)}d`}
        >
          <div
            className="h-full transition-all"
            style={{ width: `${slaPct}%`, background: slaBarColor }}
          />
        </div>
      )}

      {indicators.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 bg-slate-50/60 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/[0.04]">
          {indicators.map((ind) => (
            <span
              key={ind.key}
              className={
                "inline-flex items-center gap-1 text-[10px] font-semibold " +
                (ind.tone === "ok"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : ind.tone === "warn"
                    ? "text-amber-600 dark:text-amber-400"
                    : ind.tone === "danger"
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-blue-600 dark:text-blue-400")
              }
            >
              {ind.icon}
              {ind.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── StatusPill ─────────────────────────────────────────────────────────

function StatusPill({
  label,
  tone,
  icon,
}: {
  label: string
  tone: "ok" | "warn" | "info" | "danger"
  icon?: React.ReactNode
}) {
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-500/20"
      : tone === "warn"
        ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 border-amber-200/60 dark:border-amber-500/20"
        : tone === "danger"
          ? "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400 border-rose-200/60 dark:border-rose-500/20"
          : "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400 border-blue-200/60 dark:border-blue-500/20"
  return (
    <span
      className={
        "inline-flex items-center gap-0.5 text-[9.5px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-[3px] capitalize border " +
        cls
      }
    >
      {icon}
      {label}
    </span>
  )
}

function briefingPillFor(status: string): React.ReactNode | null {
  if (status === "approved")
    return (
      <StatusPill
        label="briefing OK"
        tone="ok"
        icon={<CheckCircle2 className="h-2.5 w-2.5" />}
      />
    )
  if (status === "generated_pending_review")
    return (
      <StatusPill
        label="briefing pra revisar"
        tone="warn"
        icon={<MessageSquare className="h-2.5 w-2.5" />}
      />
    )
  if (status === "generating")
    return (
      <StatusPill
        label="gerando briefing"
        tone="info"
        icon={<RotateCw className="h-2.5 w-2.5 animate-spin" />}
      />
    )
  if (status === "form_partially_filled")
    return (
      <StatusPill
        label="form em andamento"
        tone="info"
      />
    )
  return null
}

// ─── 3-dots menu ────────────────────────────────────────────────────────

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
          className="flex h-6 w-6 items-center justify-center rounded-[4px] text-slate-400 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/80 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
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
          className="z-50 min-w-[220px] rounded-[6px] border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#1A1D27] shadow-[0_8px_24px_rgba(15,23,42,0.12)] py-1 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          {onView && (
            <MenuItem
              icon={<Eye className="h-3.5 w-3.5" />}
              title="Ver detalhes"
              onClick={onView}
            />
          )}
          <MenuItem
            icon={<Copy className="h-3.5 w-3.5" />}
            title="Copiar link do form"
            description="URL pra mandar ao cliente"
            onClick={onCopyFormLink}
          />
          {onEdit && (
            <MenuItem
              icon={<Pencil className="h-3.5 w-3.5" />}
              title="Editar onboarding"
              onClick={onEdit}
            />
          )}
          {(onForceAdvance || onRequestAdjustments) && (
            <DropdownMenu.Separator className="h-px bg-slate-100 dark:bg-white/[0.06] my-1" />
          )}
          {onForceAdvance && (
            <MenuItem
              icon={<ArrowRightLeft className="h-3.5 w-3.5" />}
              title="Forçar avanço"
              description="Pula validacoes pra proxima coluna"
              tone="warn"
              onClick={onForceAdvance}
            />
          )}
          {onRequestAdjustments && (
            <MenuItem
              icon={<RotateCcw className="h-3.5 w-3.5" />}
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
                icon={<Archive className="h-3.5 w-3.5" />}
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
      className="flex cursor-pointer items-start gap-2.5 rounded-[4px] mx-1 px-2 py-2 outline-none data-[highlighted]:bg-slate-50 dark:data-[highlighted]:bg-white/[0.04]"
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
