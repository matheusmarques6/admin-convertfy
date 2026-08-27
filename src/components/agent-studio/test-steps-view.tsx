"use client"

/**
 * Estúdio de Agentes — aba Teste, modo ETAPAS ("o que temos hoje"):
 * a lista de agentes da aba Testar do hub, redesenhada com os átomos do
 * Estúdio. Toda a mecânica vem do hook compartilhado useTestGeneration —
 * este componente só exibe.
 */

import { useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
} from "lucide-react"

import { C, F, TNUM } from "@/components/email-generation/ui/eg-theme"
import type { TestGeneration } from "@/components/email-generation/use-test-generation"
import {
  TEST_AGENT_LABELS,
  TEST_BASE_AGENT_KEYS,
  fmtElapsed,
} from "@/lib/agents/test-run-view"
import { Spinner } from "./studio-atoms"

function StatusIcon({ s }: { s: string }) {
  switch (s) {
    case "success":
      return <CheckCircle2 size={15} style={{ color: "#059669" }} />
    case "error":
      return <AlertCircle size={15} style={{ color: "#DC2626" }} />
    case "running":
      return <Spinner size={13} />
    case "skipped":
      return <Clock size={15} style={{ color: C.g400 }} />
    default:
      return <Clock size={15} style={{ color: C.g300 }} />
  }
}

