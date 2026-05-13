"use client"

/**
 * Card do kanban de Onboarding.
 *
 * Inspirado em DealCard (CRM) — densidade alta, brand preto, sem sombras
 * grandes. Mostra: avatar do cliente, store, version badge, owner role,
 * pagamento/contrato status pills, dias-na-coluna, barra de SLA colorida,
 * indicadores de briefing/payment, atalho WhatsApp.
 *
 * NAO reusa TaskCard porque onboarding tem campos distintos (briefing,
 * versions, pagamento/contrato) e o ciclo de vida e diferente.
 */

import { useMemo } from "react"
import {
  AlertTriangle,
  Clock,
  Sparkles,
  CheckCircle2,
  MessageSquare,
  CreditCard,
  FileText,
  RotateCw,
} from "lucide-react"
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

// ─── Props ──────────────────────────────────────────────────────────────

interface OnboardingCardProps {
  onb: OnboardingPipelineItem
  /** Cor do estagio (vinda da coluna pai). Acento na borda esquerda. */
  stageColor?: string
  isDragging?: boolean
}

// ─── Card principal ──────────────────────────────────────────────────────

export function OnboardingCard({ onb, stageColor, isDragging }: OnboardingCardProps) {
  const clientName = onb.client?.name ?? "Cliente"
  const storeName = onb.store?.store_name ?? "Loja"
  const company = onb.client?.company ?? null
  const platform = onb.store?.platform ?? null

  const avatarColors = useMemo(
    () => avatarColorFromName(clientName),
    [clientName],
  )
  const avatarInitial = useMemo(() => getInitials(clientName).slice(0, 1), [
    clientName,
  ])

  const accent = stageColor ?? avatarColors.fg

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

  // Briefing status visual
  const briefingPill = briefingPillFor(onb.briefing_status)

  // Payment/contract pills (only show if not pending/default)
  const showPayment = onb.payment_status && onb.payment_status !== "pending"
  const showContract = onb.contract_status && onb.contract_status !== "pending"

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

  return (
    <div
      className="group relative bg-white dark:bg-[#1A1D27] border border-black/[0.06] dark:border-white/[0.08] rounded-[6px] overflow-hidden hover:border-black/[0.16] dark:hover:border-white/[0.16] hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)] transition-all"
      style={{
        boxShadow: isDragging
          ? "0 12px 32px rgba(15, 23, 42, 0.18)"
          : undefined,
        transform: isDragging ? "rotate(0.6deg) scale(1.02)" : undefined,
        borderLeft: `3px solid ${accent}`,
      }}
    >
      {/* Conteudo principal */}
      <div className="flex gap-2.5 p-2.5">
        {/* Avatar circular do cliente */}
        <div className="shrink-0">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full font-bold"
            style={{
              background: avatarColors.bg,
              color: avatarColors.fg,
              fontSize: 14,
              letterSpacing: "-0.02em",
            }}
            aria-hidden
          >
            {avatarInitial}
          </div>
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1 space-y-1">
          {/* Linha 1: store name + version + sla badge */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-[12.5px] font-semibold leading-tight text-slate-900 dark:text-white">
              {storeName}
            </h3>
            <div className="flex items-center gap-1 shrink-0">
              {onb.current_version > 1 && (
                <span
                  className="inline-flex items-center text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded-[3px] text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30"
                  title={`Versão ${onb.current_version} (cliente pediu ajustes em versões anteriores)`}
                >
                  v{onb.current_version}
                </span>
              )}
              {isStuck && (
                <span
                  className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 rounded-[3px] bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                  title={`${daysIn}d na coluna · SLA ${Math.ceil(slaHours / 24)}d`}
                >
                  <AlertTriangle className="h-2.5 w-2.5" />
                  SLA
                </span>
              )}
            </div>
          </div>

          {/* Linha 2: cliente (com company) */}
          <p className="truncate text-[11px] text-slate-600 dark:text-white/65">
            {clientName}
            {company && (
              <span className="text-slate-400 dark:text-white/40"> · {company}</span>
            )}
          </p>

          {/* Linha 3: meta (platform + tempo) */}
          <div className="flex items-center gap-2 text-[10.5px] text-slate-500 dark:text-white/55">
            {platform && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-[3px] bg-slate-100 dark:bg-white/[0.06] font-mono uppercase text-[9.5px] tracking-wide">
                {platform}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              {dayLabel(daysIn)}
              {slaHours > 0 && !isStuck && (
                <span className="text-slate-400 dark:text-white/35">
                  · {Math.round(slaPct)}%
                </span>
              )}
            </span>
          </div>

          {/* Linha 4: status pills (payment / contract) */}
          {(showPayment || showContract || briefingPill) && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {briefingPill}
              {showPayment && (
                <StatusPill
                  label={onb.payment_status.replaceAll("_", " ")}
                  tone={onb.payment_status === "paid" ? "ok" : onb.payment_status === "overdue" ? "danger" : "warn"}
                  icon={<CreditCard className="h-2.5 w-2.5" />}
                />
              )}
              {showContract && (
                <StatusPill
                  label={onb.contract_status.replaceAll("_", " ")}
                  tone={onb.contract_status === "signed" ? "ok" : onb.contract_status === "expiring" ? "warn" : "info"}
                  icon={<FileText className="h-2.5 w-2.5" />}
                />
              )}
            </div>
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
        <div className="flex flex-wrap items-center gap-1 px-2.5 py-1.5 bg-slate-50/60 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/[0.04]">
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
                      ? "text-red-600 dark:text-red-400"
                      : "text-violet-600 dark:text-violet-400")
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
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
      : tone === "warn"
        ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
        : tone === "danger"
          ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400"
          : "bg-slate-100 text-slate-700 dark:bg-white/[0.06] dark:text-white/65"
  return (
    <span
      className={
        "inline-flex items-center gap-0.5 text-[9.5px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-[3px] capitalize " +
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
        label="briefing ok"
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
  return null
}
