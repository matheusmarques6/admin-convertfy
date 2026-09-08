"use client"

/**
 * Execução manual no Estúdio: o bloco "Nesta execução" do painel do nó e a
 * barra de disparo.
 *
 * O gesto é o do n8n: os overrides são um RASCUNHO que se monta clicando
 * nos nós, e nada acontece até "Disparar". A diferença é que aqui a régua
 * de degradação (`agents/execucao/overrides.ts`) roda no rascunho ANTES do
 * disparo — desativar o Curador não vira uma execução que morre 220s
 * depois, vira um aviso na tela e um botão desabilitado.
 *
 * A MESMA `validarOverrides` roda no servidor. Isto aqui é conveniência,
 * não segurança.
 */

import { useMemo } from "react"
import { Ban, Pin, PinOff, Play, Square, Trash2, Zap } from "lucide-react"

import { C, F, TNUM } from "@/components/email-generation/ui/eg-theme"
import {
  DEGRADACAO,
  NOS_COM_OVERRIDE,
  resumirOverrides,
  validarOverrides,
  type ExecutionOverrides,
} from "@/lib/agents/execucao/overrides"
import { AGENT_VISUAL, type PipelineAgentKey } from "@/lib/agents/agent-visual"
import { StudioBtn } from "./studio-atoms"

const PIN = { kind: "reusar" } as const

export const RASCUNHO_VAZIO: ExecutionOverrides = {}

const nomeDoNo = (node: string): string =>
  AGENT_VISUAL[node as PipelineAgentKey]?.name ?? node

// ── Operações puras sobre o rascunho ───────────────────────────────────
//
// Exportadas e testadas: são elas que garantem que desativar e pinar são
// EXCLUSIVOS. Um nó nas duas listas não é estado ilegal (o `gateFor` faz o
// pin vencer), mas é estado confuso — a tela mostraria dois selos e o
// operador não saberia qual valeu.

export function alternarDesativado(
  ov: ExecutionOverrides,
  node: string,
): ExecutionOverrides {
  const disabled = new Set(ov.disabled ?? [])
  const pinned = { ...(ov.pinned ?? {}) }
  if (disabled.has(node)) disabled.delete(node)
  else {
    disabled.add(node)
    delete pinned[node]
  }
  return limpar({ ...ov, disabled: [...disabled], pinned })
}

export function alternarPin(
  ov: ExecutionOverrides,
  node: string,
): ExecutionOverrides {
  const pinned = { ...(ov.pinned ?? {}) }
  const disabled = new Set(ov.disabled ?? [])
  if (pinned[node]) delete pinned[node]
  else {
    pinned[node] = PIN
    disabled.delete(node)
  }
  return limpar({ ...ov, pinned, disabled: [...disabled] })
}

export function alternarParada(
  ov: ExecutionOverrides,
  node: string,
): ExecutionOverrides {
  return limpar({ ...ov, stop_after: ov.stop_after === node ? null : node })
}

/** Tira as chaves vazias — o rascunho limpo tem de ser `{}`, não `{disabled:[]}`. */
function limpar(ov: ExecutionOverrides): ExecutionOverrides {
  const out: ExecutionOverrides = {}
  if (ov.disabled && ov.disabled.length > 0) out.disabled = ov.disabled
  if (ov.pinned && Object.keys(ov.pinned).length > 0) out.pinned = ov.pinned
  if (ov.stop_after) out.stop_after = ov.stop_after
  if (ov.start_from) out.start_from = ov.start_from
  return out
}

export function rascunhoVazio(ov: ExecutionOverrides): boolean {
  return Object.keys(limpar(ov)).length === 0
}

// ── UI ─────────────────────────────────────────────────────────────────

