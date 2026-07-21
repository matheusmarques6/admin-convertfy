"use client"

/**
 * Aba Testar do hub de Geração de Emails (3 modos de execução + polling de
 * batch + preview de vars). Extraída de `email-generation-workspace.tsx`.
 */

import { useState, useEffect } from "react"
import useSWR from "swr"
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

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface StoreOption {
  id: string
  store_name: string
}

interface FlowOption {
  id: string
  flow_type: string
  name: string
  emails: Array<{
    id: string
    number: number
    name: string
    status: string
    subject: string | null
  }>
}

interface RunStep {
  agent: string
  status: "pending" | "success" | "error" | "skipped" | "running"
  error?: string
  durationMs?: number
  tokens?: number
  cost?: number
}

/**
 * Normaliza qualquer payload de erro (string, Error-like, objeto da API) para
 * texto legível. Evita o clássico "[object Object]" quando a resposta traz o
 * erro como objeto (ex.: { error: { message, code } } ou um PostgrestError).
 */
function errText(x: unknown): string {
  if (x == null) return ""
  if (typeof x === "string") return x
  if (typeof x === "object") {
    const o = x as Record<string, unknown>
    for (const k of ["error", "message", "reason", "failure_reason", "detail"]) {
      if (typeof o[k] === "string") return o[k] as string
    }
    try {
      return JSON.stringify(x)
    } catch {
      return String(x)
    }
  }
  return String(x)
}

