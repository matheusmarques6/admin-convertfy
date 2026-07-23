"use client"

/**
 * Átomos de UI da maquete "Geração de Emails" (EGCard, EGInput, EGToggle...).
 * Estilo inline com os tokens de `eg-theme.ts` — fiel ao protótipo aprovado,
 * light-only (precedente: logs-workspace).
 */

import { type ReactNode, type CSSProperties, type SyntheticEvent, useState } from "react"
import { ChevronDown, Check, Maximize2, Minimize2 } from "lucide-react"
import { C, F, TNUM, egInputStyle } from "./eg-theme"

// ── Card com título de seção ──────────────────────────────────────
export function EGCard({
  title,
  right,
  children,
  style,
  bodyStyle,
}: {
  title?: ReactNode
  right?: ReactNode
  children: ReactNode
  style?: CSSProperties
  bodyStyle?: CSSProperties
}) {
  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        background: C.white,
        boxShadow: C.shadowSm,
        ...style,
      }}
    >
      {title != null && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "16px 20px",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: C.g900,
              fontFamily: F.sans,
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </span>
          {right}
        </div>
      )}
      <div style={{ padding: 20, ...bodyStyle }}>{children}</div>
    </div>
  )
}

// ── Título de seção de aba (ícone + título + subtítulo) ───────────
export function EGSecTitle({
  icon,
  title,
  sub,
}: {
  icon?: ReactNode
  title: ReactNode
  sub?: ReactNode
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        {icon != null && (
          <span style={{ color: C.brand, display: "flex" }}>{icon}</span>
        )}
        <h2
          style={{
            margin: 0,
            fontSize: 17,
            fontWeight: 600,
            color: C.g900,
            fontFamily: F.sans,
          }}
        >
          {title}
        </h2>
      </div>
      {sub != null && (
        <div
          style={{
            marginTop: 3,
            fontSize: 12.5,
            color: C.g500,
            fontFamily: F.sans,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}

// ── Label de campo ────────────────────────────────────────────────
export function EGLabel({
  children,
  hint,
}: {
  children: ReactNode
  hint?: ReactNode
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        marginBottom: 6,
      }}
    >
      <span
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          color: C.g600,
          fontFamily: F.sans,
          textTransform: "uppercase",
          letterSpacing: "0.03em",
        }}
      >
        {children}
      </span>
      {hint != null && (
        <span
          style={{
            fontSize: 11,
            color: C.g400,
            fontFamily: F.sans,
            textTransform: "none",
            letterSpacing: 0,
            fontWeight: 400,
          }}
        >
          {hint}
        </span>
      )}
    </div>
  )
}

// ── Inputs ────────────────────────────────────────────────────────
export function EGInput({
  value,
  onChange,
  placeholder,
  mono,
  type = "text",
  disabled,
  min,
  max,
  style,
  title,
}: {
  value: string | number
  onChange?: (value: string) => void
  placeholder?: string
  mono?: boolean
  type?: string
  disabled?: boolean
  min?: number
  max?: number
  style?: CSSProperties
  title?: string
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      min={min}
      max={max}
      title={title}
      onChange={(e) => onChange?.(e.target.value)}
      style={{
        ...egInputStyle,
        ...(mono ? { fontFamily: F.mono, fontSize: 12 } : {}),
        ...(disabled ? { opacity: 0.6, cursor: "not-allowed" } : {}),
        ...style,
      }}
    />
  )
}

export function EGTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  mono,
  disabled,
  style,
}: {
  value: string
  onChange?: (value: string) => void
  placeholder?: string
  rows?: number
  mono?: boolean
  disabled?: boolean
  style?: CSSProperties
}) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value)}
      style={{
        ...egInputStyle,
        height: "auto",
        padding: "9px 11px",
        lineHeight: 1.5,
        resize: "vertical",
        ...(mono ? { fontFamily: F.mono, fontSize: 12 } : {}),
        ...(disabled ? { opacity: 0.6, cursor: "not-allowed" } : {}),
        ...style,
      }}
    />
  )
}

export type EGSelectOption = string | { value: string; label: string }

export function EGSelect({
  value,
  onChange,
  options,
  disabled,
  placeholder,
}: {
  value: string
  onChange?: (value: string) => void
  options: EGSelectOption[]
  disabled?: boolean
  placeholder?: string
}) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          ...egInputStyle,
          appearance: "none",
          WebkitAppearance: "none",
          paddingRight: 32,
          cursor: disabled ? "not-allowed" : "pointer",
          ...(disabled ? { opacity: 0.6 } : {}),
        }}
      >
        {placeholder != null && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const opt = typeof o === "string" ? { value: o, label: o } : o
          return (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          )
        })}
      </select>
      <span
        style={{
          position: "absolute",
          right: 10,
          top: "50%",
          transform: "translateY(-50%)",
          color: C.g400,
          pointerEvents: "none",
          display: "flex",
        }}
      >
        <ChevronDown size={15} />
      </span>
    </div>
  )
}

