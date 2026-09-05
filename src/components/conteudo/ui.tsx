"use client"

/**
 * Átomos do módulo Conteúdo — tudo em tokens --ops-* (claro + grafite).
 * Cores literais só aparecem como MARCADOR de dado (perfil, molde, pilar,
 * formato): são codificação de série, não decoração da interface.
 */

import type { CSSProperties, ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { Instagram, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { COR_CONSOLIDADO } from "@/lib/conteudo/brand"
import type { Formato, Perfil } from "@/lib/conteudo/types"

export const TNUM: CSSProperties = {
  fontVariantNumeric: "tabular-nums lining-nums",
  fontFeatureSettings: '"tnum" 1, "lnum" 1',
}

/** Cor com alfa em hex (marcadores). */
export const alpha = (hex: string, a: number) =>
  `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`

export const fmtNum = (v: number) => v.toLocaleString("pt-BR")
export const fmtDec = (v: number, d = 1) => v.toFixed(d).replace(".", ",")

// ── Badge de marcador ──────────────────────────────────────────────────

export function CtBadge({ txt, cor, className }: { txt: string; cor: string; className?: string }) {
  return (
    <span
      className={cn("inline-flex h-[19px] items-center whitespace-nowrap rounded-[5px] px-[7px] text-[10px] font-semibold", className)}
      style={{ color: cor, background: alpha(cor, 0.12) }}
    >
      {txt}
    </span>
  )
}

// ── Segmented control ──────────────────────────────────────────────────

export function CtSeg<T extends string>({
  val,
  onChange,
  opts,
  size = "md",
  className,
}: {
  val: T
  onChange: (v: T) => void
  opts: Array<[T, string]>
  size?: "sm" | "md"
  className?: string
}) {
  return (
    <div className={cn("inline-flex gap-[2px] rounded-lg bg-[var(--ops-track)] p-[2px]", className)} role="tablist">
      {opts.map(([k, l]) => {
        const on = val === k
        return (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(k)}
            className={cn(
              "whitespace-nowrap rounded-md border-0 transition-colors",
              size === "sm" ? "h-6 px-2.5 text-[11px]" : "h-7 px-3 text-[11.5px]",
              on
                ? "bg-[var(--ops-card)] font-semibold text-[var(--ops-title)] shadow-[0_1px_2px_rgba(0,0,0,0.08)] dark:shadow-[0_0_0_1px_var(--ops-border)]"
                : "font-medium text-[var(--ops-sec)] hover:text-[var(--ops-title)]",
            )}
          >
            {l}
          </button>
        )
      })}
    </div>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────

export function CtSkel({ h = 14, w = "100%", r = 6, className }: { h?: number; w?: number | string; r?: number; className?: string }) {
  return <div className={cn("animate-pulse bg-[var(--ops-track)]", className)} style={{ height: h, width: w, borderRadius: r }} aria-hidden />
}

// ── Estado vazio ───────────────────────────────────────────────────────

export function CtEmpty({
  icon,
  title,
  desc,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  desc?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-12 text-center", className)}>
      {icon && (
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-[11px] bg-[var(--ops-hover)] text-[var(--ops-mut)]">
          <Icon icon={icon} customSize={18} />
        </span>
      )}
      <div className="mt-1 text-[13px] font-semibold text-[var(--ops-title)]">{title}</div>
      {desc && <div className="max-w-[320px] text-[11.5px] leading-relaxed text-[var(--ops-sec)]">{desc}</div>}
      {action}
    </div>
  )
}

// ── Botão ──────────────────────────────────────────────────────────────

export function CtBtn({
  children,
  kind = "secondary",
  onClick,
  icon,
  disabled,
  className,
  size = "md",
  type = "button",
  title,
}: {
  children: ReactNode
  kind?: "primary" | "secondary" | "ghost" | "danger"
  onClick?: () => void
  icon?: LucideIcon
  disabled?: boolean
  className?: string
  size?: "sm" | "md" | "lg"
  type?: "button" | "submit"
  title?: string
}) {
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" ? "h-[30px] px-[11px] text-[11.5px]" : size === "lg" ? "h-9 px-4 text-[12.5px]" : "h-8 px-[13px] text-[12px]",
        kind === "primary" && "bg-[var(--ops-accent)] text-[var(--ops-on-accent)] hover:opacity-90",
        kind === "secondary" && "border border-[var(--ops-border)] bg-[var(--ops-card)] text-[var(--ops-title)] hover:bg-[var(--ops-hover)]",
        kind === "ghost" && "text-[var(--ops-sec)] hover:bg-[var(--ops-hover)] hover:text-[var(--ops-title)]",
        kind === "danger" && "border border-[var(--ops-neg)]/40 text-[var(--ops-neg)] hover:bg-[var(--ops-hover)]",
        className,
      )}
    >
      {icon && <Icon icon={icon} customSize={size === "sm" ? 12 : 13} />}
      {children}
    </button>
  )
}

/** Botão de ícone quadrado (28px) com borda. */
export function CtIconBtn({
  icon,
  onClick,
  title,
  disabled,
  active,
  className,
  size = 28,
}: {
  icon: LucideIcon
  onClick?: () => void
  title?: string
  disabled?: boolean
  active?: boolean
  className?: string
  size?: number
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      style={{ width: size, height: size }}
      className={cn(
        "inline-flex items-center justify-center rounded-[7px] border border-[var(--ops-border)] bg-[var(--ops-card)] text-[var(--ops-title)] transition-colors hover:bg-[var(--ops-hover)] disabled:cursor-default disabled:opacity-50",
        active && "bg-[var(--ops-hover)]",
        className,
      )}
    >
      <Icon icon={icon} customSize={13} />
    </button>
  )
}

