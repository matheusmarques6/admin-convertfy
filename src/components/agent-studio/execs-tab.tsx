"use client"

/**
 * Estúdio de Agentes — aba Execuções: lista de execuções (uma por email
 * gerado), fluxo da execução projetado no canvas e detalhe por nó
 * (entrada, prompt, saída, custo) com re-execução real.
 *
 * Re-execução usa as alavancas EXISTENTES do pipeline:
 *   - fase 2 (phase2_only) e pipeline completo (full_pipeline) via
 *     POST /api/admin/stores/[id]/generate-email;
 *   - fase 1 via POST /api/admin/stores/[id]/generate-blueprints.
 */

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { Copy as CopyIcon, X, Zap } from "lucide-react"

import { C, F, TNUM } from "@/components/email-generation/ui/eg-theme"
import {
  RUN_STYLE,
  STUDIO_NODE_BY_KEY,
  execCostUsd,
  fmtDur,
  nodeMeta,
  projectRuns,
  rerunPlanFor,
  type NodeRun,
} from "@/lib/agents/studio-graph"
import { FlowCanvas, type Positions } from "./flow-canvas"
import { CodeBlock, Spinner, StudioBtn, fmtTok, usd3 } from "./studio-atoms"
import {
  EstruturadorEmbasamento,
  AgentFeedback,
  AgentOrientacoes,
} from "./estruturador-panel"
import { AgentOutputView } from "./agent-output-views"
import {
  InputSummaryView,
  PromptProvenanceView,
} from "./prompt-provenance-view"
import {
  useAgentExecutionsLive,
  type LiveStatus,
} from "@/hooks/use-agent-executions-live"
import {
  overridesSoEsteNo,
  type ExecutionOverrides,
} from "@/lib/agents/execucao/overrides"
import {
  BarraDeExecucaoManual,
  NoNaExecucaoManual,
  RASCUNHO_VAZIO,
  SeloExecucaoManual,
  projetarRascunho,
} from "./execucao-manual"
import type { ExecutionRow, RunDetailPayload } from "./studio-data"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()
  const hm = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  if (sameDay) return `Hoje, ${hm}`
  if (isYesterday) return `Ontem, ${hm}`
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}, ${hm}`
}

function execDurationSec(e: ExecutionRow): number | null {
  const total = e.runs.reduce(
    (s, r) => s + (r.duration_ms != null ? r.duration_ms : 0),
    0,
  )
  return total > 0 ? total / 1000 : null
}

function ExecStatusText({ e }: { e: ExecutionRow }) {
  const dur = execDurationSec(e)
  const map = {
    success: { c: C.pos, t: `Sucesso em ${fmtDur(dur)}` },
    error: { c: "#991B1B", t: `Erro em ${fmtDur(dur)}` },
    running: { c: C.info, t: "Em andamento…" },
  } as const
  const s = map[e.bucket]
  return (
    <span
      style={{ fontSize: 11.5, color: s.c, fontFamily: F.sans, fontWeight: 500, ...TNUM }}
    >
      {s.t}
    </span>
  )
}

/**
 * Selo do tempo real. Substituiu o checkbox "Auto refresh" (set/2026): ele
 * ligava e desligava um poll de 10s, e a pergunta que o operador fazia
 * olhando para a lista não era "quero atualizar?" — era "isto está vivo?".
 * O que ele protegia (a lista se mexer embaixo do que se está lendo) passou
 * a ser resolvido pela seleção explícita, não por congelar o dado.
 */
function LiveBadge({ status }: { status: LiveStatus }) {
  const map: Record<LiveStatus, { c: string; bg: string; b: string; t: string }> = {
    live: { c: C.pos, bg: C.posBg, b: C.posBorder, t: "ao vivo" },
    reconnecting: { c: C.warn, bg: C.warnBg, b: C.warnBorder, t: "reconectando" },
    polling: { c: C.g500, bg: C.g100, b: C.border, t: "a cada 5s" },
  }
  const s = map[status]
  return (
    <span
      title={
        status === "live"
          ? "Os nós acendem no instante em que o agente começa. Um step de LLM não reporta progresso interno — fica “rodando” até terminar."
          : status === "reconnecting"
            ? "Conexão ao vivo caiu; tentando de novo."
            : "Sem conexão ao vivo — atualizando pela listagem a cada 5s."
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "1px 7px",
        borderRadius: 4,
        background: s.bg,
        border: `1px solid ${s.b}`,
        fontSize: 10.5,
        fontWeight: 600,
        color: s.c,
        fontFamily: F.sans,
        whiteSpace: "nowrap",
      }}
    >
      <span
        className={status === "live" ? "cf-studio-pulse" : undefined}
        style={{ width: 5, height: 5, borderRadius: "50%", background: s.c }}
      />
      {s.t}
    </span>
  )
}

function ExecList({
  executions,
  active,
  onPick,
  liveStatus,
  loading,
}: {
  executions: ExecutionRow[]
  active: string | null
  onPick: (id: string) => void
  liveStatus: LiveStatus
  loading: boolean
}) {
  return (
    <aside
      style={{
        width: 248,
        flexShrink: 0,
        background: C.white,
        borderRight: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "13px 14px",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <span style={{ fontSize: 13.5, fontWeight: 600, color: C.g900, fontFamily: F.sans }}>
          Execuções
        </span>
        <LiveBadge status={liveStatus} />
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {executions.map((e) => {
          const on = active === e.email_id
          return (
            <div
              key={e.email_id}
              onClick={() => onPick(e.email_id)}
              tabIndex={0}
              style={{
                padding: "10px 14px",
                cursor: "pointer",
                borderBottom: `1px solid ${C.g100}`,
                background: on ? C.blue50 : "transparent",
                borderLeft: on ? `3px solid ${C.brand}` : "3px solid transparent",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: C.g900,
                    fontFamily: F.sans,
                    ...TNUM,
                  }}
                >
                  {fmtWhen(e.updated_at)}
                </span>
                {e.bucket === "error" && (
                  <span style={{ color: "#991B1B", display: "flex" }}>
                    <X size={12} />
                  </span>
                )}
                {e.bucket === "running" && <Spinner size={10} />}
              </div>
              <div style={{ marginTop: 2 }}>
                <ExecStatusText e={e} />
              </div>
              <div
                style={{
                  marginTop: 3,
                  fontSize: 11,
                  color: C.g400,
                  fontFamily: F.sans,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {e.store_name} · {e.email_name}
              </div>
            </div>
          )
        })}
        {!loading && executions.length === 0 && (
          <div
            style={{
              padding: "24px 14px",
              fontSize: 12,
              color: C.g400,
              fontFamily: F.sans,
              lineHeight: 1.5,
            }}
          >
            Nenhuma execução do pipeline registrada ainda.
          </div>
        )}
      </div>
      <div
        style={{
          padding: "10px 14px",
          borderTop: `1px solid ${C.border}`,
          fontSize: 11,
          color: C.g400,
          fontFamily: F.sans,
          ...TNUM,
        }}
      >
        {executions.length} execuções recentes
      </div>
    </aside>
  )
}

function metric(l: string, v: string) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: C.g400,
          fontFamily: F.sans,
        }}
      >
        {l}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: C.g900,
          fontFamily: F.sans,
          ...TNUM,
          marginTop: 2,
        }}
      >
        {v}
      </div>
    </div>
  )
}

function stringify(v: unknown): string {
  if (v == null) return "—"
  if (typeof v === "string") return v
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

// ── Tabela campo a campo do merge (copy_merge / image_format) ─────────
// Decisão 20/08: o log dos merges determinísticos é CAMPO A CAMPO — a
// tabela é o radar operacional dos sem_lugar/ambíguos (fail-open). O JSON
// bruto permanece logo abaixo.

interface CampoMergeRow {
  block_id?: string | null
  key?: string
  desfecho?: string
  motivo?: string
  de?: string | null
  para?: string | null
}

const DESFECHO_TONE: Record<string, { c: string; bg: string; b: string }> = {
  ancorado_exemplo: { c: "#065F46", bg: "#ECFDF5", b: "#A7F3D0" },
  ancorado_token: { c: "#065F46", bg: "#ECFDF5", b: "#A7F3D0" },
  estrutural: { c: "#0F766E", bg: "#F0FDFA", b: "#99F6E4" },
  imagem_sem_url: { c: "#92400E", bg: "#FFFBEB", b: "#FDE68A" },
  ambiguo: { c: "#92400E", bg: "#FFFBEB", b: "#FDE68A" },
  sem_lugar: { c: "#991B1B", bg: "#FEF2F2", b: "#FECACA" },
}

interface TextoOrfaoRow {
  texto?: string
  suspeito?: boolean
}

/**
 * Texto do documento que NENHUM campo do schema endereça.
 *
 * O contrapeso da tabela acima: ela mostra o que foi escrito, esta mostra o
 * que ninguém tinha autorização para escrever. Em 28/08 o Welcome 1 da
 * InnovaBay fechou 56/56 mergeados e mesmo assim saiu com "SELO 1 / OFF 1"
 * nos cards — o selo era texto fixo da variante, fora do output_schema, e
 * por isso nunca entrou no payload do n8n. Suspeito = vocabulário de
 * exemplo da biblioteca; o resto é texto fixo, que também vai como está.
 */
function TextoOrfaoBox({
  trechos,
  total,
}: {
  trechos: TextoOrfaoRow[]
  total?: number
}) {
  if (trechos.length === 0) return null
  const suspeitos = trechos.filter((t) => t.suspeito)
  return (
    <div
      style={{
        marginBottom: 12,
        border: `1px solid ${suspeitos.length > 0 ? C.warnBorder : C.border}`,
        background: suspeitos.length > 0 ? C.warnBg : C.g50,
        borderRadius: 8,
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: C.g400,
          marginBottom: 6,
        }}
      >
        Texto que nenhum campo escreve
        {typeof total === "number" && total > trechos.length
          ? ` — ${trechos.length} de ${total}`
          : ""}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {trechos.map((t, i) => (
          <span
            key={i}
            style={{
              fontFamily: F.mono,
              fontSize: 11,
              padding: "2px 6px",
              borderRadius: 4,
              border: `1px solid ${t.suspeito ? C.warnBorder : C.border}`,
              background: C.white,
              color: t.suspeito ? C.warn : C.g500,
              maxWidth: 280,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {t.texto ?? ""}
          </span>
        ))}
      </div>
      {suspeitos.length > 0 && (
        <div style={{ fontSize: 11, color: C.warn, marginTop: 8 }}>
          {suspeitos.length} com cara de exemplo da biblioteca — cadastrar o
          campo no output_schema da variante (aba Componentes). Sem contrato,
          o trecho não vai ao n8n e ninguém escreve ali.
        </div>
      )}
    </div>
  )
}

function CopyMergeFieldTable({ campos }: { campos: CampoMergeRow[] }) {
  if (campos.length === 0) return null
  const cell: React.CSSProperties = {
    padding: "5px 8px",
    fontSize: 11.5,
    fontFamily: F.sans,
    color: C.g900,
    borderBottom: `1px solid ${C.border}`,
    verticalAlign: "top",
    wordBreak: "break-word",
  }
  return (
    <div
      style={{
        marginBottom: 12,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: C.g50 }}>
            {["Campo", "Desfecho", "De → Para"].map((h) => (
              <th
                key={h}
                style={{
                  ...cell,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: C.g400,
                  textAlign: "left",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {campos.map((c, i) => {
            const tone =
              DESFECHO_TONE[c.desfecho ?? ""] ?? {
                c: C.g400,
                bg: C.g50,
                b: C.border,
              }
            return (
              <tr key={`${c.key}-${i}`}>
                <td style={{ ...cell, whiteSpace: "nowrap", fontWeight: 600 }}>
                  {c.key ?? "—"}
                </td>
                <td style={{ ...cell, whiteSpace: "nowrap" }}>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: tone.c,
                      background: tone.bg,
                      border: `1px solid ${tone.b}`,
                      borderRadius: 999,
                      padding: "1px 8px",
                    }}
                  >
                    {c.desfecho ?? "—"}
                  </span>
                  {c.motivo && (
                    <div style={{ fontSize: 10.5, color: C.g400, marginTop: 2 }}>
                      {c.motivo}
                    </div>
                  )}
                </td>
                <td style={cell}>
                  {c.de || c.para ? (
                    <>
                      {c.de && (
                        <span style={{ color: C.g400, textDecoration: "line-through" }}>
                          {c.de}
                        </span>
                      )}
                      {c.de && c.para && " → "}
                      {c.para && <span>{c.para}</span>}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function NodeRunPanel({
  exec,
  nodeKey,
  run,
  onClose,
  onRerun,
  rerunning,
  rascunho,
  onRascunho,
  onSoEsteNo,
}: {
  exec: ExecutionRow
  nodeKey: string
  run: NodeRun
  onClose: () => void
  onRerun: (mode: "phase2" | "full_pipeline" | "blueprints") => void
  rerunning: boolean
  /**
   * Rascunho de overrides da execução manual. Ausente na aba Teste, que
   * dispara pelo hook antigo — o bloco "Nesta execução" simplesmente não
   * aparece lá.
   */
  rascunho?: ExecutionOverrides
  onRascunho?: (ov: ExecutionOverrides) => void
  onSoEsteNo?: (node: string) => void
}) {
  const [tab, setTab] = useState<"input" | "prompt" | "output">("input")
  const n = STUDIO_NODE_BY_KEY[nodeKey]
  const { data: detail } = useSWR<RunDetailPayload>(
    run.runId ? `/api/admin/email-generation-logs/${run.runId}` : null,
    fetcher,
  )
  if (!n) return null
  const meta = nodeMeta(n)
  const st = RUN_STYLE[run.status]
  const rerun = rerunPlanFor(nodeKey)

  const hasDetail = run.runId != null
  const tabs: Array<["input" | "prompt" | "output", string]> = hasDetail
    ? [
        ["input", "Entrada"],
        ["prompt", "Prompt"],
        ["output", "Saída"],
      ]
    : [["input", "Entrada"]]

  const bodyText = !hasDetail
    ? n.type === "trigger"
      ? stringify({
          event: "pesquisa.completa",
          store: exec.store_name,
          email: exec.email_name,
          type: exec.flow_type_label,
        })
      : n.type === "output"
        ? stringify({ status: exec.email_status, email: exec.email_name })
        : "Sem run registrada para este nó nesta execução."
    : tab === "input"
      ? stringify(detail?.input_vars)
      : tab === "prompt"
        ? (detail?.rendered_prompt ?? "— sem prompt renderizado registrado —")
        : (detail?.raw_output ?? stringify(detail?.parsed_output))

  // Proveniência (migration 20261085): quando a run tem segments/summary, as
  // abas Prompt e Entrada mostram a versão marcada por origem. Ausente (runs
  // anteriores, agentes ainda não migrados) → o texto plano de sempre.
  const segments = detail?.prompt_segments ?? null
  const summary = detail?.input_summary ?? null
  const showProvPrompt = tab === "prompt" && hasDetail && (segments?.length ?? 0) > 0
  const showProvInput = tab === "input" && hasDetail && (summary?.length ?? 0) > 0

  const copyJson = () => {
    const payload = hasDetail
      ? stringify({
          input_vars: detail?.input_vars ?? null,
          input_summary: detail?.input_summary ?? null,
          rendered_prompt: detail?.rendered_prompt ?? null,
          prompt_segments: detail?.prompt_segments ?? null,
          raw_output: detail?.raw_output ?? null,
          parsed_output: detail?.parsed_output ?? null,
        })
      : bodyText
    void navigator.clipboard?.writeText(payload)
  }

  return (
    <aside
      style={{
        width: 400,
        flexShrink: 0,
        background: C.white,
        borderLeft: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "13px 16px",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: meta.bg,
            border: `1px solid ${meta.border}`,
            color: meta.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontSize: 13,
            fontWeight: 700,
            fontFamily: F.sans,
          }}
        >
          {meta.name.slice(0, 1)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.g900, fontFamily: F.sans }}>
            {meta.name}
          </div>
          <div style={{ fontSize: 11, color: C.g400, fontFamily: F.sans, ...TNUM }}>
            {detail?.model ?? meta.sub}
          </div>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: st.c,
            background: st.bg,
            border: `1px solid ${st.b}`,
            borderRadius: 999,
            padding: "2px 9px",
            fontFamily: F.sans,
          }}
        >
          {run.status === "sucesso" ? "Sucesso" : run.status === "erro" ? "Erro" : st.label}
        </span>
        <button
          onClick={onClose}
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            border: "none",
            background: "transparent",
            color: C.g400,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={15} />
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 14,
          padding: "12px 16px",
          borderBottom: `1px solid ${C.border}`,
          background: C.g50,
        }}
      >
        {metric("Tempo", fmtDur(run.durSec))}
        {metric("Custo", run.usd != null && run.usd > 0 ? usd3(run.usd) : "—")}
        {metric(
          "Tokens",
          run.tokIn != null
            ? `${fmtTok(run.tokIn)} → ${fmtTok(run.tokOut ?? 0)}`
            : "—",
        )}
        {metric("Retries", run.retries != null ? String(run.retries) : "—")}
        {/* Só aparece quando o nó agrega mais de uma run (imagem por slot). */}
        {run.count != null && run.count > 1
          ? metric("Imagens", `${run.count - (run.failed ?? 0)}/${run.count}`)
          : null}
      </div>

      {run.err && (
        <div
          style={{
            margin: "12px 16px 0",
            padding: "9px 12px",
            borderRadius: 8,
            background: C.negBg,
            border: `1px solid ${C.negBorder}`,
            fontSize: 12,
            color: "#991B1B",
            fontFamily: F.sans,
            lineHeight: 1.5,
          }}
        >
          {run.err}
        </div>
      )}

      {rascunho && onRascunho && (
        <div style={{ padding: "12px 16px 0" }}>
          <NoNaExecucaoManual
            nodeKey={nodeKey}
            rascunho={rascunho}
            onRascunho={onRascunho}
            disparando={rerunning}
            onDispararSoEste={() => onSoEsteNo?.(nodeKey)}
          />
        </div>
      )}

      <div style={{ display: "flex", gap: 2, padding: "12px 16px 0" }}>
        {tabs.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              padding: "6px 13px",
              borderRadius: "7px 7px 0 0",
              border: "none",
              borderBottom: tab === k ? `2px solid ${C.brand}` : "2px solid transparent",
              background: "transparent",
              color: tab === k ? C.g900 : C.g400,
              fontSize: 12.5,
              fontWeight: tab === k ? 600 : 500,
              fontFamily: F.sans,
              cursor: "pointer",
            }}
          >
            {l}
          </button>
        ))}
      </div>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 16,
          borderTop: `1px solid ${C.border}`,
        }}
      >
        {tab === "output" &&
          n.agent === "copy_merge" &&
          Array.isArray(
            (detail?.parsed_output as { texto_orfao?: unknown } | null)
              ?.texto_orfao,
          ) && (
            <TextoOrfaoBox
              trechos={
                (
                  detail?.parsed_output as {
                    texto_orfao: TextoOrfaoRow[]
                  }
                ).texto_orfao
              }
              total={
                (detail?.parsed_output as { texto_orfao_total?: number })
                  ?.texto_orfao_total
              }
            />
          )}
        {tab === "output" &&
          (n.agent === "copy_merge" || n.agent === "image_format") &&
          Array.isArray(
            (detail?.parsed_output as { campos?: unknown } | null)?.campos,
          ) && (
            <CopyMergeFieldTable
              campos={
                (detail?.parsed_output as { campos: CampoMergeRow[] }).campos
              }
            />
          )}
        {/* Estruturador: embasamento legível + ciclo de calibração (fase 4
            do ADR) — o JSON bruto continua logo abaixo. */}
        {tab === "output" && n.agent === "estruturador" && run.runId && (
          <>
            <EstruturadorEmbasamento output={detail?.parsed_output} />
            {/* Primeiro o que instrui as PRÓXIMAS gerações (efeito
                imediato), depois o julgamento DESTA run (vira rascunho de
                aprendizado do vault). São coisas diferentes. */}
            <AgentOrientacoes
              agente="estruturador"
              runId={run.runId}
              flowType={exec.flow_type}
              emailNumber={exec.email_number}
            />
            <AgentFeedback
              agente="estruturador"
              runId={run.runId}
              output={detail?.parsed_output}
              flowType={exec.flow_type}
              emailNumber={exec.email_number}
              storeName={exec.store_name}
              runIso={exec.updated_at}
            />
          </>
        )}
        {/* Curador: o mesmo ciclo (migration 20261111). Ele não decide a
            sequência — decide QUAL bloco da biblioteca ocupa cada posição —,
            então a orientação e o rascunho falam de escolha de bloco. Os
            escopos `flow:intencao`/`flow:progressao` ficam de fora: são o
            arco e a escada do fluxo, matéria do Estruturador. */}
        {tab === "output" && n.agent === "assembler_chooser" && run.runId && (
          <>
            <AgentOrientacoes
              agente="curador"
              runId={run.runId}
              flowType={exec.flow_type}
              emailNumber={exec.email_number}
              campos={["email", "flow", "global"]}
              titulo="Orientações ao Curador para as próximas gerações"
            />
            <AgentFeedback
              agente="curador"
              runId={run.runId}
              output={detail?.parsed_output}
              flowType={exec.flow_type}
              emailNumber={exec.email_number}
              storeName={exec.store_name}
              runIso={exec.updated_at}
            />
          </>
        )}
        {/* Saída legível da fase 1 (Curador, Montador, Blueprint, Assunto).
            Devolve null quando a run não tem o campo — o JSON cru abaixo
            continua sendo a verdade completa. */}
        {tab === "output" && (
          <AgentOutputView agent={n.agent} output={detail?.parsed_output} />
        )}
        {showProvPrompt && <PromptProvenanceView segments={segments!} />}
        {showProvInput && (
          <>
            <InputSummaryView items={summary!} />
            <div
              style={{
                margin: "14px 0 6px",
                fontSize: 10.5,
                fontWeight: 700,
                color: C.g400,
                fontFamily: F.sans,
                letterSpacing: "0.08em",
              }}
            >
              INPUT_VARS (cru)
            </div>
          </>
        )}
        {!showProvPrompt && <CodeBlock text={bodyText} />}
        {run.status === "pulado" && (
          <div style={{ marginTop: 10, fontSize: 11.5, color: C.g400, fontFamily: F.sans }}>
            Nó pulado nesta execução — sem saída registrada.
          </div>
        )}
      </div>

      <div
        style={{
          padding: "12px 16px",
          borderTop: `1px solid ${C.border}`,
          display: "flex",
          gap: 8,
        }}
      >
        <StudioBtn
          onClick={copyJson}
          style={{ flex: 1, height: 33, justifyContent: "center" }}
        >
          <CopyIcon size={13} /> Copiar JSON
        </StudioBtn>
        {rerun && (
          <StudioBtn
            onClick={() => onRerun(rerun.mode)}
            disabled={rerunning || exec.bucket === "running"}
            title={rerun.hint}
            style={{ flex: 1, height: 33, justifyContent: "center" }}
          >
            <Zap size={13} /> {rerunning ? "Disparando…" : rerun.label}
          </StudioBtn>
        )}
      </div>
    </aside>
  )
}

export function ExecutionsTab({ positions }: { positions: Positions }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [nodeKey, setNodeKey] = useState<string | null>(null)
  const [rerunning, setRerunning] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null)
  // Rascunho de overrides: monta-se clicando nos nós e nada acontece até
  // "Disparar" — o gesto do n8n. Zera ao trocar de execução, senão o
  // rascunho de uma peça vazaria para a outra.
  const [rascunho, setRascunho] = useState<ExecutionOverrides>(RASCUNHO_VAZIO)
  const [recusas, setRecusas] = useState<
    Array<{ node: string; motivo: string }> | null
  >(null)

  const {
    executions,
    status: liveStatus,
    isLoading,
    refresh,
  } = useAgentExecutionsLive(30)

  // A seleção é EXPLÍCITA a partir do primeiro carregamento. Com o fallback
  // `?? executions[0]`, uma geração nova entrando no topo trocava a
  // execução aberta embaixo de quem estava lendo o painel — o preço de a
  // lista ter virado tempo real.
  useEffect(() => {
    if (activeId == null && executions.length > 0) {
      setActiveId(executions[0].email_id)
    }
  }, [activeId, executions])

  const exec = executions.find((e) => e.email_id === activeId) ?? null

  const runs = useMemo(
    () => (exec ? projectRuns(exec.runs, exec.bucket) : null),
    [exec],
  )
  const cost = runs ? execCostUsd(runs) : 0

  const rerunExec = async (mode: "phase2" | "full_pipeline" | "blueprints") => {
    if (!exec || !exec.store_id) return
    setRerunning(true)
    setNotice(null)
    try {
      let res: Response
      if (mode === "blueprints") {
        res = await fetch(`/api/admin/stores/${exec.store_id}/generate-blueprints`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flow_ids: exec.flow_id ? [exec.flow_id] : undefined,
            force: true,
          }),
        })
      } else {
        res = await fetch(`/api/admin/stores/${exec.store_id}/generate-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flowId: exec.flow_id,
            emailId: exec.email_id,
            flowType: exec.flow_type,
            emailNumber: exec.email_number,
            ...(mode === "phase2" ? { phase2_only: true } : { full_pipeline: true }),
          }),
        })
      }
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(
          (json && typeof json.error === "string" && json.error) ||
            "Falha ao disparar a re-execução",
        )
      }
      setNotice({
        ok: true,
        msg:
          mode === "blueprints"
            ? "Regeneração de referência disparada para a loja."
            : mode === "phase2"
              ? "Fase 2 disparada — acompanhe o status na lista."
              : "Pipeline completo disparado — copy nova via n8n.",
      })
      refresh()
    } catch (e) {
      setNotice({ ok: false, msg: e instanceof Error ? e.message : "Erro ao reexecutar" })
    } finally {
      setRerunning(false)
    }
  }

  /**
   * Cria a execução manual e dispara.
   *
   * Duas chamadas de propósito: a primeira grava os overrides e o estágio
   * de retomada; a segunda é o disparo que JÁ EXISTE
   * (`generate-email`), com toda a lógica de fase 1 síncrona, split interno
   * da fase 2 e fallback sem INTERNAL_SECRET. O runner encontra a execução
   * sozinho pelo `email_id`.
   */
  const dispararManual = async (ov: ExecutionOverrides) => {
    if (!exec || !exec.store_id || !exec.flow_id || !exec.flow_type) return
    setRerunning(true)
    setRecusas(null)
    setNotice(null)
    try {
      const criar = await fetch("/api/admin/agents/executions/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: exec.email_id, overrides: ov }),
      })
      const criado = await criar.json().catch(() => null)
      if (!criar.ok) {
        // 422 traz a lista nó a nó — é o que transforma "não deu" em "pine
        // o Curador ou reative-o".
        if (Array.isArray(criado?.recusas)) {
          setRecusas(criado.recusas)
          return
        }
        throw new Error(criado?.error ?? "Falha ao criar a execução manual")
      }

      const res = await fetch(
        `/api/admin/stores/${exec.store_id}/generate-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flowId: exec.flow_id,
            emailId: exec.email_id,
            flowType: exec.flow_type,
            emailNumber: exec.email_number,
            ...(criado.dispatch === "phase2"
              ? { phase2_only: true }
              : { full_pipeline: true }),
          }),
        },
      )
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error ?? "Execução criada, mas o disparo falhou")
      }
      setNotice({ ok: true, msg: `Execução manual disparada — ${criado.resumo}` })
      setRascunho(RASCUNHO_VAZIO)
      refresh()
    } catch (e) {
      setNotice({
        ok: false,
        msg: e instanceof Error ? e.message : "Erro ao disparar",
      })
    } finally {
      setRerunning(false)
    }
  }

  /** Cancela a execução manual viva (libera o e-mail e o watchdog). */
  const cancelarManual = async () => {
    if (!exec) return
    setRerunning(true)
    try {
      const res = await fetch("/api/admin/agents/executions/manual", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: exec.email_id, action: "cancelar" }),
      })
      if (!res.ok) throw new Error("Falha ao cancelar")
      setNotice({ ok: true, msg: "Execução manual cancelada." })
      refresh()
    } catch (e) {
      setNotice({
        ok: false,
        msg: e instanceof Error ? e.message : "Erro ao cancelar",
      })
    } finally {
      setRerunning(false)
    }
  }

  // O rascunho pinta no canvas quem não vai rodar, ANTES de disparar — é o
  // feedback que o n8n dá no nó desativado.
  const runsNoCanvas = useMemo(
    () => projetarRascunho(runs, rascunho),
    [runs, rascunho],
  )

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <ExecList
        executions={executions}
        active={exec?.email_id ?? null}
        onPick={(id) => {
          setActiveId(id)
          setNodeKey(null)
          setNotice(null)
          setRascunho(RASCUNHO_VAZIO)
          setRecusas(null)
        }}
        liveStatus={liveStatus}
        loading={isLoading}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {exec && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "11px 18px",
              borderBottom: `1px solid ${C.border}`,
              background: C.white,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span
                  style={{
                    fontSize: 14.5,
                    fontWeight: 600,
                    color: C.g900,
                    fontFamily: F.sans,
                    ...TNUM,
                  }}
                >
                  {fmtWhen(exec.updated_at)}
                </span>
                <ExecStatusText e={exec} />
              </div>
              <div style={{ marginTop: 2, fontSize: 11.5, color: C.g500, fontFamily: F.sans }}>
                {exec.store_name} · {exec.email_name} · {exec.flow_type_label}
              </div>
              {/* Falha de agente legado (html/refiner) não tem nó no grafo
                  novo — sem esta linha o motivo do erro ficaria invisível. */}
              {exec.bucket === "error" && exec.failure_reason && (
                <div
                  style={{
                    marginTop: 3,
                    fontSize: 11.5,
                    color: "#991B1B",
                    fontFamily: F.sans,
                    maxWidth: 520,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={exec.failure_reason}
                >
                  {exec.failure_reason}
                </div>
              )}
            </div>
            {exec.manual && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <SeloExecucaoManual
                  status={exec.manual.status}
                  paradoEm={exec.manual.stopped_at_node}
                />
                <StudioBtn
                  onClick={() => void cancelarManual()}
                  disabled={rerunning}
                  style={{ height: 26, padding: "0 9px", fontSize: 11 }}
                  title="Encerra a execução manual: libera o e-mail e devolve o cuidado ao watchdog"
                >
                  Cancelar
                </StudioBtn>
              </div>
            )}
            <div style={{ flex: 1 }} />
            {notice && (
              <span
                style={{
                  fontSize: 11.5,
                  fontFamily: F.sans,
                  color: notice.ok ? C.pos : C.neg,
                  maxWidth: 320,
                }}
              >
                {notice.msg}
              </span>
            )}
            <span style={{ fontSize: 12, color: C.g500, fontFamily: F.sans, ...TNUM }}>
              Custo da execução:{" "}
              <strong style={{ color: C.g900, fontWeight: 600 }}>{usd3(cost)}</strong>
            </span>
          </div>
        )}
        <div style={{ flex: 1, position: "relative", minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          <FlowCanvas
            positions={positions}
            selected={nodeKey}
            onSelect={setNodeKey}
            runs={runsNoCanvas}
            overlay={
              <div style={{ position: "absolute", top: 14, left: 16, pointerEvents: "none" }}>
                <span
                  style={{
                    fontSize: 11.5,
                    color: C.g400,
                    fontFamily: F.sans,
                    background: "rgba(255,255,255,0.85)",
                    padding: "3px 9px",
                    borderRadius: 6,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  Clique em um nó para ver entrada, prompt, saída e custo
                </span>
              </div>
            }
          />
          </div>
          <BarraDeExecucaoManual
            rascunho={rascunho}
            onLimpar={() => {
              setRascunho(RASCUNHO_VAZIO)
              setRecusas(null)
            }}
            onDisparar={() => void dispararManual(rascunho)}
            disparando={rerunning}
            recusasDoServidor={recusas}
          />
        </div>
      </div>
      {exec && nodeKey && runs?.[nodeKey] && (
        <NodeRunPanel
          exec={exec}
          nodeKey={nodeKey}
          run={runs[nodeKey]}
          onClose={() => setNodeKey(null)}
          onRerun={rerunExec}
          rerunning={rerunning}
          rascunho={rascunho}
          onRascunho={(ov) => {
            setRascunho(ov)
            setRecusas(null)
          }}
          onSoEsteNo={(node) => void dispararManual(overridesSoEsteNo(node))}
        />
      )}
    </div>
  )
}