// ── Toggle / Checkbox ─────────────────────────────────────────────
export function EGToggle({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean
  onChange?: (on: boolean) => void
  label?: ReactNode
  disabled?: boolean
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange?.(!on)}
        style={{
          width: 38,
          height: 22,
          borderRadius: 999,
          border: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          padding: 2,
          position: "relative",
          background: on ? C.brand : C.g300,
          transition: "background 150ms",
          flexShrink: 0,
          ...(disabled ? { opacity: 0.6 } : {}),
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: on ? 18 : 2,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#fff",
            transition: "left 150ms",
            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
          }}
        />
      </button>
      {label != null && (
        <span style={{ fontSize: 13, color: C.g600, fontFamily: F.sans }}>
          {label}
        </span>
      )}
    </div>
  )
}

export function EGCheck({
  on,
  onChange,
  label,
}: {
  on: boolean
  onChange?: (on: boolean) => void
  label: ReactNode
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        padding: "3px 0",
      }}
    >
      <span
        onClick={() => onChange?.(!on)}
        style={{
          width: 17,
          height: 17,
          borderRadius: 5,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: on ? C.brand : C.white,
          border: `1.5px solid ${on ? C.brand : C.g300}`,
          color: "#fff",
        }}
      >
        {on && <Check size={12} strokeWidth={3} />}
      </span>
      <span style={{ fontSize: 13, color: C.g700, fontFamily: F.sans }}>
        {label}
      </span>
    </label>
  )
}

// ── Badge ─────────────────────────────────────────────────────────
export type EGBadgeTone = "pos" | "neg" | "warn" | "info" | "neut"

const BADGE_TONES: Record<
  EGBadgeTone,
  { color: string; bg: string; border: string }
> = {
  pos: { color: C.pos, bg: C.posBg, border: C.posBorder },
  neg: { color: C.neg, bg: C.negBg, border: C.negBorder },
  warn: { color: C.warn, bg: C.warnBg, border: C.warnBorder },
  info: { color: C.info, bg: C.infoBg, border: C.infoBorder },
  neut: { color: C.neut, bg: C.neutBg, border: C.neutBorder },
}

export function EGBadge({
  tone = "neut",
  dot,
  children,
}: {
  tone?: EGBadgeTone
  dot?: boolean
  children: ReactNode
}) {
  const t = BADGE_TONES[tone]
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        borderRadius: 999,
        border: `1px solid ${t.border}`,
        background: t.bg,
        color: t.color,
        fontSize: 11.5,
        fontWeight: 600,
        fontFamily: F.sans,
        whiteSpace: "nowrap",
      }}
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "currentColor",
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  )
}

// ── Botões ────────────────────────────────────────────────────────
export type EGBtnVariant = "dark" | "secondary" | "brand" | "danger"

const BTN_STYLES: Record<EGBtnVariant, CSSProperties> = {
  dark: {
    border: "none",
    background: C.g900,
    color: "#fff",
    fontWeight: 600,
  },
  brand: {
    border: "none",
    background: C.brand,
    color: "#fff",
    fontWeight: 600,
  },
  secondary: {
    border: `1px solid ${C.border}`,
    background: C.white,
    color: C.g700,
    fontWeight: 500,
  },
  danger: {
    border: `1px solid ${C.negBorder}`,
    background: C.white,
    color: C.neg,
    fontWeight: 500,
  },
}

export function EGBtn({
  variant = "secondary",
  children,
  onClick,
  disabled,
  title,
  style,
  type = "button",
}: {
  variant?: EGBtnVariant
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  title?: string
  style?: CSSProperties
  type?: "button" | "submit"
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        height: 34,
        padding: variant === "secondary" ? "0 14px" : "0 16px",
        borderRadius: 7,
        fontSize: 13,
        fontFamily: F.sans,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        ...BTN_STYLES[variant],
        ...style,
      }}
    >
      {children}
    </button>
  )
}

// ── Pills de navegação ────────────────────────────────────────────
export interface EGPillItem {
  key: string
  label: ReactNode
  count?: number
  sub?: ReactNode
}

