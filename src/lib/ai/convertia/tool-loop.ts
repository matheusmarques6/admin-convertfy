/**
 * Loop de tool-calling da ConvertIA — o motor, sem I/O próprio.
 *
 * Tudo que toca o mundo entra por `deps`: o modelo (`callModel`), a
 * execução das tools (via `toolIndex`), o emissor de eventos SSE, a
 * persistência parcial, o cancelamento e o relógio. É o que permite
 * testar o loop inteiro com um stream mockado (tool-loop.test.ts) e
 * rodá-lo tanto na rota (SSE) quanto no job de continuação (sem
 * cliente conectado).
 *
 * O que o loop faz por rodada:
 *   1. checa orçamento de tempo e cancelamento;
 *   2. escolhe o modelo (roteamento por rodada: barato para consultar,
 *      forte para escrever e responder);
 *   3. chama o modelo com cache de prompt; aplica o guard "consulte
 *      antes de responder" (nudge) e o fallback de slug desconhecido;
 *   4. sem tool calls → resposta final; com → executa cada tool com
 *      retry/backoff em erro transitório, gate de confirmação em ação
 *      destrutiva, digest para a memória de consulta e telemetria.
 *
 * Estado compartilhado com quem persiste (`state`): texto da rodada,
 * narrações (progress) e fontes — a rota lê daí no throttle de 2,5s.
 */

import type {
  ChatMessage,
  ChatStreamResult,
  ChatToolCall,
  ChatToolDef,
  StreamChatInput,
} from "@/lib/ai/openrouter-chat"
import type { ConnectorTool, ConnectorToolContext } from "@/lib/ai/connectors/types"
import {
  claimsImpossible,
  defersDecision,
  describeToolArgs,
} from "@/lib/ai/convertia-chat-heuristics"
import { classifyToolError, retryDelayMs, toolErrorContent, type StructuredToolError } from "./tool-errors"
import { digestToolOutput } from "./consult-memory"
import { TurnTelemetry } from "./telemetry"
import type { PendingConfirmation, TurnEvent, TurnSource, TurnStatus } from "./types"

export interface ToolEntry {
  tool: ConnectorTool
  connectorKey: string
  connectorName: string
}

/** Estado vivo do turno — compartilhado com a persistência parcial. */
export interface TurnState {
  roundText: string
  progress: string[]
  sources: TurnSource[]
  /** Confirmação pendente criada neste turno (uma por turno). */
  pendingConfirmation: PendingConfirmation | null
}

export function createTurnState(seed?: Partial<TurnState>): TurnState {
  return {
    roundText: seed?.roundText ?? "",
    progress: seed?.progress ?? [],
    sources: seed?.sources ?? [],
    pendingConfirmation: seed?.pendingConfirmation ?? null,
  }
}

export interface ToolLoopDeps {
  /** Modelo escolhido pelo usuário (forte). Pode mudar por fallback. */
  model: string
  /** Modelo barato para rodadas de consulta (roteamento por rodada). null = desligado. */
  cheapModel?: string | null
  /** Aceita `reasoning` (análise profunda). */
  reasoningSupported: boolean
  deep: boolean
  /** Mensagens do turno (system + histórico + usuário). MUTADO in place. */
  messages: ChatMessage[]
  tools: ChatToolDef[]
  toolIndex: Map<string, ToolEntry>
  toolCtx: ConnectorToolContext
  maxRounds: number
  /** Rodada inicial (continuação em job retoma do meio). */
  startRound?: number
  budget: { startedAt: number; totalMs: number; minRoundMs: number }
  /** Guard "consulte antes de responder". */
  guard: { wantsAnalysis: boolean; wantsAction: boolean }
  /** Chamada ao modelo (streamOpenRouterChat em produção). */
  callModel: (input: StreamChatInput) => Promise<ChatStreamResult>
  /** Fallback de slug desconhecido: devolve o modelo substituto ou null. */
  resolveUnknownModel?: (err: unknown, round: number) => { model: string; notice: string } | null
  emit: (event: TurnEvent) => void
  persistPartial: (force?: boolean) => void
  /** Cancelamento pedido pelo usuário (checado entre rodadas e antes de cada tool). */
  isCancelled: () => boolean
  cancelSignal?: AbortSignal
  state: TurnState
  telemetry: TurnTelemetry
  /**
   * Chamada já APROVADA pelo usuário (gate de confirmação): executa
   * ANTES da 1ª rodada, injetando tool_call + resultado na conversa, e
   * o modelo relata o desfecho.
   */
  preApproved?: Array<{ name: string; args: Record<string, unknown> }>
  /** Gera ids (injetável em teste). */
  newId?: () => string
  clock?: () => number
  sleep?: (ms: number) => Promise<void>
  /** Teto de espera em retry de tool dentro do turno. */
  maxToolRetryWaitMs?: number
}

