"use client"

import { useEffect } from "react"
import { X, CheckCircle2, AlertCircle, Loader2, ExternalLink } from "lucide-react"
import { useGenerationStatus } from "@/hooks/use-generation-status"
import { AGENT_VISUAL, type PipelineAgentKey } from "@/lib/agents/agent-visual"

/** Agrega o custo (cents) e tokens dos runs por agente, em ordem de custo desc. */
function costByAgent(
  runs: Array<{ agent: string; cost_cents: number | null; tokens_input: number | null; tokens_output: number | null }> | undefined,
): Array<{ agent: string; label: string; cents: number; tokens: number }> {
  const acc = new Map<string, { cents: number; tokens: number }>()
  for (const r of runs ?? []) {
    const cur = acc.get(r.agent) ?? { cents: 0, tokens: 0 }
    cur.cents += Number(r.cost_cents ?? 0)
    cur.tokens += (r.tokens_input ?? 0) + (r.tokens_output ?? 0)
    acc.set(r.agent, cur)
  }
  return Array.from(acc.entries())
    .map(([agent, v]) => ({
      agent,
      label: AGENT_VISUAL[agent as PipelineAgentKey]?.name ?? agent,
      cents: v.cents,
      tokens: v.tokens,
    }))
    .sort((a, b) => b.cents - a.cents)
}

interface GenerationProgressDrawerProps {
  batchId: string | null
  storeId: string
  onClose: () => void
  onComplete: () => void
}

const AGENT_LABELS: Record<string, string> = {
  seed: "Seed",
  copy: "Copy",
  image: "Imagens",
  html: "HTML",
}

const AGENT_ORDER = ["seed", "copy", "image", "html"]

export function GenerationProgressDrawer({
  batchId,
  storeId,
  onClose,
  onComplete,
}: GenerationProgressDrawerProps) {
  const { data, isComplete } = useGenerationStatus(storeId, batchId)

  useEffect(() => {
    if (isComplete) {
      onComplete()
    }
  }, [isComplete, onComplete])

  if (!batchId) return null

  const status = data?.status ?? "pending"
  const completed = data?.completed ?? 0
  const total = data?.total ?? 0
  const errors = data?.errors ?? []
  const summary = data?.summary ?? { totalCost: 0, totalDuration: 0, tokensTotal: 0 }

  const isDone = status === "done"
  const isError = status === "error"
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 360,
        zIndex: 50,
        background: "var(--crm-gray-0, #fff)",
        borderLeft: "1px solid var(--crm-border, rgba(0,0,0,0.08))",
        display: "flex",
        flexDirection: "column",
        boxShadow: "-4px 0 16px rgba(0,0,0,0.06)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--crm-border, rgba(0,0,0,0.08))",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!isDone && !isError && (
            <Loader2
              className="h-4 w-4 animate-spin"
              style={{ color: "var(--crm-brand, #1F1F1F)" }}
            />
          )}
          {isDone && (
            <CheckCircle2
              className="h-4 w-4"
              style={{ color: "var(--crm-pos, #16a34a)" }}
            />
          )}
          {isError && (
            <AlertCircle
              className="h-4 w-4"
              style={{ color: "var(--crm-neg, #dc2626)" }}
            />
          )}
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--crm-gray-900, #111)",
            }}
          >
            {isDone
              ? "Geracao concluida"
              : isError
                ? "Geracao com erros"
                : "Gerando emails..."}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            width: 28,
            height: 28,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: "1px solid var(--crm-border, rgba(0,0,0,0.08))",
            borderRadius: 6,
            color: "var(--crm-gray-500, #6b7280)",
            cursor: "pointer",
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ padding: "12px 20px 0" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--crm-gray-500, #6b7280)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Progresso
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--crm-gray-700, #374151)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {completed}/{total} emails
          </span>
        </div>
        <div
          style={{
            width: "100%",
            height: 6,
            background: "var(--crm-gray-100, #f3f4f6)",
            borderRadius: 3,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progressPct}%`,
              height: "100%",
              background: isError
                ? "var(--crm-neg, #dc2626)"
                : isDone
                  ? "var(--crm-pos, #16a34a)"
                  : "var(--crm-brand, #1F1F1F)",
              borderRadius: 3,
              transition: "width 300ms ease",
            }}
          />
        </div>
      </div>

      {/* Steps list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px",
        }}
      >
        <StepsList
          agentStatuses={buildAgentList(data)}
          errors={errors}
        />
      </div>

      {/* Summary footer (when done) */}
      {(isDone || isError) && (
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--crm-border, rgba(0,0,0,0.08))",
            background: "var(--crm-gray-50, #f9fafb)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <MiniStat
              label="Tempo"
              value={`${(summary.totalDuration / 1000).toFixed(1)}s`}
            />
            <MiniStat
              label="Custo"
              value={`$${(summary.totalCost / 100).toFixed(4)}`}
            />
            <MiniStat
              label="Tokens"
              value={summary.tokensTotal.toLocaleString("pt-BR")}
            />
          </div>

          {/* Custo POR AGENTE — quanto cada agente (Curador, Montador…) gastou */}
          {(() => {
            const perAgent = costByAgent(data?.runs)
            if (perAgent.length === 0) return null
            return (
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--crm-gray-500, #6b7280)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: 6,
                  }}
                >
                  Custo por agente
                </div>
                {perAgent.map((a) => (
                  <div
                    key={a.agent}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: 12,
                      padding: "3px 0",
                      color: "var(--crm-gray-700, #374151)",
                    }}
                  >
                    <span>{a.label}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      ${(a.cents / 100).toFixed(4)}
                      <span style={{ color: "var(--crm-gray-400, #9ca3af)", marginLeft: 6 }}>
                        {a.tokens.toLocaleString("pt-BR")} tok
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )
          })()}

          <a
            href={`/admin/tools/email-generation-logs?batch=${batchId}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              height: 32,
              background: "var(--crm-gray-0, #fff)",
              border: "1px solid var(--crm-border, rgba(0,0,0,0.08))",
              borderRadius: 6,
              color: "var(--crm-gray-700, #374151)",
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
              cursor: "pointer",
            }}
          >
            <ExternalLink className="h-3 w-3" />
            Ver logs
          </a>
        </div>
      )}
    </div>
  )
}

