"use client"

/**
 * Primitivos visuais do Dashboard Operacional (design ago/2026).
 * Tema por tokens --ops-* (globals.css) — claro e grafite sem JS.
 */

import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

// ── Formatadores pt-BR ──────────────────────────────────────────────

export const fmtBRLCompact = (v: number): string => {
  if (!Number.isFinite(v)) return "—"
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2).replace(".", ",")}M`
  if (Math.abs(v) >= 1_000) return `R$ ${Math.round(v / 1_000)}K`
  return `R$ ${Math.round(v).toLocaleString("pt-BR")}`
}

export const fmtBRLFull = (v: number): string =>
  `R$ ${Math.round(v).toLocaleString("pt-BR")}`

export const fmtPct = (v: number | null | undefined, digits = 1): string =>
  v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(digits).replace(".", ",")}%`

export const fmtInt = (v: number): string => v.toLocaleString("pt-BR")

export const fmtCompactInt = (v: number): string => {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2).replace(".", ",")}M`
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)}K`
  return String(Math.round(v))
}

// ── Card base ───────────────────────────────────────────────────────

export function OpsCard({
  title,
  hint,
  right,
  children,
  noPad,
  className,
}: {
  title?: string
  hint?: string
  right?: ReactNode
  children: ReactNode
  noPad?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-[10px] border",
        "bg-[var(--ops-card)] border-[var(--ops-border)]",
        className,
      )}
    >
      {title && (
        <div className="flex items-center gap-2 px-5 pt-[17px]">
          <span className="text-[13px] font-semibold text-[var(--ops-title)]">{title}</span>
          {hint && <span className="text-[11px] text-[var(--ops-mut)]">{hint}</span>}
          <div className="flex-1" />
          {right}
        </div>
      )}
      <div className={cn("flex-1", noPad ? "" : cn("p-5", title && "pt-3.5"))}>{children}</div>
    </div>
  )
}

// ── KPI simples (linha Carteira) ────────────────────────────────────

export function OpsKpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: "neg" | "warn" | "pos"
}) {
  const toneClass =
    tone === "neg"
      ? "text-[var(--ops-neg)]"
      : tone === "warn"
        ? "text-[var(--ops-warn)]"
        : tone === "pos"
          ? "text-[var(--ops-pos)]"
          : "text-[var(--ops-title)]"
  return (
    <div className="rounded-[10px] border bg-[var(--ops-card)] border-[var(--ops-border)] px-[18px] py-[17px]">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--ops-sec)]">
        {label}
      </div>
      <div className={cn("mt-2 text-[21px] font-semibold leading-none tabular-nums tracking-[-0.01em]", toneClass)}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[11px] text-[var(--ops-mut)] tabular-nums">{sub}</div>}
    </div>
  )
}

// ── Título de seção ─────────────────────────────────────────────────

export function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-2 mt-1 -mb-1 px-0.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ops-sec)]">
        {title}
      </span>
      {hint && <span className="text-[11px] text-[var(--ops-mut)]">{hint}</span>}
    </div>
  )
}

// ── Célula de tabela (th/td do design) ──────────────────────────────

export function Th({ children, right }: { children?: ReactNode; right?: boolean }) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.05em]",
        "text-[var(--ops-sec)] border-b border-[var(--ops-border)]",
        right ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  right,
  last,
  className,
}: {
  children?: ReactNode
  right?: boolean
  last?: boolean
  className?: string
}) {
  return (
    <td
      className={cn(
        "px-4 py-2.5 text-[12.5px] text-[var(--ops-text)] tabular-nums",
        right ? "text-right" : "text-left",
        !last && "border-b border-[var(--ops-border)]",
        className,
      )}
    >
      {children}
    </td>
  )
}

// ── Estado "coletando dados" (nunca inventar números) ──────────────

export function CollectingState({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <span className="text-[12.5px] text-[var(--ops-sec)]">
        {label ?? "Coletando dados…"}
      </span>
      <span className="mt-1 text-[11px] text-[var(--ops-mut)]">
        A série diária começa a aparecer após as próximas sincronizações.
      </span>
    </div>
  )
}

// ── Delta chip (▲/▼ com sinal e cor) ────────────────────────────────

export function DeltaText({
  value,
  suffix = "%",
  invert,
  label,
}: {
  value: number | null | undefined
  /** "%" (relativo) ou " pp" (pontos percentuais) */
  suffix?: string
  /** true = queda é boa (unsub, bounce) */
  invert?: boolean
  label?: string
}) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-[10.5px] text-[var(--ops-mut)]">{label ?? "sem comparação"}</span>
  }
  const good = invert ? value <= 0 : value >= 0
  const arrow = value >= 0 ? "↑" : "↓"
  return (
    <span
      className={cn(
        "text-[10.5px] font-medium tabular-nums",
        good ? "text-[var(--ops-pos)]" : "text-[var(--ops-neg)]",
      )}
    >
      {arrow} {Math.abs(value).toFixed(1).replace(".", ",")}
      {suffix}
      {label ? ` ${label}` : ""}
    </span>
  )
}
