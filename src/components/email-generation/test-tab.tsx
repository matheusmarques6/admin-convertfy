"use client"

/**
 * Aba Testar do hub de Geração de Emails (3 modos de execução + polling de
 * batch + preview de vars).
 *
 * Refactor ago/2026: TODO o estado e a mecânica (disparos, polling,
 * recovery de timeout, cronômetro, guards anti-trava) foram extraídos para
 * o hook compartilhado `useTestGeneration` — a aba Teste do Estúdio de
 * Agentes usa o mesmo hook com outra visualização. Este arquivo é só a
 * camada de exibição original.
 */

import {
  Loader2,
  Play,
  Rocket,
  CheckCircle2,
  AlertCircle,
  Clock,
  Eye,
  Zap,
} from "lucide-react"
import { FLOW_TYPE_LABELS } from "./flow-labels"
import { C, F, egStripeBg } from "./ui/eg-theme"
import {
  EGBtn,
  EGCard,
  EGLabel,
  EGSecTitle,
  EGSelect,
  EGTextarea,
} from "./ui/eg-atoms"
import { useTestGeneration } from "./use-test-generation"
import {
  TEST_AGENT_LABELS,
  TEST_BASE_AGENT_KEYS,
  fmtElapsed,
  runHeaderLabel,
} from "@/lib/agents/test-run-view"
import { useState } from "react"