// ── Rótulo de campo (uppercase pequeno) ────────────────────────────────

export function CtLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--ops-mut)]", className)}>{children}</div>
  )
}

export const inputCls =
  "h-8 w-full rounded-lg border border-[var(--ops-border)] bg-[var(--ops-page)] px-2.5 text-[12px] text-[var(--ops-title)] outline-none placeholder:text-[var(--ops-mut)] focus:border-[var(--ops-accent)]"

export const selectCls =
  "h-8 w-full rounded-lg border border-[var(--ops-border)] bg-[var(--ops-page)] px-2 text-[12px] text-[var(--ops-title)] outline-none focus:border-[var(--ops-accent)]"

export const textareaCls =
  "w-full rounded-[9px] border border-[var(--ops-border)] bg-[var(--ops-page)] px-2.5 py-2 text-[12px] leading-relaxed text-[var(--ops-title)] outline-none placeholder:text-[var(--ops-mut)] focus:border-[var(--ops-accent)]"

// ── Perfil: avatar e canal ─────────────────────────────────────────────

/**
 * Avatar do perfil: foto real (servida pelo admin) quando existe; senão a
 * inicial do nome sobre a cor de marcador do canal. `src` sobrescreve (o
 * brand kit do documento pode ter outra foto).
 */
export function CtAvatar({ perfil, size = 24, src, className }: { perfil: Perfil | null | undefined; size?: number; src?: string | null; className?: string }) {
  const foto = src === undefined ? perfil?.avatar : src
  const nome = perfil?.nome ?? "Perfil"
  if (foto) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={foto} alt={nome} width={size} height={size} className={cn("block shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />
  }
  const letra = (perfil?.handle?.replace("@", "") || nome).trim().charAt(0).toUpperCase() || "?"
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full text-white", className)}
      style={{ width: size, height: size, background: perfil?.cor ?? COR_CONSOLIDADO }}
      aria-label={nome}
    >
      <span style={{ fontSize: size * 0.42, letterSpacing: "-0.02em" }} className="font-extrabold">
        {letra}
      </span>
    </span>
  )
}

export function CtCanalDot() {
  return (
    <span className="box-content inline-flex h-[14px] w-[14px] items-center justify-center rounded-[5px] border-2 border-[var(--ops-card)] text-white" style={{ background: "#DB2777" }}>
      <Icon icon={Instagram} customSize={8} />
    </span>
  )
}

export function CtAvatarComCanal({ perfil, size = 24 }: { perfil: Perfil | null | undefined; size?: number }) {
  return (
    <span className="relative inline-flex">
      <CtAvatar perfil={perfil} size={size} />
      <span className="absolute -bottom-[5px] -right-[6px]">
        <CtCanalDot />
      </span>
    </span>
  )
}

// ── Formato do post ────────────────────────────────────────────────────

const FMT: Record<Formato, { cor: string; icon: LucideIcon }> = {
  Carrossel: { cor: "#4E62D8", icon: Instagram },
  Reels: { cor: "#DB2777", icon: Play },
  Imagem: { cor: "#0E7490", icon: Instagram },
  Vídeo: { cor: "#DC2626", icon: Play },
}

export function CtFmt({ fmt }: { fmt: Formato }) {
  const f = FMT[fmt] ?? FMT.Imagem
  return (
    <span
      className="inline-flex h-5 items-center gap-[5px] whitespace-nowrap rounded-md pl-1.5 pr-2 text-[10.5px] font-semibold"
      style={{ color: f.cor, background: alpha(f.cor, 0.12) }}
    >
      <Icon icon={f.icon} customSize={10} />
      {fmt}
    </span>
  )
}

/** Miniatura REAL do post (thumbnail da Graph API); sem imagem, placeholder neutro. */
export function CtThumbPost({ src, className, style }: { src: string | null | undefined; className?: string; style?: CSSProperties }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" loading="lazy" className={cn("object-cover", className)} style={style} />
  }
  return (
    <span className={cn("inline-flex items-center justify-center bg-[var(--ops-track)] text-[var(--ops-mut)]", className)} style={style} aria-hidden>
      <Icon icon={Instagram} customSize={12} />
    </span>
  )
}

// ── Tile com ícone colorido (funil) ────────────────────────────────────

export function CtTile({ label, valor, cor, icon }: { label: string; valor: string; cor: string; icon: LucideIcon }) {
  return (
    <div className="flex items-center gap-[11px] rounded-[9px] border border-[var(--ops-border)] bg-[var(--ops-tile)] px-[13px] py-[11px]">
      <span className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-white" style={{ background: cor }}>
        <Icon icon={icon} customSize={14} />
      </span>
      <span className="min-w-0">
        <span className="block text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[var(--ops-sec)]">{label}</span>
        <span className="mt-px block text-[15.5px] font-semibold text-[var(--ops-title)]" style={TNUM}>
          {valor}
        </span>
      </span>
    </div>
  )
}

// ── Toast leve do editor (posição fixa) ───────────────────────────────

export function CtToast({ msg }: { msg: string | null }) {
  if (!msg) return null
  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-16 left-1/2 z-[99] inline-flex -translate-x-1/2 items-center gap-2 rounded-[10px] bg-[var(--ops-title)] px-3.5 py-[9px] text-[12px] font-medium text-[var(--ops-card)] shadow-[0_10px_30px_rgba(0,0,0,0.3)]"
    >
      {msg}
    </div>
  )
}
