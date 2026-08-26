"use client"

/**
 * PromptProvenanceView — o prompt de uma run mostrado por ORIGEM.
 *
 * Porte do render dos artifacts "Anatomia de uma Geração" e "Ensaio de
 * Geração" (mesmas 7 classes, mesmas cores): cada bloco do prompt aparece
 * com uma faixa colorida e o rótulo da fonte — template do agente, dados da
 * loja, biblioteca, saída de agente anterior, curadoria, vault, derivado por
 * código. É o que responde "de onde veio isso?" sem reconstrução manual.
 *
 * Segmento grande (o catálogo de ~120k do Curador) chega como `{ref, sha8}`
 * e é carregado sob demanda pelo endpoint /api/admin/agents/prompt-segment,
 * que confere o sha8 e avisa quando a biblioteca mudou desde a run.
 */

import { useState } from "react"

import { C, F } from "@/components/email-generation/ui/eg-theme"
import {
  PROV_CLASS_META,
  type InputSummaryItem,
  type PromptSegment,
  type ProvClass,
} from "@/lib/agents/shared/prompt-provenance"

import { CodeBlock, Spinner } from "./studio-atoms"

function meta(cls: ProvClass) {
  return PROV_CLASS_META[cls] ?? PROV_CLASS_META.sistema
}

function Chip({ cls, children }: { cls: ProvClass; children: React.ReactNode }) {
  const m = meta(cls)
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        color: m.color,
        background: m.bg,
        border: `1px solid ${m.border}`,
        borderRadius: 999,
        padding: "1px 8px",
        fontFamily: F.sans,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  )
}

/** Legenda: só as classes presentes — legenda de 7 num prompt de 3 é ruído. */
function Legend({ classes }: { classes: ProvClass[] }) {
  if (classes.length === 0) return null
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
      {classes.map((cls) => (
        <Chip key={cls} cls={cls}>
          {meta(cls).label}
        </Chip>
      ))}
    </div>
  )
}

interface ResolvedRef {
  texto: string
  stale: boolean
  chars: number
  sha8: string
}

function RefSegment({ seg }: { seg: PromptSegment }) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle")
  const [data, setData] = useState<ResolvedRef | null>(null)

  const load = async () => {
    setState("loading")
    try {
      const qs = new URLSearchParams({ ref: seg.ref ?? "" })
      if (seg.sha8) qs.set("sha8", seg.sha8)
      const res = await fetch(`/api/admin/agents/prompt-segment?${qs.toString()}`)
      if (!res.ok) throw new Error(String(res.status))
      const json = (await res.json()) as { data?: ResolvedRef } & Partial<ResolvedRef>
      const payload = json.data ?? (json as ResolvedRef)
      setData({
        texto: payload.texto ?? "",
        stale: Boolean(payload.stale),
        chars: payload.chars ?? 0,
        sha8: payload.sha8 ?? "",
      })
      setState("idle")
    } catch {
      setState("error")
    }
  }

  return (
    <div style={{ padding: "10px 12px" }}>
      {data ? (
        <>
          {data.stale && (
            <div
              style={{
                marginBottom: 8,
                padding: "7px 10px",
                borderRadius: 6,
                background: "#FFFBEB",
                border: "1px solid #FDE68A",
                fontSize: 11.5,
                color: "#B45309",
                fontFamily: F.sans,
                lineHeight: 1.5,
              }}
            >
              A biblioteca mudou desde esta execução (sha8 da run{" "}
              <code>{seg.sha8}</code> · atual <code>{data.sha8}</code>). O texto
              abaixo é o catálogo de HOJE, não o que o agente viu.
            </div>
          )}
          <CodeBlock text={data.texto} />
        </>
      ) : (
        <button
          onClick={load}
          disabled={state === "loading"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "7px 12px",
            borderRadius: 6,
            border: `1px solid ${C.border}`,
            background: C.white,
            color: C.g900,
            fontSize: 12,
            fontWeight: 500,
            fontFamily: F.sans,
            cursor: state === "loading" ? "default" : "pointer",
          }}
        >
          {state === "loading" && <Spinner />}
          {state === "error"
            ? "Falhou ao carregar — tentar de novo"
            : `Carregar conteúdo (${seg.chars.toLocaleString("pt-BR")} chars)`}
        </button>
      )}
      {!data && state !== "error" && (
        <div style={{ marginTop: 6, fontSize: 11, color: C.g400, fontFamily: F.sans }}>
          Não viaja na execução (é idêntico entre lojas); resolvido por
          conteúdo e conferido pelo sha8 <code>{seg.sha8 ?? "—"}</code>.
        </div>
      )}
    </div>
  )
}

function Segment({ seg }: { seg: PromptSegment }) {
  const m = meta(seg.cls)
  return (
    <div
      style={{
        margin: "8px 0",
        borderRadius: 7,
        overflow: "hidden",
        border: `1px solid ${C.border}`,
        borderLeft: `4px solid ${m.border}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "5px 11px",
          background: m.bg,
          color: m.color,
          borderBottom: `1px solid ${C.border}`,
          fontSize: 11,
          fontWeight: 600,
          fontFamily: F.sans,
          letterSpacing: "0.02em",
        }}
      >
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
          {seg.rotulo}
        </span>
        <span style={{ opacity: 0.75, whiteSpace: "nowrap", fontWeight: 500 }}>
          {seg.chars.toLocaleString("pt-BR")}
        </span>
      </div>
      {seg.ref ? <RefSegment seg={seg} /> : <CodeBlock text={seg.texto ?? ""} />}
    </div>
  )
}

/** Prompt segmentado por proveniência. */
export function PromptProvenanceView({ segments }: { segments: PromptSegment[] }) {
  const classes = Array.from(new Set(segments.map((s) => s.cls)))
  // A fronteira system/user importa: são duas mensagens diferentes para o
  // modelo, e o system é o pedaço cacheável.
  const partes: Array<["system" | "user" | "outros", PromptSegment[]]> = [
    ["system", segments.filter((s) => s.parte === "system")],
    ["user", segments.filter((s) => s.parte === "user")],
    ["outros", segments.filter((s) => s.parte !== "system" && s.parte !== "user")],
  ]
  const rotuloParte: Record<string, string> = {
    system: "SYSTEM",
    user: "USER",
    outros: "PROMPT",
  }

  return (
    <div>
      <Legend classes={classes} />
      {partes.map(([parte, segs]) =>
        segs.length === 0 ? null : (
          <div key={parte} style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: C.g400,
                fontFamily: F.sans,
                letterSpacing: "0.08em",
              }}
            >
              {rotuloParte[parte]}
            </div>
            {segs.map((seg, i) => (
              <Segment key={`${parte}-${i}`} seg={seg} />
            ))}
          </div>
        ),
      )}
    </div>
  )
}

/** Entrada estruturada: o que o agente recebeu, com a origem de cada item. */
export function InputSummaryView({ items }: { items: InputSummaryItem[] }) {
  return (
    <div>
      <Legend classes={Array.from(new Set(items.map((i) => i.cls)))} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item, i) => (
          <div
            key={`${item.rotulo}-${i}`}
            style={{
              padding: "9px 11px",
              borderRadius: 7,
              border: `1px solid ${C.border}`,
              borderLeft: `4px solid ${meta(item.cls).border}`,
              background: C.white,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                marginBottom: 4,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.g900,
                  fontFamily: F.sans,
                }}
              >
                {item.rotulo}
              </span>
              <Chip cls={item.cls}>{meta(item.cls).label}</Chip>
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: C.g400,
                fontFamily: F.sans,
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {item.valor || "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