export interface ToolLoopResult {
  status: TurnStatus
  fullText: string
  /** Modelo efetivamente usado na resposta final. */
  model: string
  errorMessage: string | null
  /**
   * O orçamento acabou COM trabalho pendente (a última rodada chamou
   * tools que já foram executadas, e a próxima rodada não cabe): o
   * turno pode continuar em job com as `messages` atuais.
   */
  resumable: boolean
  nextRound: number
  modelFallback: { requested: string; used: string } | null
}

const MAX_TOOL_RETRIES = 2
const DEFAULT_MAX_TOOL_RETRY_WAIT_MS = 8_000

function defaultId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

function isAbort(err: unknown): boolean {
  return (
    (err as { name?: string })?.name === "AbortError" ||
    /aborted|abort/i.test((err as { message?: string })?.message ?? "")
  )
}

export async function runToolLoop(deps: ToolLoopDeps): Promise<ToolLoopResult> {
  const clock = deps.clock ?? Date.now
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const newId = deps.newId ?? defaultId
  const { state, telemetry, messages, emit } = deps
  const maxToolWait = deps.maxToolRetryWaitMs ?? DEFAULT_MAX_TOOL_RETRY_WAIT_MS
  const requestedModel = deps.model
  let model = deps.model
  let modelFallback: ToolLoopResult["modelFallback"] = null
  let fullText = ""
  let status: TurnStatus = "success"
  let errorMessage: string | null = null
  let resumable = false
  let nudgePending = deps.guard.wantsAnalysis || deps.guard.wantsAction
  let round = deps.startRound ?? 0

  const remaining = () => deps.budget.totalMs - (clock() - deps.budget.startedAt)

  const appendDelta = (text: string) => {
    state.roundText += text
    emit({ type: "delta", text })
    deps.persistPartial()
  }

  const cancelledNow = (): boolean => {
    if (!deps.isCancelled()) return false
    status = "cancelled"
    const aviso = "\n\n_(interrompida pelo usuário)_"
    if (state.roundText || state.progress.length > 0) appendDelta(aviso)
    return true
  }

  // ── Execução de UMA tool com retry, gate e telemetria ────────────
  const executeCall = async (call: ChatToolCall, opts: { approved: boolean }): Promise<string> => {
    const entry = deps.toolIndex.get(call.function.name)
    if (!entry) return `Tool desconhecida: ${call.function.name}`
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>
    } catch {
      /* args ilegíveis — executa com vazio */
    }
    const argsSummary = describeToolArgs(args)
    const source: TurnSource = {
      connector: entry.connectorKey,
      connector_name: entry.connectorName,
      tool: call.function.name,
      label: entry.tool.label,
      summary: null,
      args_summary: argsSummary,
      write: entry.tool.write === true,
    }
    state.sources.push(source)
    emit({
      type: "tool",
      id: call.id,
      status: "start",
      connector: entry.connectorKey,
      connector_name: entry.connectorName,
      name: call.function.name,
      label: entry.tool.label,
      write: entry.tool.write === true,
      args_summary: argsSummary,
    })
    const t0 = clock()
    const finish = (
      content: string,
      summary: string | null,
      err: StructuredToolError | null,
      retries: number,
    ): string => {
      const ms = clock() - t0
      source.summary = summary
      source.ms = ms
      source.retries = retries
      source.error_code = err?.code ?? null
      source.digest = err ? null : digestToolOutput(content)
      telemetry.tool({
        name: call.function.name,
        connector: entry.connectorKey,
        ms,
        ok: !err,
        ...(err ? { error_code: err.code } : {}),
        ...(retries > 0 ? { retries } : {}),
      })
      emit({
        type: "tool",
        id: call.id,
        status: "done",
        summary,
        ms,
        ...(err ? { error_code: err.code } : {}),
        ...(retries > 0 ? { retries } : {}),
      })
      deps.persistPartial(true)
      return content
    }

    // Sem tempo para começar (tool longa + resposta não cabem)
    if (remaining() < deps.budget.minRoundMs) {
      const err: StructuredToolError = {
        code: "timeout",
        message: "Sem tempo neste turno para executar esta ação.",
        hint: "Avise o usuário que a ação ficou pendente e será retomada em seguida.",
      }
      return finish(toolErrorContent(err), "sem tempo", err, 0)
    }

    // Gate de confirmação (ação irreversível) — uma por turno
    const confirmSummary = opts.approved ? null : (entry.tool.confirm?.(args) ?? null)
    if (confirmSummary) {
      if (state.pendingConfirmation) {
        const err: StructuredToolError = {
          code: "needs_confirmation",
          message: `Já existe uma ação aguardando confirmação (${state.pendingConfirmation.label}). Esta também precisa de confirmação — peça ao usuário para confirmar a primeira e repetir o pedido.`,
        }
        return finish(toolErrorContent(err), "aguarda confirmação", err, 0)
      }
      const confirmation: PendingConfirmation = {
        id: newId(),
        connector: entry.connectorKey,
        connector_name: entry.connectorName,
        tool: call.function.name,
        label: entry.tool.label,
        summary: confirmSummary,
        args,
        store_id: deps.toolCtx.storeId,
        created_at: new Date(clock()).toISOString(),
      }
      state.pendingConfirmation = confirmation
      source.confirmation_id = confirmation.id
      emit({ type: "confirm", confirmation })
      const err: StructuredToolError = {
        code: "needs_confirmation",
        message: `Ação irreversível aguardando confirmação do usuário na interface: ${confirmSummary}. Nada foi executado.`,
      }
      return finish(toolErrorContent(err), "aguarda confirmação", err, 0)
    }

    let retries = 0
    for (;;) {
      try {
        const r = await entry.tool.execute(args, deps.toolCtx)
        return finish(r.content, r.summary ?? null, null, retries)
      } catch (err) {
        const structured = classifyToolError(err)
        const wait =
          retries < MAX_TOOL_RETRIES
            ? retryDelayMs(structured, retries, Math.min(maxToolWait, remaining() - deps.budget.minRoundMs))
            : null
        if (wait != null && !deps.isCancelled()) {
          retries += 1
          await sleep(wait)
          continue
        }
        return finish(
          toolErrorContent(structured),
          structured.code === "rate_limited" || structured.code === "quota_exhausted"
            ? `HTTP 429`
            : structured.http_status
              ? `HTTP ${structured.http_status}`
              : structured.code,
          structured,
          retries,
        )
      }
    }
  }

  try {
    // ── Ação já confirmada pelo usuário: executa antes de tudo ─────
    if (deps.preApproved && deps.preApproved.length > 0) {
      const calls: ChatToolCall[] = deps.preApproved.map((p) => ({
        id: `call_${newId()}`,
        type: "function" as const,
        function: { name: p.name, arguments: JSON.stringify(p.args) },
      }))
      messages.push({ role: "assistant", content: null, tool_calls: calls })
      for (const call of calls) {
        const output = await executeCall(call, { approved: true })
        messages.push({ role: "tool", content: output, tool_call_id: call.id })
      }
      emit({ type: "round_end", kind: "progress" })
    }

    for (; round <= deps.maxRounds; round++) {
      if (cancelledNow()) break
      const remainingMs = remaining()
      if (remainingMs < deps.budget.minRoundMs) {
        status = "budget"
        // A última rodada chamou tools (já executadas) e a resposta não
        // cabe: dá para continuar em job.
        resumable = messages[messages.length - 1]?.role === "tool"
        if (!resumable && (state.roundText || state.progress.length > 0)) {
          appendDelta("\n\n_(tempo do turno esgotado — resposta interrompida)_")
        }
        break
      }

      // Roteamento por rodada: o barato só entra em rodada que PODE ser
      // de consulta (nunca na primeira com guard armado, nunca sem
      // tools). Se ele responder "final" ou pedir escrita, a rodada é
      // refeita no forte — o custo extra é uma chamada barata.
      const useCheap =
        Boolean(deps.cheapModel) &&
        deps.cheapModel !== model &&
        deps.tools.length > 0 &&
        !nudgePending
      const activeModel = useCheap ? (deps.cheapModel as string) : model
      const holdDeltas = nudgePending || useCheap
      let held = ""

      const callWith = (m: string) =>
        deps.callModel({
          model: m,
          messages,
          tools: deps.tools.length > 0 ? deps.tools : undefined,
          maxTokens: deps.deep ? 12288 : 4096,
          timeoutMs: Math.min(deps.deep ? 240_000 : 120_000, remainingMs),
          reasoning: deps.deep && deps.reasoningSupported && m === model ? { effort: "medium" } : undefined,
          promptCache: true,
          signal: deps.cancelSignal,
          onDelta: holdDeltas
            ? (text) => {
                held += text
              }
            : appendDelta,
        })

      let result: ChatStreamResult
      let roundModel = activeModel
      try {
        result = await callWith(activeModel)
      } catch (err) {
        if (deps.isCancelled() || (isAbort(err) && deps.cancelSignal?.aborted)) {
          cancelledNow()
          break
        }
        const fb = round === (deps.startRound ?? 0) && activeModel === model
          ? deps.resolveUnknownModel?.(err, round) ?? null
          : null
        if (!fb) throw err
        modelFallback = { requested: requestedModel, used: fb.model }
        model = fb.model
        roundModel = fb.model
        if (holdDeltas) held += fb.notice
        else appendDelta(fb.notice)
        result = await callWith(fb.model)
      }

      const isFinal = result.finishReason !== "tool_calls" || result.toolCalls.length === 0
      const wantsWrite = result.toolCalls.some((c) => deps.toolIndex.get(c.function.name)?.tool.write === true)

      telemetry.round({
        model: roundModel,
        role: useCheap ? "cheap" : "primary",
        ms: result.ms,
        tokens_input: result.tokensInput,
        tokens_output: result.tokensOutput,
        tokens_cached: result.tokensCached,
        tokens_cache_write: result.tokensCacheWrite,
        cost_usd: result.costUsd,
        tool_calls: result.toolCalls.length,
        outcome: isFinal ? "final" : "tools",
      })

      // Rodada barata que quis responder ou escrever: refaz no forte.
      if (useCheap && (isFinal || wantsWrite)) {
        telemetry.setLastOutcome("rerouted")
        held = ""
        const strong = await callWith(model).catch((err) => {
          if (deps.isCancelled()) return null
          throw err
        })
        if (!strong) {
          cancelledNow()
          break
        }
        result = strong
        roundModel = model
        telemetry.round({
          model,
          role: "primary",
          ms: result.ms,
          tokens_input: result.tokensInput,
          tokens_output: result.tokensOutput,
          tokens_cached: result.tokensCached,
          tokens_cache_write: result.tokensCacheWrite,
          cost_usd: result.costUsd,
          tool_calls: result.toolCalls.length,
          outcome:
            result.finishReason !== "tool_calls" || result.toolCalls.length === 0 ? "final" : "tools",
        })
      }
      const finalNow = result.finishReason !== "tool_calls" || result.toolCalls.length === 0

      if (nudgePending) {
        nudgePending = false
        // Três motivos para descartar um passe sem NENHUMA tool:
        // (a) análise respondida de memória; (b) negativa sobre o que
        // a ferramenta faz, sem ter olhado o catálogo; (c) pedido de
        // ação devolvido como pergunta em vez de executado.
        const negou = claimsImpossible(result.text)
        const empurrou = defersDecision(result.text)
        const motivo = finalNow
          ? negou
            ? "negativa"
            : deps.guard.wantsAction && empurrou
              ? "sem-acao"
              : deps.guard.wantsAnalysis
                ? "sem-dados"
                : null
          : null
        if (motivo) {
          telemetry.setLastOutcome("nudged")
          messages.push({ role: "assistant", content: result.text || "(vazio)" })
          messages.push({
            role: "user",
            content:
              motivo === "negativa"
                ? "[verificação automática] Você afirmou que algo não existe ou não é possível SEM ter chamado nenhuma ferramenta neste turno. Isso já saiu errado antes. Agora: (1) liste o catálogo/as operações da ferramenta relevante (a tool de busca/descoberta do conector, quando houver); (2) liste o que já existe na conta; (3) só então responda. Se depois de verificar a limitação for real, diga qual operação você procurou e não encontrou."
                : motivo === "sem-acao"
                  ? "[verificação automática] O usuário PEDIU uma ação e você devolveu uma pergunta em vez de executar. Execute agora com as ferramentas disponíveis: descubra o catálogo se precisar, consulte o que já existe, e faça. Só volte a perguntar se a ação for destrutiva (envio para a base, exclusão) ou se faltar um dado que só o usuário tem — e, nesse caso, faça uma pergunta objetiva depois de já ter adiantado tudo o que dava."
                  : "[verificação automática] Sua resposta não consultou NENHUMA fonte, mas a pergunta pede dados reais. Use as tools de CONSULTA disponíveis agora para buscar os números e responda de novo com base neles — não repita a resposta de memória e não execute ações de escrita para isso.",
          })
          continue
        }
      }
      // Passou no guard (ou rodada barata aceita): solta o retido.
      if (holdDeltas && (held || result.text)) appendDelta(held || result.text)

      if (finalNow) {
        fullText = state.roundText
        break
      }
      if (round === deps.maxRounds) {
        appendDelta("\n\n_(limite de consultas atingido)_")
        fullText = state.roundText
        break
      }

      // Rodada que chamou tools: o texto dela é narração de trabalho.
      if (state.roundText.trim()) state.progress.push(state.roundText.trim())
      state.roundText = ""
      emit({ type: "round_end", kind: "progress" })

      messages.push({ role: "assistant", content: result.text || null, tool_calls: result.toolCalls })

      for (const call of result.toolCalls) {
        if (deps.isCancelled()) {
          const err: StructuredToolError = { code: "cancelled", message: "O usuário interrompeu o turno." }
          messages.push({ role: "tool", content: toolErrorContent(err), tool_call_id: call.id })
          continue
        }
        const output = await executeCall(call, { approved: false })
        messages.push({ role: "tool", content: output, tool_call_id: call.id })
      }
      if (cancelledNow()) break
    }
  } catch (err) {
    status = "error"
    errorMessage = err instanceof Error ? err.message : String(err)
    telemetry.setLastOutcome("error")
  }

  // `status` é mutado dentro de closures (cancelledNow) — o narrowing
  // do TS não enxerga isso; o cast devolve a união completa.
  const finalStatus = status as TurnStatus
  if (finalStatus === "cancelled") telemetry.setLastOutcome("cancelled")
  else if (finalStatus === "budget") telemetry.setLastOutcome("budget")

  // Turno terminou sem passar por um break "final": o que houver é a
  // resposta; sem resposta mas com narração, a narração vira o conteúdo
  // (e sai do processo, senão duplica).
  if (!fullText && state.roundText) fullText = state.roundText
  if (!fullText && state.progress.length > 0 && !resumable) {
    fullText = state.progress.join("\n\n")
    state.progress.length = 0
  }

  return { status: finalStatus, fullText, model, errorMessage, resumable, nextRound: round, modelFallback }
}