function Selo({
  tone,
  children,
}: {
  tone: "neg" | "warn" | "info"
  children: React.ReactNode
}) {
  const map = {
    neg: { c: C.neg, bg: C.negBg, b: C.negBorder },
    warn: { c: C.warn, bg: C.warnBg, b: C.warnBorder },
    info: { c: C.brand, bg: C.blue50, b: C.border },
  } as const
  const s = map[tone]
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        color: s.c,
        background: s.bg,
        border: `1px solid ${s.b}`,
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

/** O bloco "Nesta execução" do painel do nó. */
export function NoNaExecucaoManual({
  nodeKey,
  rascunho,
  onRascunho,
  disparando,
  onDispararSoEste,
}: {
  nodeKey: string
  rascunho: ExecutionOverrides
  onRascunho: (ov: ExecutionOverrides) => void
  disparando: boolean
  onDispararSoEste: () => void
}) {
  if (!NOS_COM_OVERRIDE.includes(nodeKey)) return null

  const desativado = (rascunho.disabled ?? []).includes(nodeKey)
  const pinado = Boolean(rascunho.pinned?.[nodeKey])
  const paraAqui = rascunho.stop_after === nodeKey
  const deg = DEGRADACAO[nodeKey]

  // O aviso que este bloco existe para dar: o que a execução perde se este
  // nó não rodar. Recusa aparece em vermelho porque o disparo não vai
  // acontecer — e diz como resolver.
  const aviso =
    desativado && deg
      ? { tone: deg.kind === "recusa" ? ("neg" as const) : ("warn" as const), texto: deg.motivo }
      : null

  const botao: React.CSSProperties = { height: 29, fontSize: 11.5, flex: 1, justifyContent: "center" }

  return (
    <div
      style={{
        margin: "0 0 14px",
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: C.g50,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: C.g400,
            fontFamily: F.sans,
          }}
        >
          Nesta execução
        </span>
        <span style={{ flex: 1 }} />
        {desativado && <Selo tone="neg">desativado</Selo>}
        {pinado && <Selo tone="info">pinado</Selo>}
        {paraAqui && <Selo tone="warn">para aqui</Selo>}
      </div>

      <div style={{ padding: "10px 12px" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <StudioBtn
            onClick={() => onRascunho(alternarDesativado(rascunho, nodeKey))}
            style={botao}
            title={
              deg
                ? `Se este nó não rodar: ${deg.motivo}`
                : "Não executa este nó nesta execução"
            }
          >
            <Ban size={12} /> {desativado ? "Reativar" : "Desativar"}
          </StudioBtn>
          <StudioBtn
            onClick={() => onRascunho(alternarPin(rascunho, nodeKey))}
            style={botao}
            title="Não executa e usa a saída que já está gravada"
          >
            {pinado ? <PinOff size={12} /> : <Pin size={12} />}{" "}
            {pinado ? "Despinar" : "Pinar"}
          </StudioBtn>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <StudioBtn
            onClick={() => onRascunho(alternarParada(rascunho, nodeKey))}
            style={botao}
            title="A execução termina depois deste nó e fica pausada"
          >
            <Square size={12} /> {paraAqui ? "Não parar" : "Parar aqui"}
          </StudioBtn>
          <StudioBtn
            variant="primary"
            onClick={onDispararSoEste}
            disabled={disparando}
            style={botao}
            title="Pina tudo antes, roda só este nó e para. É o 'Execute step' do n8n — sem re-executar os anteriores."
          >
            <Zap size={12} /> Rodar só este
          </StudioBtn>
        </div>

        {aviso && (
          <div
            style={{
              marginTop: 9,
              fontSize: 11.5,
              lineHeight: 1.5,
              color: aviso.tone === "neg" ? C.neg : C.warn,
              fontFamily: F.sans,
            }}
          >
            {aviso.texto}
          </div>
        )}
        {pinado && (
          <div
            style={{
              marginTop: 9,
              fontSize: 11.5,
              lineHeight: 1.5,
              color: C.g500,
              fontFamily: F.sans,
            }}
          >
            A saída gravada deste nó vale — nada de LLM aqui, e o custo dele
            sai da conta.
          </div>
        )}
      </div>
    </div>
  )
}

/** A barra de disparo, quando há rascunho. */
export function BarraDeExecucaoManual({
  rascunho,
  onLimpar,
  onDisparar,
  disparando,
  recusasDoServidor,
}: {
  rascunho: ExecutionOverrides
  onLimpar: () => void
  onDisparar: () => void
  disparando: boolean
  recusasDoServidor: Array<{ node: string; motivo: string }> | null
}) {
  const recusas = useMemo(() => validarOverrides(rascunho), [rascunho])
  const todas = [...recusas, ...(recusasDoServidor ?? [])]
  if (rascunhoVazio(rascunho)) return null

  return (
    <div
      style={{
        borderTop: `1px solid ${C.border}`,
        background: todas.length > 0 ? C.negBg : C.blue50,
        padding: "9px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 7,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: C.g900,
            fontFamily: F.sans,
            ...TNUM,
          }}
        >
          Execução manual: {resumirOverrides(rascunho)}
        </span>
        <span style={{ flex: 1 }} />
        <StudioBtn onClick={onLimpar} style={{ height: 30, fontSize: 11.5 }}>
          <Trash2 size={12} /> Limpar
        </StudioBtn>
        <StudioBtn
          variant="primary"
          onClick={onDisparar}
          disabled={disparando || todas.length > 0}
          style={{ height: 30, fontSize: 11.5 }}
          title={
            todas.length > 0
              ? "Corrija os avisos abaixo — a execução não vai gastar nada assim"
              : "Cria a execução manual e dispara"
          }
        >
          <Play size={12} /> {disparando ? "Disparando…" : "Disparar"}
        </StudioBtn>
      </div>
      {todas.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {todas.map((r, i) => (
            <span
              key={`${r.node}-${i}`}
              style={{
                fontSize: 11.5,
                lineHeight: 1.5,
                color: C.neg,
                fontFamily: F.sans,
              }}
            >
              <strong>{nomeDoNo(r.node)}:</strong> {r.motivo}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Projeta o rascunho sobre os nós do canvas: quem não vai rodar aparece
 * como `pulado` ANTES de disparar.
 *
 * É o feedback que o n8n dá pintando o nó desativado. Reusa o status que o
 * canvas já sabe desenhar em vez de inventar um sexto — e a intenção
 * (desativado × pinado) fica no painel, que é onde ela cabe.
 */
export function projetarRascunho<T extends { status: string }>(
  runs: Record<string, T> | null,
  rascunho: ExecutionOverrides,
): Record<string, T> | null {
  if (!runs || rascunhoVazio(rascunho)) return runs
  const foraDoJogo = new Set([
    ...(rascunho.disabled ?? []),
    ...Object.keys(rascunho.pinned ?? {}),
  ])
  if (foraDoJogo.size === 0) return runs
  const out: Record<string, T> = { ...runs }
  for (const node of foraDoJogo) {
    if (out[node]) out[node] = { ...out[node], status: "pulado" }
  }
  return out
}

/** Selo da execução manual viva, para o cabeçalho da aba. */
export function SeloExecucaoManual({
  status,
  paradoEm,
}: {
  status: "running" | "paused"
  paradoEm: string | null
}) {
  return (
    <Selo tone={status === "paused" ? "warn" : "info"}>
      {status === "paused"
        ? `manual · pausada${paradoEm ? ` em ${nomeDoNo(paradoEm)}` : ""}`
        : "manual · em curso"}
    </Selo>
  )
}