/** Pills "flat" de flow (texto azul quando ativo, fundo blue50). */
export function EGFlowPills({
  items,
  value,
  onChange,
}: {
  items: EGPillItem[]
  value: string
  onChange: (key: string) => void
}) {
  return (
    <div
      style={{ display: "flex", gap: 2, flexWrap: "wrap", marginBottom: 18 }}
    >
      {items.map((it) => {
        const on = it.key === value
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            style={{
              padding: "7px 12px",
              borderRadius: 7,
              border: "none",
              cursor: "pointer",
              fontFamily: F.sans,
              fontSize: 12.5,
              fontWeight: on ? 600 : 500,
              color: on ? C.brand : C.g500,
              background: on ? C.blue50 : "transparent",
            }}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

/** Pills "cheias" de categoria (fundo brand quando ativo, contador). */
export function EGCatPills({
  items,
  value,
  onChange,
}: {
  items: EGPillItem[]
  value: string
  onChange: (key: string) => void
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {items.map((it) => {
        const on = it.key === value
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 9,
              cursor: "pointer",
              fontFamily: F.sans,
              fontSize: 12.5,
              whiteSpace: "nowrap",
              fontWeight: on ? 600 : 500,
              color: on ? "#fff" : C.g600,
              background: on ? C.brand : C.white,
              border: `1px solid ${on ? C.brand : C.border}`,
              boxShadow: on ? "0 1px 2px rgba(78,98,216,0.35)" : C.shadowSm,
              transition: "all 120ms",
            }}
          >
            {it.label}
            {it.count != null && (
              <span
                style={{
                  ...TNUM,
                  fontSize: 11,
                  fontWeight: 600,
                  minWidth: 18,
                  textAlign: "center",
                  padding: "1px 5px",
                  borderRadius: 999,
                  color: on ? "#fff" : C.g500,
                  background: on ? "rgba(255,255,255,0.22)" : C.g100,
                }}
              >
                {it.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Rail lateral de itens selecionáveis (variantes, emails do flow). */
export function EGRailItem({
  active,
  onClick,
  title,
  sub,
  dot,
  dotColor,
}: {
  active: boolean
  onClick: () => void
  title: ReactNode
  sub?: ReactNode
  dot?: boolean
  dotColor?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: "10px 12px",
        borderRadius: 9,
        cursor: "pointer",
        fontFamily: F.sans,
        border: `1px solid ${active ? C.brand : C.border}`,
        background: active ? C.blue50 : C.white,
        boxShadow: active ? "none" : C.shadowSm,
        width: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {dot && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: dotColor ?? C.g300,
              flexShrink: 0,
            }}
          />
        )}
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: active ? C.brand : C.g800,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </span>
      </div>
      {sub != null && (
        <div
          style={{
            fontSize: 11,
            color: C.g400,
            marginTop: 3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {sub}
        </div>
      )}
    </button>
  )
}

// ── Preview via iframe (render real de HTML de email) ─────────────
// Auto-ajusta a altura ao conteúdo (sem scroll interno) até um teto; acima
// dele, mostra o botão "Expandir" pra ver o email inteiro (ex.: hero completa).
export function EGRenderFrame({
  html,
  minHeight = 260,
  collapsedMax,
}: {
  html: string | null | undefined
  minHeight?: number
  /** Teto da altura recolhida antes de oferecer "Expandir". Default: minHeight. */
  collapsedMax?: number
}) {
  const [contentH, setContentH] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)

  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}body{background:#F3F4F6;padding:16px;font-family:Arial,Helvetica,sans-serif}</style></head><body>${
    html ||
    '<div style="color:#9CA3AF;text-align:center;padding:40px;font-family:Arial">Sem HTML para renderizar</div>'
  }</body></html>`

  // Teto recolhido: nunca menor que minHeight.
  const cap = Math.max(minHeight, collapsedMax ?? minHeight)
  // Altura real do conteúdo (medida no onLoad); fallback = minHeight.
  const measured = Math.max(contentH ?? minHeight, minHeight)
  const overflows = measured > cap + 8
  // Recolhido corta no teto (com scroll); expandido/coube mostra tudo.
  const frameH = !overflows || expanded ? measured : cap

  // Mede a altura do conteúdo. sandbox="allow-same-origin" (SEM allow-scripts:
  // scripts colados NÃO executam) permite ao pai ler o scrollHeight do doc.
  const handleLoad = (e: SyntheticEvent<HTMLIFrameElement>) => {
    try {
      const d = e.currentTarget.contentDocument
      const h = d?.body?.scrollHeight
      if (h && Number.isFinite(h)) setContentH(h + 4)
    } catch {
      /* cross-origin improvável em srcDoc same-origin — ignora */
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <iframe
        title="render"
        srcDoc={doc}
        sandbox="allow-same-origin"
        onLoad={handleLoad}
        scrolling={!overflows || expanded ? "no" : "auto"}
        style={{
          width: "100%",
          height: frameH,
          border: "none",
          display: "block",
          background: "#F3F4F6",
        }}
      />
      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginTop: 8,
            padding: "6px 12px",
            border: `1px solid ${C.border}`,
            background: C.white,
            borderRadius: 8,
            color: C.g700,
            fontSize: 12,
            fontWeight: 600,
            fontFamily: F.sans,
            cursor: "pointer",
          }}
        >
          {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          {expanded ? "Recolher" : "Expandir para ver o email inteiro"}
        </button>
      )}
    </div>
  )
}

// ── Aviso (banner) ────────────────────────────────────────────────
export function EGNotice({
  tone = "warn",
  children,
}: {
  tone?: EGBadgeTone
  children: ReactNode
}) {
  const t = BADGE_TONES[tone]
  return (
    <div
      style={{
        padding: "11px 14px",
        border: `1px solid ${t.border}`,
        background: t.bg,
        borderRadius: 8,
        color: t.color,
        fontSize: 12.5,
        fontFamily: F.sans,
      }}
    >
      {children}
    </div>
  )
}
