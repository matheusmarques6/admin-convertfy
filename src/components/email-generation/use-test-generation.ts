"use client"

/**
 * useTestGeneration — estado + mecânica do teste de geração, extraídos de
 * test-tab.tsx (ago/2026) para serem compartilhados entre a aba Testar do
 * hub e a aba Teste do Estúdio de Agentes (dois modos de visualização
 * sobre a MESMA execução).
 *
 * Extração mecânica: a lógica é a do test-tab original, endurecida por
 * incidentes — recovery de batch após timeout 504 (Luxe Lift 27/07),
 * anti-trava do polling, teto de 25min alinhado ao watchdog, aviso de
 * inatividade. Derivações puras vivem em @/lib/agents/test-run-view.
 */

import { useCallback, useEffect, useState } from "react"
import useSWR from "swr"

import {
  canRecoverAfterInterrupt,
  isNetworkFailure,
  isTimeoutMarker,
  computeStale,
  errText,
  expectedSteps,
  isTerminalStatus as isTerminal,
  phaseMessage as derivePhaseMessage,
  type RunStep,
  type TestRunMode,
} from "@/lib/agents/test-run-view"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export interface StoreOption {
  id: string
  store_name: string
}

export interface FlowOption {
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

export interface TestStatusRun {
  id?: string
  agent: string
  status: string
  error_message?: string
  duration_ms?: number
  tokens_input?: number
  tokens_output?: number
  cost_cents?: number
  retry_count?: number
  batch_id?: string
  created_at?: string
}

export interface TestStatusInfo {
  status?: string
  currentBatchId?: string
  email_status?: string | null
  /** POR QUE falhou (hero_failed, qa_failed…) — o header traduz. */
  email_failure_reason?: string | null
  html_pipeline_stage?: string | null
  email_updated_at?: string | null
  runs?: TestStatusRun[]
  summary?: {
    totalCost: number
    totalDuration: number
    tokensTotal: number
  }
}

export interface TestResult {
  status: "done" | "error" | "dispatched" | "running"
  error?: string
  message?: string
  batchId?: string
  emailId?: string
  relaxedBrand?: boolean
}

export function useTestGeneration() {
  const { data: storesData, isLoading: loadingStores } = useSWR<{
    stores: StoreOption[]
  }>("/api/admin/stores", fetcher)
  const stores = storesData?.stores ?? []

  const [selectedStoreId, setSelectedStoreId] = useState("")
  const [selectedFlowId, setSelectedFlowId] = useState("")
  const [selectedEmailId, setSelectedEmailId] = useState("")
  const [testContext, setTestContext] = useState("")
  const [generating, setGenerating] = useState(false)
  const [batchId, setBatchId] = useState<string | null>(null)
  const [result, setResult] = useState<TestResult | null>(null)
  const [steps, setSteps] = useState<RunStep[]>([])
  const [pollInterval, setPollInterval] = useState(0)
  /** Último modo disparado — recorta a projeção do canvas por nós. */
  const [lastMode, setLastMode] = useState<TestRunMode>("default")

  // ── Preview de vars HTML resolvidas (debug do Master Prompt v2) ─
  const [previewingVars, setPreviewingVars] = useState(false)
  const [previewVars, setPreviewVars] = useState<Record<string, string> | null>(
    null,
  )
  const [previewError, setPreviewError] = useState<string | null>(null)

  const { data: producaoData, isLoading: loadingFlows } = useSWR<{
    flows: FlowOption[]
  }>(
    selectedStoreId ? `/api/admin/stores/${selectedStoreId}/producao` : null,
    fetcher,
  )
  const flows = producaoData?.flows ?? []

  const selectedFlow = flows.find((f) => f.id === selectedFlowId)
  const selectedEmail = selectedFlow?.emails.find(
    (e) => e.id === selectedEmailId,
  )

  const { data: statusData, error: statusError } = useSWR(
    batchId && selectedStoreId
      ? `/api/admin/stores/${selectedStoreId}/generation-status/${batchId}`
      : null,
    fetcher,
    {
      refreshInterval: pollInterval,
      revalidateOnFocus: false,
    },
  )

  const statusInfo: TestStatusInfo | null =
    (statusData?.data ?? statusData) as TestStatusInfo | null

  // Estado terminal do polling — usado tanto p/ parar o polling quanto p/
  // reconciliar a UI (esconder a msg "rodando em background" quando acabou).
  const isTerminalStatus = isTerminal(statusInfo)

  // Geração em voo = request em curso OU polling ativo de um batch ainda
  // não-terminal. Usado pra desabilitar os botões de disparo — reclicar
  // durante uma geração abria pipeline duplicado (o server também bloqueia,
  // mas aqui evitamos até o convite). Escapes anti-trava: sem batch não há
  // voo; erro persistente do fetch de status não pode congelar os botões.
  const generationInFlight =
    generating ||
    (pollInterval > 0 && batchId != null && !statusError && !isTerminalStatus)

  // Texto do estágio atual da fase 2, derivado do email_status do polling.
  const phaseMessage = derivePhaseMessage(
    statusInfo?.email_status,
    statusInfo?.html_pipeline_stage,
  )

  useEffect(() => {
    if (isTerminalStatus && pollInterval > 0) {
      setPollInterval(0)
    }
  }, [isTerminalStatus, pollInterval])

  // Anti-trava: erro persistente no fetch de status (500/rede) ou polling
  // sem batch derruba o polling — senão generationInFlight congelaria os
  // botões pra sempre (o watchdog do servidor cuida da geração em si).
  useEffect(() => {
    if (pollInterval > 0 && (statusError || batchId == null)) {
      setPollInterval(0)
    }
  }, [pollInterval, statusError, batchId])

  // ── Cronômetro: tempo total decorrido + tempo ao vivo por agente ─────
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const timerActive = startedAt != null && (generating || pollInterval > 0)
  useEffect(() => {
    if (!timerActive) return
    const t = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [timerActive])

  // Teto do polling: 25min sem chegar a estado terminal (mesma janela do
  // watchdog PHASE2_TIMEOUT_MIN) → para de acompanhar e libera os botões.
  useEffect(() => {
    if (
      pollInterval > 0 &&
      startedAt != null &&
      nowTick - startedAt > 25 * 60_000
    ) {
      setPollInterval(0)
    }
  }, [pollInterval, startedAt, nowTick])

  // Detecta inatividade — fase in-flight sem atualização há >90s → warning
  // explicando que o watchdog vai limpar em breve.
  const [showStaleWarning, setShowStaleWarning] = useState(false)

  useEffect(() => {
    if (!statusInfo || pollInterval === 0) {
      setShowStaleWarning(false)
      return
    }

    const checkStale = () => {
      const runs = statusInfo.runs ?? []
      const lastRun = runs[runs.length - 1]
      setShowStaleWarning(
        computeStale({
          emailStatus: statusInfo.email_status,
          lastRunCreatedAt: lastRun?.created_at ?? null,
          // Run em `running` = step trabalhando dentro do próprio budget
          // (até 540s na Formatação de Texto) — limiar maior, sem alarme
          // falso.
          lastRunStatus: lastRun?.status ?? null,
          emailUpdatedAt: statusInfo.email_updated_at ?? null,
          nowMs: Date.now(),
        }),
      )
    }

    checkStale()
    const interval = setInterval(checkStale, 15_000)
    return () => clearInterval(interval)
  }, [statusInfo, pollInterval])

  /**
   * Após timeout do gateway, o servidor já persistiu generation_batch_id no
   * email (claim antes da fase 1) — busca pra retomar o polling sem reclique.
   */
  const recoverBatchIdAfterTimeout = useCallback(async (): Promise<
    string | null
  > => {
    if (!selectedStoreId || !selectedEmailId) return null
    try {
      // flow_id restringe a resposta (o endpoint devolve html+blocks por
      // email — a loja inteira seriam MBs pra ler um único campo).
      const qs = selectedFlowId ? `?flow_id=${selectedFlowId}` : ""
      const res = await fetch(
        `/api/admin/stores/${selectedStoreId}/emails${qs}`,
      )
      if (!res.ok) return null
      // successResponse espalha os dados na RAIZ ({success, emails, ...});
      // o fallback .data cobre wrappers de proxy/versões antigas.
      const json = (await res.json()) as Record<string, unknown>
      const root = (json.data ?? json) as {
        emails?: Array<{
          id: string
          generation_batch_id: string | null
          auto_phase2_relaxed?: boolean | null
        }>
      }
      const emails = root.emails ?? []
      const alvo = emails.find((e) => e.id === selectedEmailId)
      // O batch sozinho NÃO prova que esta geração começou: quando a rede
      // cai na IDA, a requisição nem chega ao servidor e o email ainda
      // carrega o batch da geração ANTERIOR — acompanhá-lo faria a tela
      // anunciar "pronto" para algo que nunca rodou.
      //
      // `auto_phase2_relaxed` é gravado pelo claim na MESMA operação que o
      // batch, antes da fase 1 (test-generation.service): ele é a prova de
      // que o servidor pegou o trabalho.
      if (alvo?.auto_phase2_relaxed !== true) return null
      return alvo.generation_batch_id ?? null
    } catch {
      return null
    }
  }, [selectedStoreId, selectedEmailId, selectedFlowId])

  const handleGenerate = useCallback(
    async (phase2Only = false, fullPipeline = false) => {
      if (
        !selectedStoreId ||
        !selectedFlowId ||
        !selectedEmailId ||
        !selectedFlow ||
        !selectedEmail
      )
        return

      setGenerating(true)
      setResult(null)
      setBatchId(null)
      setStartedAt(Date.now())
      setNowTick(Date.now())
      const mode: TestRunMode = phase2Only
        ? "phase2"
        : fullPipeline
          ? "full"
          : "default"
      setLastMode(mode)
      setSteps(expectedSteps(mode))

      try {
        const res = await fetch(
          `/api/admin/stores/${selectedStoreId}/generate-email`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phase2_only: phase2Only,
              full_pipeline: fullPipeline,
              flowId: selectedFlowId,
              emailId: selectedEmailId,
              flowType: selectedFlow.flow_type,
              emailNumber: selectedEmail.number,
              ...(testContext.trim()
                ? { test_context: testContext.trim() }
                : {}),
            }),
          },
        )

        const text = await res.text()
        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(text)
        } catch {
          throw new Error(
            res.status === 504 || text.includes("timed out")
              ? "__timeout__: a conexão com o servidor expirou (300s)."
              : `Resposta inválida do servidor (HTTP ${res.status})`,
          )
        }
        const responseData = (parsed?.data ?? parsed) as Record<
          string,
          unknown
        >

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
            ? "Geração completa: fase 1 (Curador → Montador → Blueprint) concluída e copy nova disparada ao N8N só deste e-mail. Ao chegar a copy, a fase 2 (imagem → montagem HTML em 4 agentes → QA) roda sozinha — esta página atualiza automaticamente."
            : isDispatched
              ? "Sem copy detectada — disparado ao N8N (Montador → Blueprint → seed → N8N). O render (imagem → montagem HTML → QA) virá depois, após o callback da copy."
              : isRunning
                ? "Montador e Blueprint concluídos. Render (imagem → montagem HTML → QA) rodando em background — esta página atualiza sozinha."
                : undefined,
          batchId: responseData.batchId as string | undefined,
          emailId: responseData.emailId as string | undefined,
          relaxedBrand: responseData.relaxedBrand === true,
        })
        // Polling no caminho síncrono (with_copy), no "running" (phase2 em
        // background) E no teste "Geração completa" (dispatched + fullPipeline:
        // a copy vem async e a fase 2 dispara sozinha no copy_ready). Só pula
        // no "dispatched" comum, cujo render vem sob outro batch.
        if (responseData.batchId && (!isDispatched || isFullPipeline)) {
          setBatchId(responseData.batchId as string)
          setPollInterval(2000)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido"
        // Conexão interrompida ≠ geração morta: no teste completo a fase 1
        // é síncrona (~4-5min) e o TRABALHO CONTINUA no servidor depois do
        // corte. Reclicar aqui abria um pipeline duplicado (incidente Luxe
        // Lift 27/07). Duas interrupções contam — o marcador __timeout__
        // (o gateway respondeu 504) e a queda de rede (o fetch LANÇOU, sem
        // resposta nenhuma). Erro RELATADO pelo servidor nunca entra aqui:
        // casar texto de erro do servidor mascararia falha real. E o
        // recovery só vale no fullPipeline, o único caminho cujo claim
        // grava o batch ANTES da fase 1.
        if (canRecoverAfterInterrupt(err, msg, fullPipeline)) {
          const recovered = await recoverBatchIdAfterTimeout()
          if (recovered) {
            setBatchId(recovered)
            setPollInterval(2000)
            setResult({
              status: "running",
              message: isTimeoutMarker(msg)
                ? "A conexão expirou (300s), mas a geração CONTINUA no servidor. " +
                  "Acompanhando pelo batch persistido — não reclique."
                : "A conexão caiu, mas a geração CONTINUA no servidor. " +
                  "Acompanhando pelo batch persistido — não reclique.",
              batchId: recovered,
              emailId: selectedEmailId ?? undefined,
            })
            return
          }
        }
        setResult({
          status: "error",
          // Sem batch recuperado a mensagem tem de dizer o que fazer. Com
          // queda de rede há dois desfechos possíveis, e o operador não
          // tem como distingui-los sozinho a partir de "Failed to fetch".
          error: isTimeoutMarker(msg)
            ? "Timeout: a conexão expirou (300s), mas a geração pode seguir rodando no servidor. Verifique em /admin/settings/email-generation-logs antes de re-testar."
            : isNetworkFailure(err)
              ? "A conexão com o servidor caiu. Se a geração chegou a começar, ela continua rodando — confira em Execuções antes de re-testar."
              : msg,
        })
      } finally {
        setGenerating(false)
      }
    },
    [
      selectedStoreId,
      selectedFlowId,
      selectedEmailId,
      selectedFlow,
      selectedEmail,
      testContext,
      recoverBatchIdAfterTimeout,
    ],
  )

  const handlePreviewVars = useCallback(async () => {
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
  }, [selectedStoreId, selectedEmailId])

  const clearPreview = useCallback(() => {
    setPreviewVars(null)
    setPreviewError(null)
  }, [])

  // Selects com reset encadeado (trocar loja limpa flow/email/execução).
  const selectStore = useCallback((v: string) => {
    setSelectedStoreId(v)
    setSelectedFlowId("")
    setSelectedEmailId("")
    setResult(null)
    setBatchId(null)
    setPollInterval(0)
  }, [])
  const selectFlow = useCallback((v: string) => {
    setSelectedFlowId(v)
    setSelectedEmailId("")
    setResult(null)
    setBatchId(null)
    setPollInterval(0)
  }, [])
  const selectEmail = useCallback((v: string) => {
    setSelectedEmailId(v)
    setResult(null)
    setBatchId(null)
    setPollInterval(0)
  }, [])

  const hasRun = Boolean(result || generating || statusInfo)

  return {
    // seleção
    stores,
    loadingStores,
    flows,
    loadingFlows,
    selectedStoreId,
    selectedFlowId,
    selectedEmailId,
    selectedFlow,
    selectedEmail,
    selectStore,
    selectFlow,
    selectEmail,
    testContext,
    setTestContext,
    // execução
    handleGenerate,
    generating,
    generationInFlight,
    result,
    steps,
    batchId,
    lastMode,
    // polling / derivados
    statusInfo,
    isTerminalStatus,
    phaseMessage,
    showStaleWarning,
    hasRun,
    // cronômetro
    startedAt,
    nowTick,
    timerActive,
    // preview de vars
    handlePreviewVars,
    previewingVars,
    previewVars,
    previewError,
    clearPreview,
  }
}

export type TestGeneration = ReturnType<typeof useTestGeneration>