interface AgentStatusEntry {
  agent: string
  status: "pending" | "running" | "success" | "error" | "skipped"
  errorMessage?: string | null
}

function buildAgentList(
  data: {
    status: string
    errors?: Array<{ agent: string; error: string }>
  } | null,
): AgentStatusEntry[] {
  if (!data) {
    return AGENT_ORDER.map((agent) => ({
      agent,
      status: "pending" as const,
    }))
  }

  const errorMap = new Map<string, string>()
  for (const e of data.errors ?? []) {
    errorMap.set(e.agent, e.error)
  }

  if (data.status === "done") {
    return AGENT_ORDER.map((agent) => ({
      agent,
      status: errorMap.has(agent) ? ("error" as const) : ("success" as const),
      errorMessage: errorMap.get(agent) ?? null,
    }))
  }

  if (data.status === "error") {
    return AGENT_ORDER.map((agent) => ({
      agent,
      status: errorMap.has(agent) ? ("error" as const) : ("success" as const),
      errorMessage: errorMap.get(agent) ?? null,
    }))
  }

  // Running: show progress
  return AGENT_ORDER.map((agent, idx) => {
    if (errorMap.has(agent)) {
      return { agent, status: "error" as const, errorMessage: errorMap.get(agent) }
    }
    // Approximate: seed(0), copy(1), image(2), html(3)
    // Since we don't have per-agent streaming status from the batch endpoint,
    // show running for the first incomplete agent
    return { agent, status: idx < 2 ? ("running" as const) : ("pending" as const) }
  })
}