export function TestTab() {
  const t = useTestGeneration()
  const {
    stores,
    loadingStores,
    flows,
    loadingFlows,
    selectedStoreId,
    selectedFlowId,
    selectedEmailId,
    selectedFlow,
    testContext,
    setTestContext,
    handleGenerate,
    generating,
    generationInFlight,
    result,
    steps,
    batchId,
    statusInfo,
    isTerminalStatus,
    phaseMessage,
    showStaleWarning,
    hasRun,
    startedAt,
    nowTick,
    timerActive,
    handlePreviewVars,
    previewingVars,
    previewVars,
    previewError,
    clearPreview,
  } = t
  const [showHistory, setShowHistory] = useState(false)

  const agentLabels = TEST_AGENT_LABELS

  const statusIcon = (s: string) => {
    switch (s) {
      case "success": return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      case "error": return <AlertCircle className="h-4 w-4 text-red-500" />
      case "running": return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
      case "skipped": return <Clock className="h-4 w-4 text-slate-400" />
      default: return <Clock className="h-4 w-4 text-slate-300 dark:text-white/20" />
    }
  }

  return (
    <div>
      <EGSecTitle
        icon={<Zap size={18} />}
        title="Testar geração"
        sub="Rode o pipeline completo com um briefing de teste e veja o email montado."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "380px minmax(0,1fr)",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* ── Coluna esquerda: briefing de teste ── */}
        <EGCard title="Briefing de teste">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <EGLabel>Loja</EGLabel>
              {loadingStores ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: C.g400,
                    fontFamily: F.sans,
                  }}
                >
                  <Loader2 size={14} className="animate-spin" /> Carregando
                  lojas…
                </div>
              ) : (
                <EGSelect
                  value={selectedStoreId}
                  onChange={t.selectStore}
                  placeholder="Selecione uma loja..."
                  options={stores.map((s) => ({
                    value: s.id,
                    label: s.store_name,
                  }))}
                />
              )}
            </div>

            {selectedStoreId && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div>
                  <EGLabel>Flow</EGLabel>
                  {loadingFlows ? (
                    <div
                      style={{
                        fontSize: 12,
                        color: C.g400,
                        fontFamily: F.sans,
                      }}
                    >
                      Carregando…
                    </div>
                  ) : flows.length === 0 ? (
                    <div
                      style={{
                        fontSize: 12,
                        color: C.warn,
                        fontFamily: F.sans,
                      }}
                    >
                      Nenhum flow — inicialize os flows desta loja primeiro.
                    </div>
                  ) : (
                    <EGSelect
                      value={selectedFlowId}
                      onChange={t.selectFlow}
                      placeholder="Selecione..."
                      options={flows.map((f) => ({
                        value: f.id,
                        label: `${FLOW_TYPE_LABELS[f.flow_type] ?? f.flow_type} — ${f.name}`,
                      }))}
                    />
                  )}
                </div>
                <div>
                  <EGLabel>Email #</EGLabel>
                  <EGSelect
                    value={selectedEmailId}
                    onChange={t.selectEmail}
                    placeholder="Selecione..."
                    disabled={!selectedFlow || selectedFlow.emails.length === 0}
                    options={(selectedFlow?.emails ?? []).map((e) => ({
                      value: e.id,
                      label: `#${e.number} — ${e.name} [${e.status}]`,
                    }))}
                  />
                </div>
              </div>
            )}

            <div>
              <EGLabel hint="opcional">Objetivo / contexto</EGLabel>
              <EGTextarea
                rows={3}
                value={testContext}
                onChange={setTestContext}
                placeholder="Ex: Black Friday, 40% em tudo, para amantes de moda"
              />
            </div>

            <EGBtn
              variant="dark"
              onClick={() => handleGenerate(false, true)}
              disabled={
                generationInFlight ||
                !selectedStoreId ||
                !selectedFlowId ||
                !selectedEmailId
              }
              title="Fluxo completo real: fase 1 (Curador → Montador → Blueprint) → copy NOVA via n8n só deste e-mail → fase 2 (imagem → Hero → Texto → Imagem → Cores → QA) automática. Assíncrono."
              style={{ width: "100%" }}
            >
              {generating ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Rocket size={15} />
              )}
              Rodar pipeline (fase 1 + copy n8n + fase 2)
            </EGBtn>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <EGBtn
                variant="secondary"
                onClick={() => handleGenerate()}
                disabled={
                  generationInFlight ||
                  !selectedStoreId ||
                  !selectedFlowId ||
                  !selectedEmailId
                }
                title="Com copy: Montador → Blueprint → render. Sem copy: dispara ao N8N."
              >
                <Play size={14} /> Executar geração
              </EGBtn>
              <EGBtn
                variant="secondary"
                onClick={() => handleGenerate(true)}
                disabled={
                  generationInFlight ||
                  !selectedStoreId ||
                  !selectedFlowId ||
                  !selectedEmailId
                }
                title="Reusa Montador/Blueprint/copy existentes e roda só imagem → montagem HTML (4 agentes) → QA (requer copy no email)"
              >
                <Play size={14} /> Só fase 2
              </EGBtn>
              <EGBtn
                variant="secondary"
                onClick={handlePreviewVars}
                disabled={previewingVars || !selectedStoreId || !selectedEmailId}
                title="Mostra as vars que o HTML Agent vai receber, sem invocar o LLM"
              >
                {previewingVars ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Eye size={14} />
                )}
                Pré-visualizar vars
              </EGBtn>
            </div>
          </div>
        </EGCard>

        {/* ── Coluna direita: resultado ── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            minWidth: 0,
          }}
        >
          <EGCard title="Resultado">
            {!hasRun ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 360,
                  border: `1px dashed ${C.border}`,
                  borderRadius: 10,
                  color: C.g400,
                  fontFamily: F.sans,
                  fontSize: 13,
                  textAlign: "center",
                  background: egStripeBg,
                }}
              >
                <span>
                  Rode o pipeline para ver o email montado aqui,
                  <br />
                  bloco a bloco, com custo por agente.
                </span>
              </div>
            ) : (
              <div className="space-y-4">
          {/* Status header — ícone segue o MESMO rótulo do runHeaderLabel
              (senão o relógio de "dispatched" persistia com a montagem
              já rodando). */}
          <div className="flex items-center gap-2">
            {runHeaderLabel({
              resultStatus: result?.status ?? null,
              pollStatus: statusInfo?.status ?? null,
              emailStatus: statusInfo?.email_status ?? null,
              hasRun: true,
            }) === "Copy disparada ao N8N" ? (
              <Clock className="h-5 w-5 text-blue-500" />
            ) : statusInfo?.status === "done" || result?.status === "done" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : statusInfo?.status === "error" || result?.status === "error" ? (
              <AlertCircle className="h-5 w-5 text-red-500" />
            ) : (
              <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
            )}
            <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">
              {/* "Copy disparada" só ANTES do email progredir além da copy —
                  no teste completo a fase 2 dispara sozinha e o header
                  precisa acompanhar (runHeaderLabel). */}
              {runHeaderLabel({
                resultStatus: result?.status ?? null,
                pollStatus: statusInfo?.status ?? null,
                emailStatus: statusInfo?.email_status ?? null,
                hasRun: true,
              }) ?? "Gerando email..."}
            </h3>
            {/* Tempo total decorrido desde o clique (congela no terminal) */}
            {startedAt != null && (
              <span
                className={`ml-auto text-[11px] font-mono ${
                  timerActive
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-slate-400 dark:text-white/35"
                }`}
              >
                ⏱ {fmtElapsed(nowTick - startedAt)}
              </span>
            )}
          </div>

          {/* Banner modo teste tolerante */}
          {result?.relaxedBrand && (
            <div className="rounded-[4px] border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/5 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-200">
              ℹ️ Modo teste tolerante: brand identity da loja pode estar incompleta. O email gerado pode ficar sem logo ou com cores em default. Confirme a brand antes de promover pro fluxo real.
            </div>
          )}

          {/* Banner geracao travada — watchdog vai limpar em breve */}
          {showStaleWarning && (() => {
            const faseMap: Record<string, string> = {
              rendering: "montagem HTML (Hero → Texto → Imagem → Cores)",
              image_done: "início da montagem HTML",
              qa_running: "QA",
            }
            const fase = faseMap[statusInfo?.email_status ?? ""] ?? statusInfo?.email_status ?? "atual"
            return (
              <div className="rounded-[4px] border border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-200">
                ⚠️ Geração parece travada na fase {fase}. Watchdog vai limpar em alguns minutos. Veja logs em{" "}
                <a
                  href="/admin/settings/email-generation-logs"
                  className="underline font-medium"
                >
                  /admin/settings/email-generation-logs
                </a>
              </div>
            )
          })()}

          {/* Agent steps — default mostra só runs do batch atual.
              Toggle revela histórico (runs de batches anteriores agrupados). */}
          {statusInfo?.runs && (() => {
            const allRuns = statusInfo.runs ?? []
            const currentBatchId = statusInfo.currentBatchId ?? batchId
            const currentRuns = allRuns.filter(
              (r) => !currentBatchId || r.batch_id === currentBatchId,
            )
            const historicalRuns = allRuns.filter(
              (r) => currentBatchId && r.batch_id && r.batch_id !== currentBatchId,
            )
            // Agrupa runs históricos por batch_id (ordem decrescente — mais recente primeiro)
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

            const renderAgentRow = (
              runs: typeof allRuns,
              agent: string,
            ) => {
              // O fluxo n8n grava o run como `copy_dispatch` (o dispatch da
              // copy), não `copy`. Casa os dois no step "Copy" pra ele não
              // ficar eterno em "pending" no teste "Geração completa".
              const agentRuns = runs.filter(
                (r) =>
                  r.agent === agent ||
                  (agent === "copy" && r.agent === "copy_dispatch"),
              )
              const latestRun = agentRuns[agentRuns.length - 1]
              const status = latestRun?.status ?? "pending"
              return (
                <div
                  key={agent}
                  className="flex items-center justify-between px-3 py-2 rounded-[4px] bg-slate-50 dark:bg-white/[0.03]"
                >
                  <div className="flex items-center gap-2">
                    {statusIcon(status)}
                    <span className="text-[12px] font-medium text-slate-700 dark:text-white/80">
                      {agentLabels[agent] ?? agent}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-white/35">
                    {/* Run em execução: tempo AO VIVO desde o created_at
                        (duration_ms só existe quando o run termina). */}
                    {latestRun?.status === "running" &&
                      latestRun?.created_at && (
                        <span className="text-blue-500 font-medium">
                          {fmtElapsed(
                            nowTick - Date.parse(latestRun.created_at),
                          )}
                        </span>
                      )}
                    {latestRun?.duration_ms != null && (
                      <span>{(latestRun.duration_ms / 1000).toFixed(1)}s</span>
                    )}
                    {(latestRun?.tokens_input || latestRun?.tokens_output) && (
                      <span>
                        {((latestRun.tokens_input ?? 0) + (latestRun.tokens_output ?? 0)).toLocaleString()} tokens
                      </span>
                    )}
                    {latestRun?.cost_cents != null && latestRun.cost_cents > 0 && (
                      <span>${(latestRun.cost_cents / 100).toFixed(4)}</span>
                    )}
                    {latestRun?.error_message && (
                      <span className="text-red-500 max-w-[200px] truncate" title={latestRun.error_message}>
                        {latestRun.error_message}
                      </span>
                    )}
                  </div>
                </div>
              )
            }

            // Ordem canônica do pipeline ATUAL (Curador → Montador →
            // Blueprint → seed → copy → imagem → cadeia de formatação → QA).
            // Agentes fora da base (subject, html/refiner legados) aparecem
            // dinamicamente quando têm run no batch — sem linha fantasma.
            const BASE_AGENT_KEYS: string[] = [...TEST_BASE_AGENT_KEYS]
            const keysFor = (runs: typeof allRuns): string[] => {
              const present = new Set(
                runs.map((r) =>
                  r.agent === "copy_dispatch" ? "copy" : r.agent,
                ),
              )
              const extras = Array.from(present).filter(
                (a) => !BASE_AGENT_KEYS.includes(a),
              )
              return [...BASE_AGENT_KEYS, ...extras]
            }
            const agentKeys = keysFor(currentRuns)

            return (
              <>
                <div className="space-y-1.5">
                  {agentKeys.map((agent) => renderAgentRow(currentRuns, agent))}
                </div>

                {historicalBatches.length > 0 && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowHistory((v) => !v)}
                      className="text-[11px] text-slate-500 hover:text-slate-700 dark:text-white/45 dark:hover:text-white/70 hover:underline"
                    >
                      {showHistory
                        ? "Ocultar histórico de testes anteriores"
                        : `Ver histórico de testes anteriores (${historicalBatches.length})`}
                    </button>
                  </div>
                )}

                {showHistory && historicalBatches.length > 0 && (
                  <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-white/[0.06]">
                    {historicalBatches.map(([bid, batchRuns], idx) => {
                      const firstRun = batchRuns[0]
                      const minutesAgo = firstRun?.created_at
                        ? Math.max(
                            1,
                            Math.round(
                              (Date.now() - Date.parse(firstRun.created_at)) / 60000,
                            ),
                          )
                        : null
                      return (
                        <div key={bid} className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-white/45">
                            <span className="font-medium">
                              Anterior #{historicalBatches.length - idx}
                              {minutesAgo != null && ` · ${minutesAgo} min atrás`}
                            </span>
                            <span className="font-mono text-[10px] opacity-60">
                              {bid.slice(0, 8)}
                            </span>
                          </div>
                          {/* Histórico: só agentes que de fato rodaram no batch
                              (batches antigos têm html/refiner; novos têm a
                              cadeia de formatação — sem linha fantasma). */}
                          {keysFor(batchRuns)
                            .filter((agent) =>
                              batchRuns.some(
                                (r) =>
                                  r.agent === agent ||
                                  (agent === "copy" &&
                                    r.agent === "copy_dispatch"),
                              ),
                            )
                            .map((agent) => renderAgentRow(batchRuns, agent))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )
          })()}

          {/* Fallback steps when no status polling data yet */}
          {!statusInfo?.runs && steps.length > 0 && (
            <div className="space-y-1.5">
              {steps.map((step) => (
                <div
                  key={step.agent}
                  className="flex items-center gap-2 px-3 py-2 rounded-[4px] bg-slate-50 dark:bg-white/[0.03]"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 text-slate-300 animate-spin" />
                  ) : (
                    statusIcon(step.status)
                  )}
                  <span className="text-[12px] font-medium text-slate-700 dark:text-white/80">
                    {agentLabels[step.agent] ?? step.agent}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Info message — esconde quando o polling ja chegou a terminal
              (senao "rodando em background" persistia junto de "Erro na
              geracao"). Mostra o estagio real (phaseMessage) quando em curso. */}
          {result?.message && !isTerminalStatus && (
            <div className="p-3 rounded-[4px] bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
              <p className="text-[12px] text-blue-700 dark:text-blue-300">
                {phaseMessage ?? result.message}
              </p>
            </div>
          )}

          {/* Error message */}
          {result?.error && (
            <div className="p-3 rounded-[4px] bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
              <p className="text-[12px] text-red-700 dark:text-red-400 font-mono break-all">
                {result.error}
              </p>
            </div>
          )}

          {/* Botao "Tentar de novo" — disponivel quando deu erro ou email_status=failed */}
          {(result?.status === "error" || statusInfo?.email_status === "failed") && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => handleGenerate()}
                disabled={generationInFlight || !selectedStoreId || !selectedFlowId || !selectedEmailId}
                className="inline-flex items-center gap-2 h-8 px-4 rounded-[6px] border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] text-slate-700 dark:text-white/80 text-[12px] font-medium disabled:opacity-40 transition-opacity"
              >
                {generating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Tentar de novo
              </button>
            </div>
          )}

          {/* Summary */}
          {statusInfo?.summary && (statusInfo.status === "done" || statusInfo.status === "error") && (
            <div className="flex items-center gap-4 pt-2 border-t border-slate-100 dark:border-white/[0.06] text-[11px] text-slate-500 dark:text-white/45">
              {statusInfo.summary.totalDuration > 0 && (
                <span>Tempo: {(statusInfo.summary.totalDuration / 1000).toFixed(1)}s</span>
              )}
              {statusInfo.summary.tokensTotal > 0 && (
                <span>Tokens: {statusInfo.summary.tokensTotal.toLocaleString()}</span>
              )}
              {statusInfo.summary.totalCost > 0 && (
                <span>Custo: ${(statusInfo.summary.totalCost / 100).toFixed(4)}</span>
              )}
              {batchId && (
                <a
                  href={`/admin/settings/email-generation-logs?batch=${batchId}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline ml-auto"
                >
                  Ver logs completos
                </a>
              )}
              {selectedStoreId && selectedEmailId && statusInfo?.status === "done" && (
                <a
                  href={`/admin/stores/${selectedStoreId}/producao?email=${selectedEmailId}`}
                  className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                >
                  Ver email gerado
                </a>
              )}
            </div>
          )}
              </div>
            )}
          </EGCard>

      {/* Preview vars panel */}
      {(previewVars || previewError) && (
        <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-slate-700 dark:text-white/80" />
              <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">
                Vars resolvidas — HTML Agent v2
              </h3>
              {previewVars && (
                <span className="text-[11px] text-slate-400 dark:text-white/40">
                  {Object.keys(previewVars).length} keys
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={clearPreview}
              className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-white/60"
            >
              fechar
            </button>
          </div>
          {previewError ? (
            <div className="flex items-start gap-2 rounded-[4px] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-3 py-2 text-[12px] text-red-800 dark:text-red-200">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{previewError}</span>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[480px] overflow-y-auto">
              {previewVars &&
                Object.entries(previewVars).map(([key, value]) => {
                  const isEmpty = !value || value.trim() === ""
                  const isLong = value.length > 200
                  return (
                    <details
                      key={key}
                      className="rounded-[4px] bg-slate-50 dark:bg-white/[0.03] px-3 py-2"
                      open={!isLong && !isEmpty}
                    >
                      <summary className="flex items-center justify-between cursor-pointer text-[12px]">
                        <code className="font-mono font-semibold text-slate-800 dark:text-white/90">
                          {`{{${key}}}`}
                        </code>
                        <span className="text-[10px] text-slate-400 dark:text-white/35">
                          {isEmpty ? "vazio" : `${value.length} chars`}
                        </span>
                      </summary>
                      <pre className="mt-2 text-[11px] font-mono whitespace-pre-wrap break-all text-slate-600 dark:text-white/70 max-h-[300px] overflow-y-auto">
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
      </div>
    </div>
  )
}
