"use client"

/**
 * Contexto de edição inline dos números do relatório mensal.
 *
 * Quando o contexto é null (caminho do PRINT/PDF), EditableNumber/EditableText
 * degradam para texto puro — zero UI de edição vaza para o documento.
 *
 * Em modo edição, os valores viram inputs âmbar; em modo visualização com
 * override salvo, mostram um marcador "editado" com opção de restaurar.
 *
 * Os valores trafegam na UNIDADE NATIVA do snapshot (fração 0–1 para
 * atribuicao_pct, 0–100 para taxas, absoluto para moeda/contagem). O
 * componente converte a apresentação por `kind`; o draft guarda sempre o
 * valor nativo (o que a API espera).
 */

import { createContext, useContext } from "react"

export interface ReportEditCtx {
  editing: boolean
  /** Valor nativo atual do draft para o path (undefined = sem edição no
   *  draft; null = marcado para restaurar → volta ao snapshot original). */
  getDraft: (path: string) => number | string | null | undefined
  setValue: (path: string, value: number | string) => void
  /** Restaura o campo ao valor original do snapshot (remove o override). */
  resetField: (path: string) => void
  /** True quando o path tem override salvo OU no draft (mostra marcador). */
  isOverridden: (path: string) => boolean
  currency: string
}

export const ReportEditContext = createContext<ReportEditCtx | null>(null)

export function useReportEdit(): ReportEditCtx | null {
  return useContext(ReportEditContext)
}

// ─── EditableNumber ──────────────────────────────────────────────────────

export type EditableKind = "currency" | "count" | "rate100" | "fraction100"

interface EditableNumberProps {
  path: string
  /** Valor nativo já MERGED (o editor recomputa a cada tecla). */
  raw: number | null | undefined
  /** Apresentação formatada usada em modo visualização. */
  display: React.ReactNode
  kind: EditableKind
}

/** Converte valor nativo → número exibido no input (fração vira %). */
function toInput(raw: number | null | undefined, kind: EditableKind): string {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return ""
  if (kind === "fraction100") return String(Math.round(raw * 10000) / 100)
  if (kind === "currency") return String(Math.round(raw * 100) / 100)
  return String(raw)
}

/** Converte o número digitado (na unidade de exibição) → valor nativo. */
function fromInput(text: string, kind: EditableKind): number | null {
  const n = Number(text.replace(",", "."))
  if (!Number.isFinite(n)) return null
  if (kind === "fraction100") return n / 100
  return n
}

export function EditableNumber({ path, raw, display, kind }: EditableNumberProps) {
  const ctx = useReportEdit()
  if (!ctx) return <>{display}</>

  if (ctx.editing) {
    const value = toInput(raw, kind)
    const suffix = kind === "rate100" || kind === "fraction100" ? "%" : ""
    const width = Math.max(4, value.length + suffix.length + 1)
    return (
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 2 }}>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const parsed = fromInput(e.target.value, kind)
            if (parsed !== null) ctx.setValue(path, parsed)
            else if (e.target.value === "") ctx.setValue(path, 0)
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            font: "inherit",
            color: "inherit",
            width: `${width}ch`,
            maxWidth: "100%",
            background: "rgba(217,119,6,0.12)",
            border: "1px solid #D97706",
            borderRadius: 4,
            padding: "0 3px",
            textAlign: "inherit" as React.CSSProperties["textAlign"],
            outline: "none",
          }}
        />
        {suffix && <span style={{ font: "inherit" }}>{suffix}</span>}
      </span>
    )
  }

  // Modo visualização: marca overrides salvos com opção de restaurar.
  if (ctx.isOverridden(path)) {
    return (
      <span style={{ position: "relative", whiteSpace: "nowrap" }}>
        {display}
        <sup
          title="Número editado — clique para restaurar o original"
          onClick={(e) => {
            e.stopPropagation()
            ctx.resetField(path)
          }}
          style={{
            cursor: "pointer",
            color: "#D97706",
            fontSize: "0.6em",
            marginLeft: 2,
            fontWeight: 700,
            userSelect: "none",
          }}
        >
          ✎
        </sup>
      </span>
    )
  }
  return <>{display}</>
}

// ─── EditableText (nomes de campanha/flow) ──────────────────────────────

interface EditableTextProps {
  path: string
  value: string
}

export function EditableText({ path, value }: EditableTextProps) {
  const ctx = useReportEdit()
  if (!ctx) return <>{value}</>

  if (ctx.editing) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => ctx.setValue(path, e.target.value)}
        onClick={(e) => e.stopPropagation()}
        style={{
          font: "inherit",
          color: "inherit",
          width: `${Math.max(6, value.length + 1)}ch`,
          maxWidth: "100%",
          background: "rgba(217,119,6,0.12)",
          border: "1px solid #D97706",
          borderRadius: 4,
          padding: "0 3px",
          outline: "none",
        }}
      />
    )
  }

  if (ctx.isOverridden(path)) {
    return (
      <span style={{ whiteSpace: "nowrap" }}>
        {value}
        <sup
          title="Nome editado — clique para restaurar o original"
          onClick={(e) => {
            e.stopPropagation()
            ctx.resetField(path)
          }}
          style={{
            cursor: "pointer",
            color: "#D97706",
            fontSize: "0.6em",
            marginLeft: 2,
            fontWeight: 700,
            userSelect: "none",
          }}
        >
          ✎
        </sup>
      </span>
    )
  }
  return <>{value}</>
}
