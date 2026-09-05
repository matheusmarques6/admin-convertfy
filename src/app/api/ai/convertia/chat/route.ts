/**
 * POST /api/ai/convertia/chat — o motor da ConvertIA.
 *
 * Chat streaming (SSE) via OpenRouter com loop de tool-calling: o
 * modelo escolhido pelo usuário consulta/executa os conectores ligados
 * no composer (métricas internas, CRM, Shopify/Omnisend/Klaviyo da
 * loja selecionada e servidores MCP externos) e a resposta flui em
 * deltas. Eventos:
 *
 *   {type:'meta', conversation_id, title, message_id}   — 1x no início
 *   {type:'tool', id, connector, name, label, status, summary?, write?, ms?}
 *   {type:'delta', text}
 *   {type:'round_end', kind:'progress'} — o texto da rodada era
 *       narração de trabalho (a rodada terminou chamando tools)
 *   {type:'confirm', confirmation}  — ação irreversível aguarda o
 *       "Confirmar" do usuário (gate da UI)
 *   {type:'done', usage, sources, progress, content, status, continuation?}
 *   {type:'error', message}
 *   data: [DONE]
 *
 * Esta rota faz o que só ela pode: autenticar, validar, resolver a
 * conversa/loja/conectores, montar o prompt e abrir o stream. O loop
 * de tools vive em lib/ai/convertia/tool-loop.ts (puro, testado com
 * stream mockado) e o fechamento do turno em finalize.ts — os mesmos
 * usados pelo job de continuação quando o orçamento de tempo acaba.
 *
 * Persistência PROGRESSIVA: a linha da resposta nasce no início do
 * turno (meta.streaming=true) e é atualizada a cada ~2,5 s. O abort do
 * cliente NÃO cancela o modelo (uma ação de escrita pela metade é pior
 * do que uma resposta que o usuário não viu) — quem cancela é o botão
 * Parar, via meta.cancel_requested. Telemetria por rodada e por tool em
 * meta.usage e ai_usage_events (feature 'convertia').
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { publicOrigin } from "@/lib/api/public-origin"
import { checkAiRateLimit } from "@/lib/services/ai-rate-limit"
import { buildStoreContext } from "@/lib/services/ai-context.service"
import { streamOpenRouterChat, type ChatMessage, type ChatToolDef } from "@/lib/ai/openrouter-chat"
import { resolveConnectors } from "@/lib/ai/connectors/registry"
import { buildImagemConnector } from "@/lib/ai/connectors/imagem"
import { buildRelatorioConnector } from "@/lib/ai/connectors/relatorio"
import type { ConnectorToolContext } from "@/lib/ai/connectors/types"
import {
  CONVERTIA_DEFAULT_MODEL,
  isUnknownModelError,
  resolveConvertiaModel,
} from "@/lib/ai/convertia-models"
import { OpenRouterHttpError } from "@/lib/agents/openrouter-invoke"
import { getConvertiaBudget } from "@/lib/ai/convertia-limits"
import { isActionRequest, isAnalyticalQuestion } from "@/lib/ai/convertia-chat-heuristics"
import { buildConvertiaSystemPrompt } from "@/lib/ai/convertia/system-prompt"
import { supportsPromptCache } from "@/lib/ai/convertia/prompt-cache"
import { buildConsultedBlock, type ConsultedTurn } from "@/lib/ai/convertia/consult-memory"
import { TurnTelemetry } from "@/lib/ai/convertia/telemetry"
import { createTurnState, runToolLoop, type ToolEntry } from "@/lib/ai/convertia/tool-loop"
import { createTurnPersistence, resolveConfirmationAtomic } from "@/lib/ai/convertia/persist"
import { createCancelWatcher } from "@/lib/ai/convertia/cancel"
import { finalizeTurn } from "@/lib/ai/convertia/finalize"
import { friendlyModelErrorText } from "@/lib/ai/convertia/model-errors"
import { stripImagesForJob } from "@/lib/ai/convertia/continuation"
import { HISTORY_LIMIT, parseSummary } from "@/lib/ai/convertia/summary"
import { buildMemoriaConnector, loadApprovedMemories } from "@/lib/ai/convertia/memories"
import { KNOWLEDGE_CONNECTOR_KEY, loadKnowledgeForPrompt } from "@/lib/ai/convertia/knowledge"
import { blocoTranscricoes, buildTranscricoesConnector } from "@/lib/ai/connectors/transcricoes"
import type { PendingConfirmation, TurnSource } from "@/lib/ai/convertia/types"
import { logger } from "@/lib/logger"

const log = logger.child("ConvertiaChat")

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Rodadas de tool-calling. Trabalho de execução real (descobrir o
 * catálogo → listar o que existe → criar → configurar → conferir) não
 * cabia em 6: o modelo batia no teto e devolvia um plano em vez do
 * resultado. O orçamento de tempo abaixo continua sendo o freio duro.
 */
