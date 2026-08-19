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

import { useMemo, useState } from "react"
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
import type { ExecutionRow, ExecutionsPayload, RunDetailPayload } from "./studio-data"

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

function ExecList({
  executions,
  active,
  onPick,
  autoRefresh,
  onAutoRefresh,
  loading,
}: {
  executions: ExecutionRow[]
  active: string | null
  onPick: (id: string) => void
  autoRefresh: boolean
  onAutoRefresh: (v: boolean) => void
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
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: C.g500,
            fontFamily: F.sans,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => onAutoRefresh(e.target.checked)}
            style={{ accentColor: C.brand, margin: 0 }}
          />
          Auto refresh
        </label>
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

export function NodeRunPanel({
  exec,
  nodeKey,
  run,
  onClose,
  onRerun,
  rerunning,
}: {
  exec: ExecutionRow
  nodeKey: string
  run: NodeRun
  onClose: () => void
  onRerun: (mode: "phase2" | "full_pipeline" | "blueprints") => void
  rerunning: boolean
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

  const copyJson = () => {
    const payload = hasDetail
      ? stringify({
          input_vars: detail?.input_vars ?? null,
          rendered_prompt: detail?.rendered_prompt ?? null,
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
        <CodeBlock text={bodyText} />
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
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [rerunning, setRerunning] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null)

  const { data, isLoading, mutate } = useSWR<ExecutionsPayload>(
    "/api/admin/agents/executions?limit=30",
    fetcher,
    { refreshInterval: autoRefresh ? 10000 : 0 },
  )
  const executions = useMemo(() => data?.executions ?? [], [data])
  const exec =
    executions.find((e) => e.email_id === activeId) ?? executions[0] ?? null

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
      void mutate()
    } catch (e) {
      setNotice({ ok: false, msg: e instanceof Error ? e.message : "Erro ao reexecutar" })
    } finally {
      setRerunning(false)
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <ExecList
        executions={executions}
        active={exec?.email_id ?? null}
        onPick={(id) => {
          setActiveId(id)
          setNodeKey(null)
          setNotice(null)
        }}
        autoRefresh={autoRefresh}
        onAutoRefresh={setAutoRefresh}
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
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          <FlowCanvas
            positions={positions}
            selected={nodeKey}
            onSelect={setNodeKey}
            runs={runs}
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
      </div>
      {exec && nodeKey && runs?.[nodeKey] && (
        <NodeRunPanel
          exec={exec}
          nodeKey={nodeKey}
          run={runs[nodeKey]}
          onClose={() => setNodeKey(null)}
          onRerun={rerunExec}
          rerunning={rerunning}
        />
      )}
    </div>
  )
}