function StepsList({
  agentStatuses,
  errors,
}: {
  agentStatuses: AgentStatusEntry[]
  errors: Array<{ emailId: string; agent: string; error: string }>
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {agentStatuses.map((entry) => (
        <StepRow key={entry.agent} entry={entry} />
      ))}
      {errors.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--crm-neg, #dc2626)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Erros ({errors.length})
          </span>
          {errors.map((err, i) => (
            <div
              key={i}
              style={{
                marginTop: 6,
                padding: "8px 10px",
                background: "rgba(220,38,38,0.04)",
                border: "1px solid rgba(220,38,38,0.12)",
                borderRadius: 6,
                fontSize: 11,
                color: "var(--crm-neg, #dc2626)",
                wordBreak: "break-word",
              }}
            >
              <span style={{ fontWeight: 600 }}>
                [{AGENT_LABELS[err.agent] ?? err.agent}]
              </span>{" "}
              {err.error.slice(0, 300)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StepRow({ entry }: { entry: AgentStatusEntry }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        background: "var(--crm-gray-0, #fff)",
        border: "1px solid var(--crm-border, rgba(0,0,0,0.08))",
        borderRadius: 6,
      }}
    >
      <StepIcon status={entry.status} />
      <span
        style={{
          flex: 1,
          fontSize: 12,
          fontWeight: 500,
          color:
            entry.status === "pending"
              ? "var(--crm-gray-400, #9ca3af)"
              : "var(--crm-gray-800, #1f2937)",
        }}
      >
        {AGENT_LABELS[entry.agent] ?? entry.agent}
      </span>
      <StepBadge status={entry.status} />
    </div>
  )
}

function StepIcon({ status }: { status: AgentStatusEntry["status"] }) {
  if (status === "success" || status === "skipped") {
    return (
      <CheckCircle2
        className="h-3.5 w-3.5"
        style={{ color: "var(--crm-pos, #16a34a)", flexShrink: 0 }}
      />
    )
  }
  if (status === "error") {
    return (
      <AlertCircle
        className="h-3.5 w-3.5"
        style={{ color: "var(--crm-neg, #dc2626)", flexShrink: 0 }}
      />
    )
  }
  if (status === "running") {
    return (
      <Loader2
        className="h-3.5 w-3.5 animate-spin"
        style={{ color: "var(--crm-brand, #1F1F1F)", flexShrink: 0 }}
      />
    )
  }
  // pending
  return (
    <div
      style={{
        width: 14,
        height: 14,
        borderRadius: "50%",
        border: "1.5px solid var(--crm-gray-200, #e5e7eb)",
        flexShrink: 0,
      }}
    />
  )
}

function StepBadge({ status }: { status: AgentStatusEntry["status"] }) {
  const config: Record<
    string,
    { label: string; bg: string; fg: string }
  > = {
    success: {
      label: "OK",
      bg: "var(--crm-pos-bg, #f0fdf4)",
      fg: "var(--crm-pos, #16a34a)",
    },
    error: {
      label: "Erro",
      bg: "rgba(220,38,38,0.06)",
      fg: "var(--crm-neg, #dc2626)",
    },
    running: {
      label: "...",
      bg: "var(--crm-blue-50, #eff6ff)",
      fg: "var(--crm-brand, #1F1F1F)",
    },
    skipped: {
      label: "Pulado",
      bg: "var(--crm-gray-100, #f3f4f6)",
      fg: "var(--crm-gray-500, #6b7280)",
    },
    pending: {
      label: "Aguard.",
      bg: "var(--crm-gray-100, #f3f4f6)",
      fg: "var(--crm-gray-400, #9ca3af)",
    },
  }

  const c = config[status] ?? config.pending

  return (
    <span
      style={{
        padding: "2px 6px",
        borderRadius: 4,
        background: c.bg,
        color: c.fg,
        fontSize: 10,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {c.label}
    </span>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "var(--crm-gray-500, #6b7280)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--crm-gray-900, #111)",
          fontVariantNumeric: "tabular-nums",
          fontFamily: "var(--crm-font-mono, 'Geist Mono', monospace)",
        }}
      >
        {value}
      </div>
    </div>
  )
}