const MAX_TOOL_ROUNDS = 10
/** Análise profunda: mais rodadas de consulta e resposta mais longa. */
const DEEP_TOOL_ROUNDS = 18

/**
 * Orçamento de tempo do turno. maxDuration é 300s: se a função for
 * morta pelo runtime, NADA é persistido e o cliente fica com o texto
 * órfão na tela. Reservamos ~20s para persistência + telemetria e
 * fechamos o stream por conta própria antes disso — o que sobrar de
 * trabalho continua em job (ai_chat_jobs).
 */
const ROUTE_BUDGET_MS = 280_000
/** Abaixo disto não vale começar outra rodada — fecha o que tem. */
const MIN_ROUND_MS = 20_000

/** Modelo barato das rodadas de consulta (roteamento por rodada). */
const CHEAP_MODEL = "moonshotai/kimi-k3"

const attachmentSchema = z.object({
  name: z.string().max(140),
  mime: z.string().max(100),
  /** Imagem: data URL completa (data:image/...;base64,...). Máx ~2,8MB. */
  data_url: z.string().max(2_900_000).optional(),
  /** Arquivo de texto (html/csv/md/txt/json): conteúdo cru. Máx 300KB. */
  text: z.string().max(300_000).optional(),
})

const bodySchema = z.object({
  conversation_id: z.string().uuid().nullable().optional(),
  message: z.string().min(1).max(8000),
  model: z.string().max(80).optional(),
  workspace: z.enum(["operacional", "comercial"]).default("operacional"),
  store_id: z.string().uuid().nullable().optional(),
  connectors: z.array(z.string().max(50)).max(20).default([]),
  skills: z.array(z.string().uuid()).max(20).default([]),
  attachments: z.array(attachmentSchema).max(3).default([]),
  /** Modo análise profunda: plano → coleta ampla → análise completa. */
  deep: z.boolean().default(false),
  /** Roteamento por rodada: modelo barato consulta, o forte responde. */
  economy: z.boolean().default(false),
  /** Advisors/notas da base de conhecimento ligados no composer. */
  advisors: z.array(z.string().max(120)).max(10).default([]),
  /**
   * Resposta ao gate de confirmação de uma ação irreversível proposta
   * no turno anterior. `approve` executa a ação e o modelo relata;
   * `reject` só registra (sem turno).
   */
  approve: z
    .object({
      message_id: z.string().uuid(),
      confirmation_id: z.string().min(4).max(80),
      decision: z.enum(["approve", "reject"]),
    })
    .optional(),
})