export function TestStepsView({ t }: { t: TestGeneration }) {
  const [showHistory, setShowHistory] = useState(false)
  const {
    statusInfo,
    steps,
    generating,
    batchId,
    nowTick,
    selectedStoreId,
    selectedEmailId,
  } = t

  const allRuns = statusInfo?.runs ?? []
  const currentBatchId = statusInfo?.currentBatchId ?? batchId
  const currentRuns = allRuns.filter(
    (r) => !currentBatchId || r.batch_id === currentBatchId,
  )
  const historicalRuns = allRuns.filter(
    (r) => currentBatchId && r.batch_id && r.batch_id !== currentBatchId,
  )
  const historicalByBatch = new Map<string, typeof allRuns>()
  for (const r of historicalRuns) {
    const bid = r.batch_id as string
    if (!historicalByBatch.has(bid)) historicalByBatch.set(bid, [])
    historicalByBatch.get(bid)!.push(r)
  }
  const historicalBatches = Array.from(historicalByBatch.entries()).sort(
    ([, a], [, b]) => {
      const ta = a[0]?.created_at ? Date.parse(a[0].created_at) : 0
      const tb = b[0]?.created_at ? Date.parse(b[0].created_at) : 0
      return tb - ta
    },
  )

  const renderAgentRow = (runs: typeof allRuns, agent: string) => {
    // `copy_dispatch` tem step PRÓPRIO desde que o Dispatch virou nó do
    // mapa: dobrá-lo no "Copy" escondia o payload enviado atrás do retorno.
    const agentRuns = runs.filter((r) => r.agent === agent)
    const latestRun = agentRuns[agentRuns.length - 1]
    const status = latestRun?.status ?? "pending"
    return (
      <div
        key={agent}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "8px 12px",
          borderRadius: 6,
          background: C.g50,
          border: `1px solid ${C.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <StatusIcon s={status} />
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: C.g700,
              fontFamily: F.sans,
              whiteSpace: "nowrap",
            }}
          >
            {TEST_AGENT_LABELS[agent] ?? agent}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 11,
            color: C.g400,
            fontFamily: F.sans,
            ...TNUM,
          }}
        >
          {latestRun?.status === "running" && latestRun?.created_at && (
            <span style={{ color: C.brand, fontWeight: 600 }}>
              {fmtElapsed(nowTick - Date.parse(latestRun.created_at))}
            </span>
          )}
          {latestRun?.duration_ms != null && (
            <span>{(latestRun.duration_ms / 1000).toFixed(1)}s</span>
          )}
          {(latestRun?.tokens_input || latestRun?.tokens_output) ? (
            <span>
              {(
                (latestRun?.tokens_input ?? 0) + (latestRun?.tokens_output ?? 0)
              ).toLocaleString("pt-BR")}{" "}
              tokens
            </span>
          ) : null}
          {latestRun?.cost_cents != null && latestRun.cost_cents > 0 && (
            <span>${(latestRun.cost_cents / 100).toFixed(4)}</span>
          )}
          {latestRun?.error_message && (
            <span
              title={latestRun.error_message}
              style={{
                color: "#DC2626",
                maxWidth: 220,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {latestRun.error_message}
            </span>
          )}
        </div>
      </div>
    )
  }

  const BASE: string[] = [...TEST_BASE_AGENT_KEYS]
  const keysFor = (runs: typeof allRuns): string[] => {
    const present = new Set(runs.map((r) => r.agent))
    const extras = Array.from(present).filter((a) => !BASE.includes(a))
    return [...BASE, ...extras]
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "18px 24px 40px" }}>
      {statusInfo?.runs ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {keysFor(currentRuns).map((agent) => renderAgentRow(currentRuns, agent))}
          </div>

          {historicalBatches.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              style={{
                marginTop: 12,
                background: "none",
                border: "none",
                padding: 0,
                fontSize: 11.5,
                color: C.g500,
                fontFamily: F.sans,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              {showHistory
                ? "Ocultar histórico de testes anteriores"
                : `Ver histórico de testes anteriores (${historicalBatches.length})`}
            </button>
          )}

          {showHistory &&
            historicalBatches.map(([bid, batchRuns], idx) => {
              const firstRun = batchRuns[0]
              const minutesAgo = firstRun?.created_at
                ? Math.max(
                    1,
                    Math.round((Date.now() - Date.parse(firstRun.created_at)) / 60000),
                  )
                : null
              return (
                <div key={bid} style={{ marginTop: 14 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 11,
                      color: C.g500,
                      fontFamily: F.sans,
                      marginBottom: 6,
                      ...TNUM,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      Anterior #{historicalBatches.length - idx}
                      {minutesAgo != null && ` · ${minutesAgo} min atrás`}
                    </span>
                    <span style={{ fontFamily: F.mono, fontSize: 10, opacity: 0.6 }}>
                      {bid.slice(0, 8)}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {keysFor(batchRuns)
                      .filter((agent) => batchRuns.some((r) => r.agent === agent))
                      .map((agent) => renderAgentRow(batchRuns, agent))}
                  </div>
                </div>
              )
            })}
        </>
      ) : steps.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {steps.map((step) => (
            <div
              key={step.agent}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: 6,
                background: C.g50,
                border: `1px solid ${C.border}`,
              }}
            >
              {generating ? <Spinner size={13} /> : <StatusIcon s={step.status} />}
              <span
                style={{ fontSize: 12, fontWeight: 500, color: C.g700, fontFamily: F.sans }}
              >
                {TEST_AGENT_LABELS[step.agent] ?? step.agent}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: "48px 0",
            textAlign: "center",
            fontSize: 13,
            color: C.g400,
            fontFamily: F.sans,
          }}
        >
          Selecione loja, flow e email acima e dispare uma geração de teste.
        </div>
      )}

      {/* Resumo terminal + links */}
      {statusInfo?.summary &&
        (statusInfo.status === "done" || statusInfo.status === "error") && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginTop: 14,
              paddingTop: 12,
              borderTop: `1px solid ${C.border}`,
              fontSize: 11.5,
              color: C.g500,
              fontFamily: F.sans,
              flexWrap: "wrap",
              ...TNUM,
            }}
          >
            {statusInfo.summary.totalDuration > 0 && (
              <span>Tempo: {(statusInfo.summary.totalDuration / 1000).toFixed(1)}s</span>
            )}
            {statusInfo.summary.tokensTotal > 0 && (
              <span>Tokens: {statusInfo.summary.tokensTotal.toLocaleString("pt-BR")}</span>
            )}
            {statusInfo.summary.totalCost > 0 && (
              <span>Custo: ${(statusInfo.summary.totalCost / 100).toFixed(4)}</span>
            )}
            <span style={{ flex: 1 }} />
            {batchId && (
              <a
                href={`/admin/settings/email-generation-logs?batch=${batchId}`}
                style={{ color: C.brand }}
              >
                Ver logs completos
              </a>
            )}
            {selectedStoreId && selectedEmailId && statusInfo.status === "done" && (
              <a
                href={`/admin/stores/${selectedStoreId}/producao?email=${selectedEmailId}`}
                style={{ color: "#059669", fontWeight: 600 }}
              >
                Ver email gerado
              </a>
            )}
          </div>
        )}

      {/* Preview de vars */}
      {(t.previewVars || t.previewError) && (
        <div
          style={{
            marginTop: 18,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            background: C.white,
            padding: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Eye size={14} style={{ color: C.g600 }} />
              <span
                style={{ fontSize: 13, fontWeight: 600, color: C.g900, fontFamily: F.sans }}
              >
                Vars resolvidas — HTML Agent v2
              </span>
              {t.previewVars && (
                <span style={{ fontSize: 11, color: C.g400, fontFamily: F.sans, ...TNUM }}>
                  {Object.keys(t.previewVars).length} keys
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={t.clearPreview}
              style={{
                background: "none",
                border: "none",
                fontSize: 11,
                color: C.g400,
                fontFamily: F.sans,
                cursor: "pointer",
              }}
            >
              fechar
            </button>
          </div>
          {t.previewError ? (
            <div
              style={{
                padding: "9px 12px",
                borderRadius: 6,
                background: C.negBg,
                border: `1px solid ${C.negBorder}`,
                fontSize: 12,
                color: C.neg,
                fontFamily: F.sans,
              }}
            >
              {t.previewError}
            </div>
          ) : (
            <div style={{ maxHeight: 480, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {t.previewVars &&
                Object.entries(t.previewVars).map(([key, value]) => {
                  const isEmpty = !value || value.trim() === ""
                  const isLong = value.length > 200
                  return (
                    <details
                      key={key}
                      open={!isLong && !isEmpty}
                      style={{
                        borderRadius: 6,
                        background: C.g50,
                        border: `1px solid ${C.border}`,
                        padding: "8px 12px",
                      }}
                    >
                      <summary
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          cursor: "pointer",
                          fontSize: 12,
                          fontFamily: F.sans,
                        }}
                      >
                        <code
                          style={{
                            fontFamily: F.mono,
                            fontWeight: 600,
                            color: C.g800,
                            fontSize: 11.5,
                          }}
                        >{`{{${key}}}`}</code>
                        <span style={{ fontSize: 10, color: C.g400, ...TNUM }}>
                          {isEmpty ? "vazio" : `${value.length} chars`}
                        </span>
                      </summary>
                      <pre
                        style={{
                          marginTop: 8,
                          fontSize: 11,
                          fontFamily: F.mono,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                          color: C.g600,
                          maxHeight: 300,
                          overflowY: "auto",
                        }}
                      >
                        {isEmpty ? "(vazio)" : value}
                      </pre>
                    </details>
                  )
                })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
