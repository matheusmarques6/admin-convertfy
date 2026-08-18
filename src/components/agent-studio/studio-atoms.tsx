"use client"

/**
 * Estúdio de Agentes — átomos visuais da maquete "Estúdio de Agentes"
 * (Convertfy DS v3, light-only — precedente logs-workspace/eg-atoms).
 *
 * Reusa os tokens C/F/TNUM de eg-theme; os átomos aqui são os da maquete
 * (Panel, Kpi, SelectPill, AgentChip, CodeBlock) que não existem no
 * eg-atoms com a mesma anatomia.
 */

import type { CSSProperties, ReactNode } from "react"

import { C, F, TNUM } from "@/components/email-generation/ui/eg-theme"
import { AGENT_VISUAL, type PipelineAgentKey } from "@/lib/agents/agent-visual"

export const SHADOW_MD = "0 2px 4px rgba(0,0,0,0.03), 0 4px 6px rgba(0,0,0,0.05)"
export const SHADOW_LG =
  "0 1px 2px rgba(0,0,0,0.03), 0 4px 8px rgba(0,0,0,0.04), 0 12px 24px rgba(0,0,0,0.06)"

// ── Formatação numérica (mesma régua da maquete) ─────────────────────────
export const usd = (v: number) => "$" + Number(v).toFixed(2)
export const usd3 = (v: number) => "$" + Number(v).toFixed(3)
export const brl = (v: number) =>
  "R$ " +
  Number(v).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
export const fmtInt = (n: number) => Number(n).toLocaleString("pt-BR")
export const fmtTok = (n: number) =>
  n >= 1000 ? (n / 1000).toFixed(1).replace(".", ",") + "k" : String(n)
export const fmtSec = (ms: number | null | undefined) =>
  ms == null ? "—" : (ms / 1000).toFixed(1).replace(".", ",") + "s"

// ── Spinner CSS (uma injeção só) ─────────────────────────────────────────
export function StudioSpinStyle() {
  return (
    <style>{`
      @keyframes cf-studio-spin { to { transform: rotate(360deg); } }
      .cf-studio-spin { animation: cf-studio-spin 0.8s linear infinite; }
    `}</style>
  )
}

export function Spinner({ size = 10, track = C.blue100, head = C.brand }: { size?: number; track?: string; head?: string }) {
  return (
    <span
      className="cf-studio-spin"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2px solid ${track}`,
        borderTopColor: head,
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  )
}

// ── Panel (card com título) ──────────────────────────────────────────────
export function Panel({
  title,
  hint,
  right,
  children,
  pad = 18,
  style,
}: {
  title?: string
  hint?: string
  right?: ReactNode
  children: ReactNode
  pad?: number
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        background: C.white,
        ...style,
      }}
    >
      {title && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: `14px ${pad}px`,
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: C.g900,
                fontFamily: F.sans,
                letterSpacing: "-0.01em",
              }}
            >
              {title}
            </span>
            {hint && (
              <span style={{ fontSize: 12, color: C.g400, fontFamily: F.sans }}>
                {hint}
              </span>
            )}
          </div>
          {right}
        </div>
      )}
      <div style={{ padding: pad }}>{children}</div>
    </div>
  )
}

// ── KPI ──────────────────────────────────────────────────────────────────
export function Kpi({
  label,
  value,
  sub,
  accent,
  tone,
}: {
  label: string
  value: string
  sub?: string
  accent?: string
  tone?: string
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: "13px 16px",
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        background: C.white,
        borderTop: `2px solid ${accent ?? C.border}`,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: C.g400,
          fontFamily: F.sans,
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 25,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: tone ?? C.g900,
          fontFamily: F.sans,
          ...TNUM,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            marginTop: 5,
            fontSize: 11.5,
            color: C.g500,
            fontFamily: F.sans,
            ...TNUM,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}

// ── Identidade do agente ─────────────────────────────────────────────────
export function AgentChip({ k, size = "md" }: { k: PipelineAgentKey; size?: "sm" | "md" }) {
  const a = AGENT_VISUAL[k]
  if (!a) return null
  const pad = size === "sm" ? "2px 7px 2px 6px" : "3px 9px 3px 7px"
  const fs = size === "sm" ? 11.5 : 12.5
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: pad,
        borderRadius: 5,
        background: a.bg,
        border: `1px solid ${a.border}`,
        fontFamily: F.sans,
      }}
    >
      <span
        style={{ width: 7, height: 7, borderRadius: 2, background: a.color, flexShrink: 0 }}
      />
      <span style={{ fontSize: fs, fontWeight: 600, color: a.color }}>{a.name}</span>
    </span>
  )
}

// ── Bloco de código (dark, como a maquete) ───────────────────────────────
export function CodeBlock({ text }: { text: string }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: "11px 13px",
        borderRadius: 8,
        background: "#0F1117",
        color: "#C4C9D4",
        fontSize: 11.5,
        lineHeight: 1.6,
        fontFamily: F.mono,
        overflowX: "auto",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {text}
    </pre>
  )
}

// ── Botões da topbar/painéis ─────────────────────────────────────────────
export function StudioBtn({
  variant = "secondary",
  children,
  onClick,
  disabled,
  title,
  style,
}: {
  variant?: "primary" | "secondary"
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  title?: string
  style?: CSSProperties
}) {
  const primary = variant === "primary"
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        height: 31,
        padding: primary ? "0 14px" : "0 12px",
        borderRadius: 7,
        border: primary ? "none" : `1px solid ${C.border}`,
        background: disabled ? C.g100 : primary ? C.brand : C.white,
        color: disabled ? C.g400 : primary ? "#fff" : C.g700,
        fontSize: 12,
        fontWeight: primary ? 600 : 500,
        fontFamily: F.sans,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </button>
  )
}
