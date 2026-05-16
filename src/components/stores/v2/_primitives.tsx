"use client"

/**
 * Primitivos visuais da página /admin/stores/[id] v2.
 *
 * Mirror exato do Convertfy Design System v3 (handoff bundle):
 *  - Section: card com header (title + subtitle + right slot) e content
 *  - Btn: variants primary/secondary/ghost/destructive em 3 tamanhos
 *  - Badge: pos/neg/warn/info/neut/purple com dot opcional
 *  - Avatar: monograma com cor derivada do nome
 *  - HealthRing: donut compacto pro hero
 *  - ChannelIcon: monograma colorido pra integrações (S verde, K preto, O preto…)
 *
 * Tokens em colors_and_type.css — re-exportados em CSS vars `--brand-*`, `--gray-*`, etc.
 */

import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

// ─── Color tokens (mirror de shared.jsx) ──────────────────────────────

export const C = {
  brand: "#4E62D8",
  brandHover: "#2137B6",
  brandDark: "#041366",
  blue50: "#EEF0FB",
  blue100: "#C7CDEF",
  blue200: "#A8B2EE",
  white: "#FFFFFF",
  g25: "#FCFCFD",
  g50: "#F8FAFC",
  g100: "#F3F4F6",
  g200: "#E5E7EB",
  g300: "#D1D5DB",
  g400: "#9CA3AF",
  g500: "#6B7280",
  g600: "#4B5563",
  g700: "#374151",
  g800: "#1F2937",
  g900: "#111827",
  pos: "#065F46",
  posBg: "#ECFDF5",
  posBorder: "#A7F3D0",
  neg: "#991B1B",
  negBg: "#FEF2F2",
  negBorder: "#FECACA",
  warn: "#92400E",
  warnBg: "#FFFBEB",
  warnBorder: "#FDE68A",
  info: "#2137B6",
  infoBg: "#EEF0FB",
  infoBorder: "#C7CDEF",
  neut: "#374151",
  neutBg: "#F3F4F6",
  neutBorder: "#E5E7EB",
  border: "rgba(0,0,0,0.08)",
  borderHv: "rgba(0,0,0,0.12)",
  purple: "#7C3AED",
  purpleBg: "#F3E8FF",
  purpleBorder: "#E0CBFF",
  amber: "#D97706",
  shadowSm: "0 1px 2px rgba(0,0,0,0.03), 0 1px 3px rgba(0,0,0,0.05)",
  shadowMd: "0 2px 4px rgba(0,0,0,0.03), 0 4px 6px rgba(0,0,0,0.05)",
} as const

export const TNUM = {
  fontVariantNumeric: "tabular-nums lining-nums" as const,
  fontFeatureSettings: '"tnum" 1, "lnum" 1',
}

// ─── Section ──────────────────────────────────────────────────────────

interface SectionProps {
  title?: string
  subtitle?: string
  right?: ReactNode
  children: ReactNode
  className?: string
  noPadding?: boolean
}