function sse(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const rate = checkAiRateLimit(user.id)
    if (!rate.allowed) {
      throw new AppError("Muitas mensagens — aguarde um instante.", 429, "rate-limit")
    }
    const admin = createAdminClient()
    const body = bodySchema.parse(await request.json())

    // Org e guard-rail de custo são independentes — em série custavam
    // dois round-trips antes do primeiro token.
    const [orgId, budget] = await Promise.all([
      resolveOrgId(user.id),
      getConvertiaBudget(admin, user.id),
    ])
    if (budget.exceeded) {
      throw new AppError(
        `Limite diário da ConvertIA atingido (US$ ${(budget.daily_limit_cents / 100).toFixed(2)}). Volta amanhã — ou peça a um admin para ajustar o limite.`,
        429,
        "budget-exceeded",
      )
    }

    const modelInfo = resolveConvertiaModel(body.model)
    // `let`: slug que o OpenRouter não conhece cai para o padrão na 1ª
    // rodada (ver isUnknownModelError) e o resto do turno segue com ele.
    let model = modelInfo.id
    let storeId = body.store_id ?? null

    // A loja da conversa tem de ser da ORG do usuário — sem isso, um
    // UUID de loja alheia no body vazaria o dossiê no system prompt e
    // deixaria a tool de relatório agir sobre loja de outra org. A
    // checagem roda junto com a busca da conversa (independentes).
    let conversationId = body.conversation_id ?? null
    let conversationTitle: string | null = null
    let conversationContext: Record<string, unknown> = {}

    const [storeCheck, convRow] = await Promise.all([
      storeId
        ? admin.from("client_stores").select("id").eq("id", storeId).eq("org_id", orgId).maybeSingle()
        : Promise.resolve({ data: null }),
      conversationId
        ? admin
            .from("ai_chat_conversations")
            .select("id, user_id, title, context")
            .eq("id", conversationId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    if (storeId && !storeCheck.data) {
      log.warn("store fora da org no chat", { store_id: storeId, org_id: orgId })
      storeId = null
    }

    // ── Gate de confirmação: resolve a pendência ANTES de tudo ────
    // O token é o id gravado em meta.pending_confirmation da resposta
    // anterior; uso único (resolved_at). Só o dono da conversa chega
    // aqui (checado abaixo).
    let preApproved: Array<{ name: string; args: Record<string, unknown> }> | undefined
    let approvedSummary: string | null = null
    let pendingApproval: PendingConfirmation | null = null
    if (body.approve) {
      if (!conversationId) throw new AppError("Confirmação sem conversa", 422, "validation")
      const { data: prev } = await admin
        .from("ai_chat_messages")
        .select("id, conversation_id, meta")
        .eq("id", body.approve.message_id)
        .eq("conversation_id", conversationId)
        .maybeSingle()
      const pending = (prev?.meta as { pending_confirmation?: PendingConfirmation } | null)?.pending_confirmation
      if (!prev || !pending || pending.id !== body.approve.confirmation_id) {
        throw new AppError("Confirmação não encontrada", 404, "not-found")
      }
      if (pending.resolved_at) {
        throw new AppError("Esta ação já foi confirmada ou cancelada.", 409, "conflict")
      }
      pendingApproval = pending
    }

    // ── Conversa (cria com o contexto do composer) ────────────────
    if (conversationId) {
      const conv = convRow.data as { user_id: string; title: string; context: Record<string, unknown> | null } | null
      if (!conv || conv.user_id !== user.id) {
        throw new AppError("Conversa não encontrada", 404, "not-found")
      }
      conversationTitle = conv.title
      conversationContext = conv.context ?? {}
    } else {
      const title = body.message.replace(/\s+/g, " ").trim().slice(0, 64)
      const { data: created, error } = await admin
        .from("ai_chat_conversations")
        .insert({
          org_id: orgId,
          user_id: user.id,
          title,
          context: {
            source: "convertia",
            workspace: body.workspace,
            store_id: storeId,
            model,
            connectors: body.connectors,
          },
        })
        .select("id, title")
        .single()
      if (error) throw error
      conversationId = created.id
      conversationTitle = created.title
    }

    // Daqui em diante a conversa existe (criada ou validada).
    const convId: string = conversationId as string

    // Cancelar: resolve (atômico, uso único) e encerra sem turno.
    if (body.approve && pendingApproval && body.approve.decision === "reject") {
      const ok = await resolveConfirmationAtomic(admin, body.approve.message_id, pendingApproval.id, "rejected")
      if (!ok) throw new AppError("Esta ação já foi confirmada ou cancelada.", 409, "conflict")
      await admin.from("ai_chat_messages").insert({
        conversation_id: convId,
        role: "user",
        content: `[Cancelado] ${pendingApproval.summary}`,
        meta: { confirmation: { id: pendingApproval.id, decision: "reject" } },
      })
      return successResponse(request, { ok: true, rejected: true, conversation_id: convId })
    }
    // Aprovar: a ação foi proposta para UMA loja — com outra loja
    // selecionada, a mesma chamada bateria em outra conta. Recusa SEM
    // queimar o token (o usuário volta pra loja certa e confirma).
    if (pendingApproval && (pendingApproval.store_id ?? null) !== storeId) {
      throw new AppError(
        "Esta ação foi proposta com outra loja selecionada — selecione a mesma loja da conversa e confirme de novo.",
        409,
        "conflict",
      )
    }

    // ── Histórico + contexto ─────────────────────────────────────
    const [{ data: history }, storeContext, { data: skillRows }, memories, knowledge, transcricoes] = await Promise.all([
      admin
        .from("ai_chat_messages")
        .select("id, role, content, meta, created_at")
        .eq("conversation_id", convId)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: false })
        .limit(HISTORY_LIMIT),
      storeId ? buildStoreContext(storeId).catch(() => "") : Promise.resolve(""),
      body.skills.length > 0
        ? admin
            .from("ai_skills")
            .select("id, name, instructions")
            .eq("org_id", orgId)
            .eq("is_active", true)
            .in("id", body.skills)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; instructions: string }> }),
      loadApprovedMemories(admin, orgId, storeId),
      loadKnowledgeForPrompt(admin, orgId, body.advisors, {
        enabled: body.connectors.includes(KNOWLEDGE_CONNECTOR_KEY) || body.advisors.length > 0,
      }),
      // Transcrições entram sozinhas quando alguma coleção está com a
      // faísca ligada — o toggle é lá, na árvore de coleções.
      blocoTranscricoes(admin, orgId).catch(() => ({ bloco: "", disponivel: false })),
    ])

    // Custo de geração de imagem (fora do stream do chat) — somado nos
    // totais do turno pelo callback do conector.
    const imageCost = { cents: 0, tokensInput: 0, tokensOutput: 0 }

    const connectors = await resolveConnectors({
      admin,
      orgId,
      storeId,
      enabled: body.connectors,
    })
    // Tools de CONSULTA de dados (conectores toggláveis) — o guard
    // "consulte antes de responder" só se arma quando existe pelo menos
    // uma; imagem/relatório/memória (sempre presentes) não contam.
    let dataToolCount = connectors.reduce((n, c) => n + c.tools.length, 0)
    // Base de conhecimento (Obsidian) — consulta, quando ligada (conta
    // como fonte de dados para o guard)
    if (knowledge.connector) {
      connectors.push(knowledge.connector)
      dataToolCount += knowledge.connector.tools.length
    }
    // Transcrições da casa — só quando há coleção na base COM peça pronta
    // (sem isso o modelo teria a tool e nada para achar).
    if (transcricoes.disponivel) {
      const conector = buildTranscricoesConnector()
      connectors.push(conector)
      dataToolCount += conector.tools.length
    }
    // Geração de imagem: sempre disponível (não é toggle do composer)
    connectors.push(
      buildImagemConnector({
        origin: publicOrigin(request),
        onCost: (cents, tIn, tOut) => {
          imageCost.cents += cents
          imageCost.tokensInput += tIn
          imageCost.tokensOutput += tOut
        },
      }),
    )
    // Relatório mensal da loja: gera pelo sistema oficial — precisa do
    // cookie da sessão (o snapshot consulta endpoints internos autenticados)
    connectors.push(
      buildRelatorioConnector({
        origin: request.nextUrl.origin,
        cookie: request.headers.get("cookie") ?? "",
      }),
    )

    // Aprovar (continuação): o conector da ação precisa estar ligado
    // AGORA; só então o token é consumido (atômico — clique duplo ou
    // duas abas executam uma vez).
    if (body.approve && pendingApproval) {
      const toolAvailable = connectors.some((c) => c.tools.some((t) => t.def.function.name === pendingApproval.tool))
      if (!toolAvailable) {
        throw new AppError(
          `O conector desta ação (${pendingApproval.connector_name}) não está ligado nesta conversa — ligue-o no menu + e confirme de novo.`,
          409,
          "conflict",
        )
      }
      const ok = await resolveConfirmationAtomic(admin, body.approve.message_id, pendingApproval.id, "approved")
      if (!ok) throw new AppError("Esta ação já foi confirmada ou cancelada.", 409, "conflict")
      preApproved = [{ name: pendingApproval.tool, args: pendingApproval.args }]
      approvedSummary = pendingApproval.summary
    }

    const skills = (skillRows ?? []).map((s) => ({ name: s.name, instructions: s.instructions }))
    const skillNames = skills.map((s) => s.name)

    // ── Persiste a mensagem do usuário ───────────────────────────
    // Anexos: arquivos de texto entram INLINE (viram parte do
    // histórico — turnos futuros seguem enxergando o HTML de
    // referência); imagens vão como conteúdo multimodal só neste turno
    // (data URL não é re-enviada do histórico).
    const textAttachments = body.attachments.filter((a) => typeof a.text === "string")
    const imageAttachments = body.attachments.filter(
      (a) => typeof a.data_url === "string" && a.data_url.startsWith("data:image/"),
    )
    const inlineFiles = textAttachments
      .map((a) => `\n\n[Arquivo anexado: ${a.name}]\n\`\`\`\n${a.text}\n\`\`\``)
      .join("")
    const imageMarkers = imageAttachments.map((a) => `\n\n[Imagem anexada: ${a.name}]`).join("")
    // Turno de confirmação: o texto do usuário É a confirmação (o
    // cliente manda um marcador — o que vale é o resumo da ação).
    const userText = approvedSummary ? `✅ Confirmado: ${approvedSummary}` : body.message
    const storedUserContent = `${userText}${inlineFiles}${imageMarkers}`
    const userContent =
      imageAttachments.length > 0
        ? [
            { type: "text" as const, text: `${userText}${inlineFiles}` },
            ...imageAttachments.map((a) => ({
              type: "image_url" as const,
              image_url: { url: a.data_url as string },
            })),
          ]
        : storedUserContent

    await admin.from("ai_chat_messages").insert({
      conversation_id: convId,
      role: "user",
      content: storedUserContent,
      ...(body.attachments.length > 0 || body.approve
        ? {
            meta: {
              ...(body.attachments.length > 0
                ? {
                    attachments: body.attachments.map((a) => ({
                      name: a.name,
                      mime: a.mime,
                      kind: a.data_url ? "image" : "text",
                    })),
                  }
                : {}),
              ...(body.approve ? { confirmation: { id: body.approve.confirmation_id, decision: "approve" } } : {}),
            },
          }
        : {}),
    })

    const started = Date.now()
    const encoder = new TextEncoder()

    // ── Linha da resposta nasce AGORA (persistência progressiva) ──
    // Sem ela, recarregar a página no meio de um turno longo mostrava a
    // conversa sem a resposta (a linha só era gravada no fim). O
    // placeholder também põe a conversa no topo do rail imediatamente.
    let assistantMessageId: string | null = null
    try {
      const { data: placeholder } = await admin
        .from("ai_chat_messages")
        .insert({
          conversation_id: convId,
          role: "assistant",
          content: "",
          meta: {
            model,
            streaming: true,
            started_at: new Date(started).toISOString(),
            sources: [],
            progress: [],
            ...(body.deep ? { deep: true } : {}),
            skills: skillNames,
          },
        })
        .select("id")
        .single()
      assistantMessageId = placeholder?.id ?? null
      await admin
        .from("ai_chat_conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", convId)
    } catch (err) {
      log.warn("placeholder da resposta não criado", {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // Memória (propostas) precisa do id da mensagem de origem
    connectors.push(buildMemoriaConnector({ conversationId: convId, messageId: assistantMessageId }))

    const toolIndex = new Map<string, ToolEntry>()
    const toolDefs: ChatToolDef[] = []
    for (const c of connectors) {
      for (const t of c.tools) {
        toolIndex.set(t.def.function.name, { tool: t, connectorKey: c.key, connectorName: c.name })
        toolDefs.push(t.def)
      }
    }
    const writeToolNames = [...toolIndex.entries()]
      .filter(([, v]) => v.tool.write === true)
      .map(([name]) => name)

    // ── Histórico (cronológico) + memória de consulta + sumário ───
    const ordered = (history ?? []).slice().reverse()
    const consultedTurns: ConsultedTurn[] = []
    let turnIdx = 0
    for (const m of ordered) {
      if (m.role !== "assistant") continue
      turnIdx += 1
      const src = (m.meta as { sources?: TurnSource[] } | null)?.sources
      if (Array.isArray(src) && src.length > 0) consultedTurns.push({ index: turnIdx, sources: src })
    }
    const summary = parseSummary(conversationContext)
    // O sumário cobre mensagens ANTES da janela; se a janela ainda não
    // encheu, ele é redundante (mas inofensivo) — só entra quando há corte.
    const historySummary = summary && ordered.length >= HISTORY_LIMIT ? summary.text : null

    const prompt = buildConvertiaSystemPrompt({
      workspace: body.workspace,
      connectors: connectors.map((c) => ({ key: c.key, name: c.name, guidance: c.guidance })),
      writeToolNames,
      storeContext,
      skills,
      memories,
      knowledgeBlock: [knowledge.block, transcricoes.bloco].filter(Boolean).join("\n\n"),
      deep: body.deep,
      consultedBlock: buildConsultedBlock(consultedTurns),
      historySummary,
    })
    // Dois blocos no system: o estável leva o marcador de cache (só
    // modelos com suporte recebem array — os outros, uma string).
    const systemMessage: ChatMessage = supportsPromptCache(model)
      ? {
          role: "system",
          content: [
            { type: "text", text: prompt.stable },
            { type: "text", text: prompt.dynamic },
          ],
        }
      : { role: "system", content: `${prompt.stable}\n\n${prompt.dynamic}` }

    const messages: ChatMessage[] = [
      systemMessage,
      ...ordered
        // placeholder de turno ainda em geração (content vazio) não
        // entra — mensagem de assistente vazia é rejeitada pelo modelo
        .filter((m) => (m.content ?? "").trim().length > 0)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content ?? "" })),
      { role: "user", content: userContent },
    ]

    log.info("chat request", {
      conversation_id: convId,
      model,
      store_id: storeId,
      connectors: connectors.map((c) => `${c.key}:${c.tools.length}`),
      write_tools: writeToolNames.length,
      total_tools: toolDefs.length,
      deep: body.deep,
      economy: body.economy,
      approve: Boolean(preApproved),
      consulted_turns: consultedTurns.length,
      summary: Boolean(historySummary),
    })

    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: unknown) => {
          try {
            controller.enqueue(encoder.encode(sse(payload)))
          } catch {
            /* stream fechado pelo cliente */
          }
        }

        const state = createTurnState()
        const telemetry = new TurnTelemetry(Date.now, { startedAt: started })
        const baseMeta = () => ({
          model,
          started_at: new Date(started).toISOString(),
          ...(body.deep ? { deep: true } : {}),
          skills: skillNames,
        })
        const persistence = createTurnPersistence({ admin, messageId: assistantMessageId, state, baseMeta })
        const cancel = createCancelWatcher({ admin, messageId: assistantMessageId })

        send({
          type: "meta",
          conversation_id: convId,
          title: conversationTitle,
          message_id: assistantMessageId,
        })

        // Guard "consulte antes de responder": pergunta ANALÍTICA com
        // conectores de DADOS ligados não pode sair de memória. Só no
        // PRIMEIRO turno da conversa — follow-up usa legitimamente o
        // histórico. Pedido de AÇÃO é retido em qualquer turno.
        const wantsAnalysis =
          dataToolCount > 0 && ordered.length === 0 && !preApproved && isAnalyticalQuestion(body.message)
        const wantsAction = toolDefs.length > 0 && !preApproved && isActionRequest(body.message)

        const toolCtx: ConnectorToolContext = {
          admin,
          orgId,
          userId: user.id,
          storeId,
          workspace: body.workspace,
        }

        const result = await runToolLoop({
          model,
          cheapModel: body.economy ? CHEAP_MODEL : null,
          reasoningSupported: modelInfo.reasoning,
          deep: body.deep,
          messages,
          tools: toolDefs,
          toolIndex,
          toolCtx,
          maxRounds: body.deep ? DEEP_TOOL_ROUNDS : MAX_TOOL_ROUNDS,
          budget: { startedAt: started, totalMs: ROUTE_BUDGET_MS, minRoundMs: MIN_ROUND_MS },
          guard: { wantsAnalysis, wantsAction },
          callModel: streamOpenRouterChat,
          // Slug recém-listado que o OpenRouter (ainda) não serve: cai
          // para o padrão UMA vez, avisa e segue — a lista de modelos
          // pode andar na frente do catálogo sem quebrar o chat.
          resolveUnknownModel: (err) => {
            if (
              model !== CONVERTIA_DEFAULT_MODEL &&
              err instanceof OpenRouterHttpError &&
              isUnknownModelError(err.status, err.snippet)
            ) {
              log.warn("modelo indisponível no OpenRouter — fallback", {
                requested: model,
                fallback: CONVERTIA_DEFAULT_MODEL,
                snippet: err.snippet,
              })
              const from = modelInfo.name
              model = CONVERTIA_DEFAULT_MODEL
              return {
                model,
                notice: `_(${from} indisponível no OpenRouter agora — respondendo com ${resolveConvertiaModel(model).name})_\n\n`,
              }
            }
            return null
          },
          emit: send,
          persistPartial: persistence.persistPartial,
          isCancelled: cancel.isCancelled,
          cancelSignal: cancel.signal,
          state,
          telemetry,
          preApproved,
        })
        cancel.stop()

        if (result.status === "error") {
          log.error("convertia chat falhou", { error: result.errorMessage, model: result.model })
          // A causa traduzida (402 = sem crédito no OpenRouter, 401 = chave,
          // 429 = taxa…) — "troque o modelo" para um 402 mandava a pessoa
          // caçar o modelo errado enquanto a conta estava zerada.
          send({
            type: "error",
            message: friendlyModelErrorText(result.errorMessage),
            raw: (result.errorMessage ?? "").slice(0, 300),
          })
        }

        const fin = await finalizeTurn({
          admin,
          persistence,
          messageId: assistantMessageId,
          conversationId: convId,
          userId: user.id,
          orgId,
          storeId,
          state,
          telemetry,
          result,
          baseMeta,
          extraCostCents: imageCost.cents,
          extraTokens: { input: imageCost.tokensInput, output: imageCost.tokensOutput },
          connectors: connectors.map((c) => c.key),
          continuation: () => ({
            version: 1,
            conversation_id: convId,
            message_id: assistantMessageId as string,
            user_id: user.id,
            org_id: orgId,
            store_id: storeId,
            workspace: body.workspace,
            model: result.model,
            requested_model: modelInfo.id,
            cheap_model: body.economy ? CHEAP_MODEL : null,
            deep: body.deep,
            reasoning_supported: modelInfo.reasoning,
            connectors: body.connectors,
            skills: skillNames,
            advisors: body.advisors,
            messages: stripImagesForJob(messages),
            round: result.nextRound,
            max_rounds: body.deep ? DEEP_TOOL_ROUNDS : MAX_TOOL_ROUNDS,
            state: { progress: state.progress, sources: state.sources, pendingConfirmation: state.pendingConfirmation },
            telemetry: { rounds: telemetry.rounds, tools: telemetry.tools, started_at: started },
            extra_cost_cents: imageCost.cents,
          }),
          scheduleSummary: true,
        })

        if (fin.continuationJobId) {
          send({
            type: "notice",
            text: "O tempo deste turno acabou — a ConvertIA continua o trabalho em segundo plano e a resposta aparece aqui quando terminar.",
          })
        }

        send({
          type: "done",
          message_id: fin.messageId,
          status: fin.meta.status,
          usage: fin.meta.usage,
          sources: state.sources,
          progress: state.progress,
          pending_confirmation: state.pendingConfirmation,
          continuation: fin.meta.continuation ?? null,
          // resposta final consolidada — o cliente substitui o que
          // montou por deltas (idêntico no caminho feliz; corrige
          // quando o stream perdeu pedaço)
          content: fin.content,
        })
        try {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"))
          controller.close()
        } catch {
          /* já fechado */
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (error) {
    return errorResponse(request, error, "convertia-chat")
  }
}