export function TestTab() {
  const { data: storesData, isLoading: loadingStores } = useSWR<{ stores: StoreOption[] }>(
    "/api/admin/stores",
    fetcher,
  )
  const stores = storesData?.stores ?? []

  const [selectedStoreId, setSelectedStoreId] = useState("")
  const [selectedFlowId, setSelectedFlowId] = useState("")
  const [selectedEmailId, setSelectedEmailId] = useState("")
  const [testContext, setTestContext] = useState("")
  const [generating, setGenerating] = useState(false)
  const [batchId, setBatchId] = useState<string | null>(null)
  const [result, setResult] = useState<{
    status: "done" | "error" | "dispatched" | "running"
    error?: string
    message?: string
    batchId?: string
    emailId?: string
    relaxedBrand?: boolean
  } | null>(null)
  const [steps, setSteps] = useState<RunStep[]>([])
  const [pollInterval, setPollInterval] = useState(0)
  const [showHistory, setShowHistory] = useState(false)
  // ── Preview de vars HTML resolvidas (debug do Master Prompt v2) ─
  const [previewingVars, setPreviewingVars] = useState(false)
  const [previewVars, setPreviewVars] = useState<Record<string, string> | null>(
    null,
  )
  const [previewError, setPreviewError] = useState<string | null>(null)

  const { data: producaoData, isLoading: loadingFlows } = useSWR<{ flows: FlowOption[] }>(
    selectedStoreId ? `/api/admin/stores/${selectedStoreId}/producao` : null,
    fetcher,
  )
  const flows = producaoData?.flows ?? []

  const selectedFlow = flows.find((f) => f.id === selectedFlowId)
  const selectedEmail = selectedFlow?.emails.find((e) => e.id === selectedEmailId)

  const { data: statusData } = useSWR(
    batchId && selectedStoreId
      ? `/api/admin/stores/${selectedStoreId}/generation-status/${batchId}`
      : null,
    fetcher,
    {
      refreshInterval: pollInterval,
      revalidateOnFocus: false,
    },
  )

  const statusInfo = statusData?.data ?? statusData

  // Estado terminal do polling — usado tanto p/ parar o polling quanto p/
  // reconciliar a UI (esconder a msg "rodando em background" quando acabou).
  const isTerminalStatus = Boolean(
    statusInfo &&
      (statusInfo.status === "done" ||
        statusInfo.status === "error" ||
        statusInfo.email_status === "failed" ||
        statusInfo.email_status === "ready"),
  )

  // Texto do estagio atual da fase 2, derivado do email_status do polling —
  // evita o loading "mudo" e a mensagem inicial congelada do `result`.
  const phaseMessage = ((): string | null => {
    switch (statusInfo?.email_status) {
      case "pending":
        return "Na fila…"
      case "copy_generating":
      case "copy_generating_recovery":
        return "Gerando copy…"
      case "copy_ready":
        return "Copy pronta — gerando imagem…"
      case "rendering":
      case "image_done":
        return "Imagem pronta — gerando HTML…"
      case "qa_running":
        return "HTML pronto — validando (QA)…"
      default:
        return null
    }
  })()

  useEffect(() => {
    if (isTerminalStatus && pollInterval > 0) {
      setPollInterval(0)
    }
  }, [isTerminalStatus, pollInterval])

  // Detecta inatividade — se o pipeline esta numa fase in-flight (rendering,
  // image_done, qa_running) e nao houve atualizacao ha >90s, mostra warning
  // pro usuario explicando que o watchdog vai limpar em breve.
  const [showStaleWarning, setShowStaleWarning] = useState(false)

  useEffect(() => {
    if (!statusInfo || pollInterval === 0) {
      setShowStaleWarning(false)
      return
    }

    const checkStale = () => {
      const runs = (statusInfo.runs ?? []) as Array<{ created_at?: string }>
      const lastRun = runs[runs.length - 1]
      const lastTs = lastRun?.created_at ?? statusInfo.email_updated_at
      if (!lastTs) {
        setShowStaleWarning(false)
        return
      }
      const ageMs = Date.now() - new Date(lastTs).getTime()
      const isInFlight = ["rendering", "image_done", "qa_running"].includes(
        statusInfo.email_status ?? "",
      )
      setShowStaleWarning(isInFlight && ageMs > 90 * 1000)
    }

    checkStale()
    const interval = setInterval(checkStale, 15_000)
    return () => clearInterval(interval)
  }, [statusInfo, pollInterval])

  const handleGenerate = async (phase2Only = false, fullPipeline = false) => {
    if (!selectedStoreId || !selectedFlowId || !selectedEmailId || !selectedFlow || !selectedEmail) return

    setGenerating(true)
    setResult(null)
    setBatchId(null)
    setSteps(
      phase2Only
        ? [
            { agent: "image", status: "pending" },
            { agent: "html", status: "pending" },
            { agent: "refiner", status: "pending" },
          ]
        : [
            { agent: "assembler", status: "pending" },
            { agent: "blueprint", status: "pending" },
            { agent: "seed", status: "pending" },
            { agent: "copy", status: "pending" },
            { agent: "image", status: "pending" },
            { agent: "html", status: "pending" },
            { agent: "refiner", status: "pending" },
          ],
    )

    try {
      const res = await fetch(`/api/admin/stores/${selectedStoreId}/generate-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase2_only: phase2Only,
          full_pipeline: fullPipeline,
          flowId: selectedFlowId,
          emailId: selectedEmailId,
          flowType: selectedFlow.flow_type,
          emailNumber: selectedEmail.number,
          ...(testContext.trim() ? { test_context: testContext.trim() } : {}),
        }),
      })

      const text = await res.text()
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error(
          res.status === 504 || text.includes("timed out")
            ? "Timeout: a função do servidor expirou (300s). Verifique qual fase travou em /admin/settings/email-generation-logs e tente novamente."
            : `Resposta inválida do servidor (HTTP ${res.status})`,
        )
      }
      const responseData = (parsed?.data ?? parsed) as Record<string, unknown>

      if (!res.ok) {
        throw new Error(errText(responseData?.error) || `HTTP ${res.status}`)
      }

      const respStatus = responseData.status as string
      const isError = respStatus === "error"
      const isDispatched = respStatus === "dispatched"
      const isRunning = respStatus === "running"
      const isFullPipeline = responseData.fullPipeline === true
      const errMsg =
        responseData.error != null ? errText(responseData.error) : undefined
      setResult({
        status: isError
          ? "error"
          : isDispatched
            ? "dispatched"
            : isRunning
              ? "running"
              : "done",
        error: isError
          ? errMsg || "Falha na geração (sem detalhe retornado)"
          : errMsg,
        message: isFullPipeline
          ? "Geração completa: fase 1 (Curador → Montador → Blueprint) concluída e copy nova disparada ao N8N só deste e-mail. Ao chegar a copy, a fase 2 (imagem → HTML → QA) roda sozinha — esta página atualiza automaticamente."
          : isDispatched
            ? "Sem copy detectada — disparado ao N8N (Montador → Blueprint → seed → N8N). O render (imagem/HTML/QA) virá depois, após o callback da copy."
            : isRunning
              ? "Montador e Blueprint concluídos. Render (imagem + HTML + QA) rodando em background — esta página atualiza sozinha."
              : undefined,
        batchId: responseData.batchId as string | undefined,
        emailId: responseData.emailId as string | undefined,
        relaxedBrand: responseData.relaxedBrand === true,
      })
      // Polling no caminho síncrono (with_copy), no "running" (phase2 em
      // background) E no teste "Geração completa" (dispatched + fullPipeline:
      // a copy vem async e a fase 2 dispara sozinha no copy_ready). Só pula no
      // "dispatched" comum, cujo render vem sob outro batch.
      if (responseData.batchId && (!isDispatched || isFullPipeline)) {
        setBatchId(responseData.batchId as string)
        setPollInterval(2000)
      }
    } catch (err) {
      setResult({
        status: "error",
        error: err instanceof Error ? err.message : "Erro desconhecido",
      })
    } finally {
      setGenerating(false)
    }
  }

  const handlePreviewVars = async () => {
    if (!selectedStoreId || !selectedEmailId) return
    setPreviewingVars(true)
    setPreviewError(null)
    setPreviewVars(null)
    try {
      const res = await fetch(
        `/api/admin/stores/${selectedStoreId}/preview-html-vars`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emailId: selectedEmailId }),
        },
      )
      const text = await res.text()
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error(`Resposta inválida (HTTP ${res.status})`)
      }
      const data = (parsed?.data ?? parsed) as Record<string, unknown>
      if (!res.ok) {
        throw new Error(errText(data?.error) || `HTTP ${res.status}`)
      }
      setPreviewVars(data.vars as Record<string, string>)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setPreviewingVars(false)
    }
  }

  const agentLabels: Record<string, string> = {
    assembler: "Montador",
    blueprint: "Blueprint (estrutura)",
    seed: "Seed Blocos",
    copy: "Copy (IA)",
    image: "Imagem (IA)",
    html: "HTML (IA)",
    refiner: "Refinador (IA)",
  }

  const statusIcon = (s: string) => {
    switch (s) {
      case "success": return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      case "error": return <AlertCircle className="h-4 w-4 text-red-500" />
      case "running": return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
      case "skipped": return <Clock className="h-4 w-4 text-slate-400" />
      default: return <Clock className="h-4 w-4 text-slate-300 dark:text-white/20" />
    }
  }

  const hasRun = Boolean(result || generating || statusInfo)

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
                  onChange={(v) => {
                    setSelectedStoreId(v)
                    setSelectedFlowId("")
                    setSelectedEmailId("")
                    setResult(null)
                    setBatchId(null)
                  }}
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
                      onChange={(v) => {
                        setSelectedFlowId(v)
                        setSelectedEmailId("")
                        setResult(null)
                        setBatchId(null)
                      }}
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
                    onChange={(v) => {
                      setSelectedEmailId(v)
                      setResult(null)
                      setBatchId(null)
                    }}
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
                generating ||
                !selectedStoreId ||
                !selectedFlowId ||
                !selectedEmailId
              }
              title="Fluxo completo real: fase 1 (Curador → Montador → Blueprint) → copy NOVA via n8n só deste e-mail → fase 2 (imagem → HTML → QA) automática. Assíncrono."
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
                  generating ||
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
                  generating ||
                  !selectedStoreId ||
                  !selectedFlowId ||
                  !selectedEmailId
                }
                title="Reusa Montador/Blueprint/copy existentes e roda só imagem → HTML → QA (requer copy no email)"
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
          {/* Status header */}
          <div className="flex items-center gap-2">
            {result?.status === "dispatched" ? (
              <Clock className="h-5 w-5 text-blue-500" />
            ) : statusInfo?.status === "done" || result?.status === "done" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : statusInfo?.status === "error" || result?.status === "error" ? (
              <AlertCircle className="h-5 w-5 text-red-500" />
            ) : (
              <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
            )}
            <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">
              {result?.status === "dispatched"
                ? "Copy disparada ao N8N"
                : statusInfo?.status === "done" || result?.status === "done"
                  ? "Geração concluída"
                  : statusInfo?.status === "error" || result?.status === "error"
                    ? "Erro na geração"
                    : "Gerando email..."}
            </h3>
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
              rendering: "imagem",
              image_done: "HTML",
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
            const allRuns = (statusInfo.runs ?? []) as Array<{
              agent: string
              status: string
              error_message?: string
              duration_ms?: number
              tokens_input?: number
              tokens_output?: number
              cost_cents?: number
              batch_id?: string
              created_at?: string
            }>
            const currentBatchId =
              (statusInfo as { currentBatchId?: string }).currentBatchId ?? batchId
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

            const agentKeys = [
              "assembler",
              "blueprint",
              "seed",
              "copy",
              "image",
              "html",
              "refiner",
            ] as const

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
                              (batches antigos não têm refiner — sem linha fantasma). */}
                          {agentKeys
                            .filter((agent) => batchRuns.some((r) => r.agent === agent))
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
                disabled={generating || !selectedStoreId || !selectedFlowId || !selectedEmailId}
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
              onClick={() => {
                setPreviewVars(null)
                setPreviewError(null)
              }}
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
