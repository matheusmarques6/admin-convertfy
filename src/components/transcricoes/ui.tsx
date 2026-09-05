"use client"

/**
 * Átomos do módulo Transcrições. Herdados do shell (tokens --ops-*), sem
 * linguagem visual nova: card, chip, botão e tabela são os mesmos do resto
 * do admin, claro e escuro sem JS.
 */

import type { CSSProperties, ReactNode } from "react"
import { AlertTriangle, Instagram, Music2, Upload, Youtube, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { PLATAFORMA_LABEL, type Plataforma } from "@/lib/transcricoes/types"

/** Numeral tabular: coluna de tempo e contador não podem dançar. */
export const TNUM: CSSProperties = { fontVariantNumeric: "tabular-nums" }

export const CORES_LOCUTOR = ["#2563EB", "#7C3AED", "#C2410C", "#047857", "#B91C1C", "#0E7490"] as const

export function corLocutor(i: number): string {
  return CORES_LOCUTOR[((i % CORES_LOCUTOR.length) + CORES_LOCUTOR.length) % CORES_LOCUTOR.length]
}

// ── Plataforma ──────────────────────────────────────────────────────────

const ICONE_PLATAFORMA: Record<Plataforma, LucideIcon> = {
  youtube: Youtube,
  instagram: Instagram,
  tiktok: Music2,
  upload: Upload,
}

/** Cor da marca só onde ela existe; upload é neutro. */
const COR_PLATAFORMA: Record<Plataforma, string> = {
  youtube: "#FF0000",
  instagram: "#C13584",
  tiktok: "#111111",
  upload: "var(--ops-sec)",
}

export function ChipPlataforma({ p, className }: { p: Plataforma; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-[10.5px] font-semibold text-white backdrop-blur-sm",
        className,
      )}
    >
      <span style={{ color: p === "upload" ? "#fff" : COR_PLATAFORMA[p] }} className="flex">
        <Icon icon={ICONE_PLATAFORMA[p]} customSize={11} />
      </span>
      {PLATAFORMA_LABEL[p]}
    </span>
  )
}

export function IconePlataforma({ p, size = 13 }: { p: Plataforma; size?: number }) {
  return (
    <span style={{ color: COR_PLATAFORMA[p] }} className="flex shrink-0">
      <Icon icon={ICONE_PLATAFORMA[p]} customSize={size} />
    </span>
  )
}

// ── Blocos visuais ──────────────────────────────────────────────────────

export function TrCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)]", className)}>
      {children}
    </div>
  )
}

export function TrLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--ops-sec)]", className)}>
      {children}
    </div>
  )
}

export function TrSkel({ h = 14, w = "100%", r = 6, className }: { h?: number; w?: number | string; r?: number; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse bg-[var(--ops-track)]", className)}
      style={{ height: h, width: w, borderRadius: r }}
    />
  )
}

export function TrEmpty({
  icon,
  title,
  desc,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  desc?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && (
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--ops-tile)] text-[var(--ops-sec)]">
          <Icon icon={icon} customSize={18} />
        </span>
      )}
      <div className="text-[13.5px] font-semibold text-[var(--ops-title)]">{title}</div>
      {desc && <div className="mt-1 max-w-[460px] text-[12px] leading-relaxed text-[var(--ops-sec)]">{desc}</div>}
      {action}
    </div>
  )
}

export function TrAviso({ children, tone = "warn" }: { children: ReactNode; tone?: "warn" | "erro" }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[11.5px] leading-relaxed",
        tone === "erro"
          ? "border-[var(--ops-neg)]/30 bg-[var(--ops-neg)]/10 text-[var(--ops-neg)]"
          : "border-[var(--ops-warn-br)] bg-[var(--ops-warn-bg)] text-[var(--ops-warn)]",
      )}
    >
      <span className="mt-px shrink-0">
        <Icon icon={AlertTriangle} customSize={13} />
      </span>
      <span className="min-w-0">{children}</span>
    </div>
  )
}

// ── Controles ───────────────────────────────────────────────────────────

export const inputCls =
  "h-8 w-full rounded-lg border border-[var(--ops-border)] bg-[var(--ops-card)] px-2.5 text-[12.5px] text-[var(--ops-title)] outline-none placeholder:text-[var(--ops-mut)] focus:border-[var(--ops-accent)]"

export const selectCls =
  "h-8 w-full cursor-pointer appearance-none rounded-lg border border-[var(--ops-border)] bg-[var(--ops-card)] px-2.5 pr-7 text-[12.5px] text-[var(--ops-title)] outline-none focus:border-[var(--ops-accent)]"

export const textareaCls =
  "w-full rounded-lg border border-[var(--ops-border)] bg-[var(--ops-card)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--ops-title)] outline-none placeholder:text-[var(--ops-mut)] focus:border-[var(--ops-accent)]"

export function TrBtn({
  children,
  onClick,
  kind = "ghost",
  icon,
  disabled,
  type = "button",
  className,
  title,
}: {
  children?: ReactNode
  onClick?: () => void
  kind?: "primary" | "ghost" | "destrutivo"
  icon?: LucideIcon
  disabled?: boolean
  type?: "button" | "submit"
  className?: string
  title?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-[13px] text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        kind === "primary" && "bg-[var(--ops-accent)] text-[var(--ops-on-accent)] hover:opacity-90",
        kind === "ghost" &&
          "border border-[var(--ops-border)] text-[var(--ops-title)] hover:bg-[var(--ops-hover)]",
        kind === "destrutivo" &&
          "border border-[var(--ops-neg)]/30 text-[var(--ops-neg)] hover:bg-[var(--ops-neg)]/10",
        className,
      )}
    >
      {icon && <Icon icon={icon} customSize={13} />}
      {children}
    </button>
  )
}

export function TrChip({
  children,
  onRemove,
  cor,
  className,
}: {
  children: ReactNode
  onRemove?: () => void
  cor?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-[3px] text-[11px] font-medium",
        className,
      )}
      style={
        cor
          ? { borderColor: `${cor}33`, backgroundColor: `${cor}14`, color: cor }
          : { borderColor: "var(--ops-border)", color: "var(--ops-text)" }
      }
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remover"
          className="-mr-0.5 text-current opacity-50 transition-opacity hover:opacity-100"
        >
          ×
        </button>
      )}
    </span>
  )
}

/** Miniatura do card e da lista; placeholder quando não há capa. */
export function TrThumb({
  src,
  alt,
  className,
  children,
}: {
  src: string | null | undefined
  alt?: string
  className?: string
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[var(--ops-track)]",
        className,
      )}
    >
      {src ? (
        // Capa vem de URL assinada e de CDN de terceiro: <img> evita o
        // otimizador do Next tentar buscar um domínio que muda.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt ?? ""} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-[var(--ops-mut)]">
          <Icon icon={Upload} customSize={16} />
        </span>
      )}
      {children}
    </div>
  )
}

export function TrDivisor({ children }: { children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-[var(--ops-border)]" />
      {children && <span className="text-[11px] text-[var(--ops-mut)]">{children}</span>}
      <span className="h-px flex-1 bg-[var(--ops-border)]" />
    </div>
  )
}