export function Section({ title, subtitle, right, children, className, noPadding }: SectionProps) {
  return (
    <section
      className={cn("bg-white border rounded-[12px] mb-5 overflow-hidden", className)}
      style={{ borderColor: C.border, boxShadow: C.shadowSm }}
    >
      {(title || right) && (
        <header
          className="flex items-center justify-between gap-3 px-[18px] py-[14px]"
          style={{ borderBottom: `1px solid ${C.border}` }}
        >
          <div className="min-w-0">
            {title && <div className="text-[14px] font-semibold text-slate-900 leading-tight">{title}</div>}
            {subtitle && <div className="text-[12px] text-slate-500 mt-0.5">{subtitle}</div>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      <div className={noPadding ? "" : "p-[18px]"}>{children}</div>
    </section>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────

type BadgeTone = "pos" | "neg" | "warn" | "info" | "neut" | "purple"

interface BadgeProps {
  tone?: BadgeTone
  dot?: boolean
  children: ReactNode
  className?: string
}

export function Badge({ tone = "neut", dot, children, className }: BadgeProps) {
  const map = {
    pos: { bg: C.posBg, c: C.pos, b: C.posBorder },
    neg: { bg: C.negBg, c: C.neg, b: C.negBorder },
    warn: { bg: C.warnBg, c: C.warn, b: C.warnBorder },
    info: { bg: C.infoBg, c: C.info, b: C.infoBorder },
    neut: { bg: C.neutBg, c: C.neut, b: C.neutBorder },
    purple: { bg: C.purpleBg, c: C.purple, b: C.purpleBorder },
  }
  const t = map[tone]
  return (
    <span
      className={cn("inline-flex items-center gap-[5px] px-[7px] py-[1px] rounded-[4px] text-[11px] font-medium", className)}
      style={{ background: t.bg, border: `1px solid ${t.b}`, color: t.c }}
    >
      {dot && <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: t.c }} />}
      {children}
    </span>
  )
}

// ─── Btn ──────────────────────────────────────────────────────────────

type BtnVariant = "primary" | "secondary" | "ghost" | "destructive"
type BtnSize = "sm" | "md" | "lg"

interface BtnProps {
  variant?: BtnVariant
  size?: BtnSize
  icon?: ReactNode
  children?: ReactNode
  onClick?: () => void
  className?: string
  disabled?: boolean
  type?: "button" | "submit"
  as?: "a"
  href?: string
}

export function Btn({
  variant = "primary",
  size = "md",
  icon,
  children,
  onClick,
  className,
  disabled,
  type = "button",
  as,
  href,
}: BtnProps) {
  const sizes = {
    sm: { h: 28, px: 10, fs: 12 },
    md: { h: 34, px: 14, fs: 13 },
    lg: { h: 40, px: 20, fs: 14 },
  }
  const variants = {
    primary: { bg: C.brand, c: "#fff", b: "none", hover: C.brandHover },
    secondary: { bg: C.white, c: C.g700, b: `1px solid ${C.border}`, hover: C.g50 },
    ghost: { bg: "transparent", c: C.g600, b: "none", hover: C.g50 },
    destructive: { bg: C.white, c: C.neg, b: `1px solid ${C.negBorder}`, hover: C.negBg },
  }
  const s = sizes[size]
  const v = variants[variant]

  const sharedProps = {
    onClick,
    className: cn("inline-flex items-center justify-center gap-1.5 rounded-[6px] font-medium whitespace-nowrap transition-colors", disabled && "opacity-50 cursor-not-allowed", className),
    style: {
      height: s.h,
      padding: `0 ${s.px}px`,
      fontSize: s.fs,
      background: v.bg,
      color: v.c,
      border: v.b,
    },
  }

  if (as === "a" && href) {
    return (
      <a href={href} {...sharedProps}>
        {icon}
        {children}
      </a>
    )
  }
  return (
    <button type={type} disabled={disabled} {...sharedProps}>
      {icon}
      {children}
    </button>
  )
}

// ─── KV row ───────────────────────────────────────────────────────────

interface KVProps {
  label: string
  value: ReactNode
  mono?: boolean
  mute?: boolean
}

export function KV({ label, value, mono, mute }: KVProps) {
  return (
    <div
      className="flex justify-between items-baseline gap-3 py-2"
      style={{ borderBottom: `1px dashed ${C.border}` }}
    >
      <span className="text-[12px] text-slate-500 shrink-0">{label}</span>
      <span
        className={cn("text-[13px] font-medium text-right", mute ? "text-slate-400" : "text-slate-900")}
        style={mono ? TNUM : undefined}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Avatar ───────────────────────────────────────────────────────────

interface AvatarProps {
  name: string
  size?: number
  bg?: string
  color?: string
}

const AVATAR_PALETTE = [
  { bg: "#EEF0FB", c: "#4E62D8" },
  { bg: "#ECFDF5", c: "#065F46" },
  { bg: "#FFFBEB", c: "#92400E" },
  { bg: "#F3E8FF", c: "#7C3AED" },
  { bg: "#FEF2F2", c: "#991B1B" },
  { bg: "#F3F4F6", c: "#4B5563" },
] as const

export function avatarColor(name: string) {
  const h = (name || "").split("").reduce((a, ch) => a + ch.charCodeAt(0), 0)
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}

export function Avatar({ name, size = 28, bg, color }: AvatarProps) {
  const initials = (name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()
  const p = avatarColor(name)
  return (
    <div
      className="inline-flex items-center justify-center rounded-full shrink-0 font-semibold"
      style={{
        width: size,
        height: size,
        background: bg || p.bg,
        color: color || p.c,
        fontSize: Math.max(10, Math.round(size * 0.38)),
        letterSpacing: "-0.01em",
      }}
    >
      {initials}
    </div>
  )
}

// ─── HealthRing ───────────────────────────────────────────────────────

export function HealthRing({ score, size = 56, showLabel = true }: { score: number; size?: number; showLabel?: boolean }) {
  const r = 22
  const c = 2 * Math.PI * r
  const off = c * (1 - score / 100)
  const tone = score >= 80 ? C.pos : score >= 60 ? C.amber : C.neg
  const label = score >= 80 ? "Boa" : score >= 60 ? "Atenção" : "Crítica"
  if (!showLabel) {
    return (
      <svg width={size} height={size} viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} stroke={C.g200} strokeWidth="6" fill="none" />
        <circle
          cx="28"
          cy="28"
          r={r}
          stroke={tone}
          strokeWidth="6"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          transform="rotate(-90 28 28)"
        />
        <text
          x="28"
          y="32"
          textAnchor="middle"
          fontSize="14"
          fontWeight="700"
          fill={C.g900}
          style={TNUM}
        >
          {score}
        </text>
      </svg>
    )
  }
  return (
    <div
      className="flex items-center gap-2.5 pl-1.5 pr-3.5 py-1 rounded-[8px]"
      style={{ background: C.g50, border: `1px solid ${C.border}` }}
    >
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} stroke={C.g200} strokeWidth="6" fill="none" />
        <circle
          cx="28"
          cy="28"
          r={r}
          stroke={tone}
          strokeWidth="6"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          transform="rotate(-90 28 28)"
        />
        <text
          x="28"
          y="32"
          textAnchor="middle"
          fontSize="14"
          fontWeight="700"
          fill={C.g900}
          style={TNUM}
        >
          {score}
        </text>
      </svg>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: C.g400 }}>
          SAÚDE
        </div>
        <div className="text-[12.5px] font-semibold" style={{ color: tone }}>
          {label}
        </div>
      </div>
    </div>
  )
}

// ─── ChannelIcon (monograma) ──────────────────────────────────────────

const CHANNEL_MAP: Record<string, { bg: string; label: string }> = {
  shopify: { bg: "#95BF47", label: "S" },
  klaviyo: { bg: "#000000", label: "K" },
  omnisend: { bg: "#0F1117", label: "O" },
  google: { bg: "#FBBC04", label: "G" },
  ga4: { bg: "#FBBC04", label: "G" },
  meta: { bg: "#0866FF", label: "M" },
  tiktok: { bg: "#000000", label: "T" },
  google_ads: { bg: "#EA4335", label: "G" },
}

export function ChannelIcon({ name, size = 22 }: { name: string; size?: number }) {
  const m = CHANNEL_MAP[name] || { bg: C.g300, label: "?" }
  return (
    <div
      className="inline-flex items-center justify-center text-white font-bold shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: 5,
        background: m.bg,
        fontSize: Math.max(10, Math.round(size * 0.5)),
      }}
    >
      {m.label}
    </div>
  )
}

// ─── StoreLogo (Playfair italic monograma) ────────────────────────────

export function StoreLogo({ name, size = 40, bgColor = "#000" }: { name: string; size?: number; bgColor?: string }) {
  const initials = (name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()
  return (
    <div
      className="inline-flex items-center justify-center text-white shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: bgColor,
        fontFamily: '"Playfair Display", Georgia, serif',
        fontStyle: "italic",
        fontWeight: 700,
        fontSize: Math.round(size * 0.45),
        letterSpacing: "-0.02em",
      }}
    >
      {initials}
    </div>
  )
}
