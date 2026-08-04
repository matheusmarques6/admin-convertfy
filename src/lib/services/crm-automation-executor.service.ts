/**
 * CRM Automation DAG executor.
 *
 * Recebe automation_id + trigger context, percorre nodes do DAG,
 * resolve expressoes via JSONPath simplificado e executa cada node.
 *
 * Idempotencia: se idempotency_key ja existe pra mesma automation,
 * retorna o run anterior (UNIQUE constraint na DB).
 *
 * Observabilidade: cada node escreve em node_results[] do run.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type {
  CrmAutomationDAG,
  CrmAutomationContext,
  CrmAutomationNode,
  CrmNodeRunResult,
} from "@/types/crm-automation"
import { sendTextViaChannel } from "./whatsapp-channel-send.service"
import { runAiAction } from "./crm-ai-action.service"
import { resolveAutoOwner, resolveLeastLoadedMember } from "./crm-assignment.service"

const log = logger.child("CrmAutomationExecutor")

interface ExecuteParams {
  automation_id: string
  trigger_type: string
  trigger_data: Record<string, unknown>
  context: CrmAutomationContext
  idempotency_key?: string
}

interface ExecuteResult {
  run_id: string
  status: "completed" | "failed" | "skipped" | "waiting"
  node_results: CrmNodeRunResult[]
  error?: string
}

/** Espera >= este limiar é adiada pra fila (cron de retomada). */
const WAIT_INLINE_MAX_SECONDS = 30

/**
 * Resolve JSONPath simplificado: $.lead.name, $.deal.value etc.
 * Suporta apenas notacao com ponto e nao expressoes complexas.
 */
function resolvePath(ctx: CrmAutomationContext, path: string): unknown {
  if (!path.startsWith("$.")) return path
  const segments = path.slice(2).split(".")
  let value: unknown = ctx
  for (const seg of segments) {
    if (value && typeof value === "object" && seg in (value as Record<string, unknown>)) {
      value = (value as Record<string, unknown>)[seg]
    } else {
      return undefined
    }
  }
  return value
}

/**
 * Renderiza um template tipo "Ola {{lead.name}}, valor {{deal.value}}"
 * substituindo {{path}} pelos valores resolvidos.
 */
function renderTemplate(template: string, ctx: CrmAutomationContext): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, expr) => {
    const trimmed = expr.trim()
    const value = resolvePath(ctx, `$.${trimmed}`)
    return value == null ? "" : String(value)
  })
}

/**
 * Avalia uma expressao de condicao simples. Suporta operadores
 * basicos: ==, !=, >, <, >=, <=, &&, ||, contains.
 *
 * Por seguranca NAO usa eval. Parser simples.
 */
function evaluateCondition(expr: string, ctx: CrmAutomationContext): boolean {
  if (!expr || !expr.trim()) return true

  // Suporta apenas formato: "$.path operator value" ou
  // "$.path operator $.path"
  const operators = ["==", "!=", ">=", "<=", ">", "<", " contains ", " in "]
  let op: string | null = null
  let opIndex = -1
  for (const o of operators) {
    const idx = expr.indexOf(o)
    if (idx > -1 && (opIndex === -1 || idx < opIndex)) {
      op = o.trim()
      opIndex = idx
    }
  }
  if (!op || opIndex === -1) {
    log.warn("[Executor] cant parse condition", { expr })
    return false
  }

  const left = expr.slice(0, opIndex).trim()
  const right = expr.slice(opIndex + op.length).trim()

  const leftVal = left.startsWith("$.") ? resolvePath(ctx, left) : parseLiteral(left)
  const rightVal = right.startsWith("$.") ? resolvePath(ctx, right) : parseLiteral(right)

  switch (op) {
    case "==":
      return leftVal == rightVal
    case "!=":
      return leftVal != rightVal
    case ">":
      return Number(leftVal) > Number(rightVal)
    case "<":
      return Number(leftVal) < Number(rightVal)
    case ">=":
      return Number(leftVal) >= Number(rightVal)
    case "<=":
      return Number(leftVal) <= Number(rightVal)
    case "contains":
      return String(leftVal).includes(String(rightVal))
    case "in":
      return Array.isArray(rightVal) && rightVal.includes(leftVal as never)
    default:
      return false
  }
}

function parseLiteral(s: string): string | number | boolean | null {
  const t = s.trim()
  if (t === "true") return true
  if (t === "false") return false
  if (t === "null" || t === "") return null
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1)
  }
  return t
}

/**
 * Execucao topologica: comeca pelo trigger, segue edges respeitando
 * conditions. Nao suporta ciclos (DAG = aciclico).
 */
export async function executeAutomation(params: ExecuteParams): Promise<ExecuteResult> {
  const admin = createAdminClient()

  // Le a automation
  const { data: automation } = await admin
    .from("automations")
    .select("id, name, dag, is_active, scope, org_id, version")
    .eq("id", params.automation_id)
    .single()

  if (!automation || !automation.is_active) {
    log.warn("[Executor] automation nao ativa ou nao encontrada", { id: params.automation_id })
    return {
      run_id: "",
      status: "skipped",
      node_results: [],
      error: "Automation inativa ou nao encontrada",
    }
  }

  const dag = automation.dag as unknown as CrmAutomationDAG
  if (!dag || !dag.nodes || dag.nodes.length === 0) {
    return { run_id: "", status: "skipped", node_results: [], error: "DAG vazio" }
  }

  // Cria run (idempotente)
  const { data: existingRun } = params.idempotency_key
    ? await admin
        .from("crm_automation_runs")
        .select("id, status")
        .eq("automation_id", automation.id)
        .eq("idempotency_key", params.idempotency_key)
        .maybeSingle()
    : { data: null }

  if (existingRun) {
    log.info("[Executor] run idempotente — ja executado", { run_id: existingRun.id })
    return { run_id: existingRun.id, status: existingRun.status as never, node_results: [] }
  }

  const { data: run, error: runErr } = await admin
    .from("crm_automation_runs")
    .insert({
      automation_id: automation.id,
      org_id: automation.org_id,
      trigger_type: params.trigger_type,
      trigger_data: params.trigger_data,
      idempotency_key: params.idempotency_key || null,
      deal_id: (params.context.deal as { id?: string } | null)?.id || null,
      lead_id: (params.context.lead as { id?: string } | null)?.id || null,
      thread_id: (params.context.thread as { id?: string } | null)?.id || null,
      store_id: (params.context.store as { id?: string } | null)?.id || null,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (runErr || !run) {
    throw runErr || new Error("Falha ao criar automation run")
  }

  // Execucao
  const nodeResults: CrmNodeRunResult[] = []
  const startNode = dag.nodes.find((n) => n.type === "trigger")
  if (!startNode) {
    await admin
      .from("crm_automation_runs")
      .update({
        status: "failed",
        error_message: "DAG sem node de trigger",
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id)
    return { run_id: run.id, status: "failed", node_results: [], error: "DAG sem trigger" }
  }

  let runError: string | undefined
  let waitingNodeId: string | null = null
  try {
    waitingNodeId = await traverseDAG(
      dag,
      startNode,
      params.context,
      run.id,
      automation.org_id,
      nodeResults,
    )
  } catch (err) {
    runError = err instanceof Error ? err.message : "Erro desconhecido"
    log.error("[Executor] traverse error", err)
  }

  const status = await finalizeRun(
    run.id,
    nodeResults,
    runError,
    waitingNodeId,
    params.context,
  )

  return {
    run_id: run.id,
    status,
    node_results: nodeResults,
    error: runError,
  }
}

/**
 * Grava o desfecho do run. Com nó em espera: status 'waiting' +
 * resume_at/resume_node_id/context_snapshot para o cron retomar. Se o
 * banco não aceitar 'waiting' (migration 20261068 pendente), degrada
 * para o comportamento antigo: marca completed com aviso — a espera
 * longa é pulada, nunca derruba o run.
 */
async function finalizeRun(
  runId: string,
  nodeResults: CrmNodeRunResult[],
  runError: string | undefined,
  waitingNodeId: string | null,
  ctx: CrmAutomationContext,
): Promise<ExecuteResult["status"]> {
  const admin = createAdminClient()
  const failed = nodeResults.some((r) => r.status === "failed") || !!runError

  if (!failed && waitingNodeId) {
    const waitingResult = nodeResults.find((r) => r.node_id === waitingNodeId)
    const seconds = Number((waitingResult?.output as { seconds?: number } | null)?.seconds) || 60
    const resumeAt = new Date(Date.now() + seconds * 1000).toISOString()
    const { error } = await admin
      .from("crm_automation_runs")
      .update({
        status: "waiting",
        resume_at: resumeAt,
        resume_node_id: waitingNodeId,
        context_snapshot: ctx as unknown as Record<string, unknown>,
        node_results: nodeResults as unknown as Record<string, unknown>[],
        error_message: null,
      })
      .eq("id", runId)
    if (!error) {
      log.info("[Executor] run em espera", { runId, resumeAt, node: waitingNodeId })
      return "waiting"
    }
    log.warn(
      "[Executor] espera longa indisponível (migration 20261068?) — run segue como completed",
      { runId, error: error.message },
    )
  }

  await admin
    .from("crm_automation_runs")
    .update({
      status: failed ? "failed" : "completed",
      error_message: runError || null,
      node_results: nodeResults as unknown as Record<string, unknown>[],
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId)
  return failed ? "failed" : "completed"
}

/**
 * Executa o nó e segue o DAG. Retorna o id do nó em ESPERA (wait longo
 * adiado pra fila) ou null quando o ramo terminou.
 */
async function traverseDAG(
  dag: CrmAutomationDAG,
  current: CrmAutomationNode,
  ctx: CrmAutomationContext,
  runId: string,
  orgId: string,
  results: CrmNodeRunResult[],
): Promise<string | null> {
  const result = await executeNode(current, ctx, runId, orgId)
  results.push(result)

  if (result.status === "failed") return null
  if (result.status === "waiting") return current.id

  return followEdges(dag, current, ctx, runId, orgId, results)
}

/** Segue as edges de um nó (usado no fluxo normal e na RETOMADA pós-wait). */
async function followEdges(
  dag: CrmAutomationDAG,
  node: CrmAutomationNode,
  ctx: CrmAutomationContext,
  runId: string,
  orgId: string,
  results: CrmNodeRunResult[],
): Promise<string | null> {
  const outgoing = dag.edges.filter((e) => e.from === node.id)
  for (const edge of outgoing) {
    if (edge.condition && !evaluateCondition(edge.condition, ctx)) {
      continue // skip this branch
    }
    const next = dag.nodes.find((n) => n.id === edge.to)
    if (next) {
      const waiting = await traverseDAG(dag, next, ctx, runId, orgId, results)
      if (waiting) return waiting
    }
  }
  return null
}

/**
 * Retoma runs em 'waiting' cujo resume_at venceu. Claim atômico por
 * update condicional — duas execuções do cron não pegam o mesmo run.
 * A execução continua PELAS EDGES do nó wait (não o re-executa); outro
 * wait adiante devolve o run à fila com novo resume_at.
 */
export async function resumeDueAutomationRuns(limit = 20): Promise<{
  resumed: number
  requeued: number
  errors: number
}> {
  const admin = createAdminClient()
  const { data: due } = await admin
    .from("crm_automation_runs")
    .select("id, automation_id, org_id, resume_node_id, context_snapshot, node_results")
    .eq("status", "waiting")
    .lte("resume_at", new Date().toISOString())
    .order("resume_at", { ascending: true })
    .limit(limit)

  let resumed = 0
  let requeued = 0
  let errors = 0

  for (const run of due ?? []) {
    // Claim: só continua quem conseguir mover waiting -> running.
    const { data: claimed } = await admin
      .from("crm_automation_runs")
      .update({ status: "running" })
      .eq("id", run.id)
      .eq("status", "waiting")
      .select("id")
      .maybeSingle()
    if (!claimed) continue

    try {
      const { data: automation } = await admin
        .from("automations")
        .select("id, dag, is_active")
        .eq("id", run.automation_id)
        .single()

      const dag = automation?.dag as unknown as CrmAutomationDAG | null
      const waitNode = dag?.nodes?.find((n) => n.id === run.resume_node_id)

      if (!automation?.is_active || !dag || !waitNode) {
        await admin
          .from("crm_automation_runs")
          .update({
            status: "failed",
            error_message: !automation?.is_active
              ? "Automação desativada durante a espera"
              : "Nó de espera não existe mais no DAG (automação editada)",
            completed_at: new Date().toISOString(),
          })
          .eq("id", run.id)
        errors++
        continue
      }

      const ctx = (run.context_snapshot ?? {}) as CrmAutomationContext
      const results = (run.node_results ?? []) as unknown as CrmNodeRunResult[]

      let runError: string | undefined
      let waitingNodeId: string | null = null
      try {
        waitingNodeId = await followEdges(dag, waitNode, ctx, run.id, run.org_id, results)
      } catch (err) {
        runError = err instanceof Error ? err.message : "Erro desconhecido"
      }

      const status = await finalizeRun(run.id, results, runError, waitingNodeId, ctx)
      if (status === "waiting") requeued++
      else if (status === "failed") errors++
      else resumed++
    } catch (err) {
      errors++
      log.error("[Executor] resume error", { runId: run.id, error: err })
      await admin
        .from("crm_automation_runs")
        .update({
          status: "failed",
          error_message: err instanceof Error ? err.message : "Erro na retomada",
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id)
    }
  }

  return { resumed, requeued, errors }
}

async function executeNode(
  node: CrmAutomationNode,
  ctx: CrmAutomationContext,
  runId: string,
  orgId: string,
): Promise<CrmNodeRunResult> {
  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  const admin = createAdminClient()

  try {
    let output: unknown = null

    switch (node.type) {
      case "trigger":
        output = { triggered: true }
        break

      case "condition": {
        const cfg = node.config as { expression: string }
        const passed = evaluateCondition(cfg.expression, ctx)
        if (!passed) {
          return {
            node_id: node.id,
            node_type: node.type,
            status: "skipped",
            output: { passed: false },
            started_at: startedAt,
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - t0,
          }
        }
        output = { passed: true }
        break
      }

      case "wait": {
        const cfg = node.config as { seconds: number }
        const seconds = Number(cfg.seconds) || 0
        if (seconds >= WAIT_INLINE_MAX_SECONDS) {
          // Espera longa: adia pra fila — o run vira 'waiting' e o cron
          // /api/cron/crm-automation-resume continua a partir daqui.
          return {
            node_id: node.id,
            node_type: node.type,
            status: "waiting",
            output: { deferred: true, seconds },
            started_at: startedAt,
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - t0,
          }
        }
        if (seconds > 0) {
          await new Promise((r) => setTimeout(r, seconds * 1000))
        }
        output = { waited: seconds }
        break
      }

      case "action_send_whatsapp": {
        const cfg = node.config as {
          channel_id: string
          to: string
          body_template: string
        }
        const toResolved = cfg.to.startsWith("$.") ? String(resolvePath(ctx, cfg.to) || "") : cfg.to
        if (!toResolved) throw new Error("Destinatario vazio")

        type ChannelRow = {
          provider: string | null
          config: Record<string, unknown> | null
          external_id: string | null
        }
        const { data: channel } = await admin
          .from("crm_channels")
          .select("provider, config, external_id")
          .eq("id", cfg.channel_id)
          .single<ChannelRow>()
        if (!channel) throw new Error(`Channel ${cfg.channel_id} nao encontrado`)

        const body = renderTemplate(cfg.body_template, ctx)
        // Dispatch por provider (Cloud API oficial OU Evolution via QR).
        // O adapter cloud usa external_id como phone_number_id fallback.
        const result = await sendTextViaChannel(
          channel.provider === "evolution"
            ? channel
            : {
                ...channel,
                config: {
                  ...(channel.config ?? {}),
                  // comportamento original: external_id (phone_number_id) tem precedência
                  ...(channel.external_id ? { phone_number_id: channel.external_id } : {}),
                },
              },
          toResolved,
          body,
        )
        if (!result.success) throw new Error(result.error?.message || "Falha no WhatsApp")
        output = { message_id: result.message_id }
        break
      }

      case "action_create_activity": {
        const cfg = node.config as {
          type: "note" | "task" | "system"
          content_template: string
          due_in_hours?: number
        }
        const dealId = (ctx.deal as { id?: string } | null)?.id
        const leadId = (ctx.lead as { id?: string } | null)?.id
        if (!dealId && !leadId) throw new Error("Activity precisa de deal ou lead no contexto")

        const due_at = cfg.due_in_hours
          ? new Date(Date.now() + cfg.due_in_hours * 3600000).toISOString()
          : null

        const { data, error } = await admin
          .from("crm_deal_activities")
          .insert({
            deal_id: dealId || null,
            lead_id: leadId || null,
            type: cfg.type,
            content: renderTemplate(cfg.content_template, ctx),
            due_at,
            is_internal: true,
            metadata: { automation_run_id: runId },
          })
          .select("id")
          .single()
        if (error) throw error
        output = { activity_id: data.id }
        break
      }

      case "action_assign_owner": {
        const cfg = node.config as {
          strategy: "round_robin" | "specific"
          user_id?: string
        }
        const dealId = (ctx.deal as { id?: string } | null)?.id
        const leadId = (ctx.lead as { id?: string } | null)?.id
        let assignTo: string | null = null

        if (cfg.strategy === "specific" && cfg.user_id) {
          assignTo = cfg.user_id
        } else if (cfg.strategy === "round_robin") {
          // Membro ativo com menos deals abertos (service compartilhado
          // com o rodízio nativo da pipeline)
          assignTo = await resolveLeastLoadedMember(admin, orgId)
        }
        if (!assignTo) throw new Error("Nao foi possivel resolver owner")

        if (dealId) await admin.from("deals").update({ owner_id: assignTo }).eq("id", dealId)
        if (leadId) await admin.from("crm_leads").update({ assigned_to: assignTo }).eq("id", leadId)
        output = { assigned_to: assignTo }
        break
      }

      case "action_webhook": {
        // Notifica sistema externo (n8n, Zapier, ERP...) com o contexto
        // do run. HMAC opcional em X-Convertfy-Signature pro destino
        // validar a origem. Timeout de 10s — automação não pode ficar
        // pendurada em endpoint lento.
        const cfg = node.config as {
          url: string
          secret?: string | null
        }
        const url = (cfg.url || "").trim()
        let parsedUrl: URL
        try {
          parsedUrl = new URL(url)
        } catch {
          throw new Error("Webhook: URL inválida")
        }
        if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
          throw new Error("Webhook: só http(s)")
        }
        // Guarda-chuva anti-SSRF básico: nada de rede interna.
        const host = parsedUrl.hostname.toLowerCase()
        if (
          host === "localhost" ||
          host === "0.0.0.0" ||
          /^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)
        ) {
          throw new Error("Webhook: host interno não permitido")
        }

        const payload = JSON.stringify({
          event: "crm.automation",
          org_id: orgId,
          run_id: runId,
          node_id: node.id,
          sent_at: new Date().toISOString(),
          deal: ctx.deal ?? null,
          lead: ctx.lead ?? null,
          thread: ctx.thread ?? null,
          trigger: ctx.trigger_data ?? null,
        })

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "User-Agent": "Convertfy-CRM-Automation/1.0",
        }
        if (cfg.secret) {
          const { createHmac } = await import("crypto")
          headers["X-Convertfy-Signature"] =
            "sha256=" + createHmac("sha256", cfg.secret).update(payload).digest("hex")
        }

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 10_000)
        try {
          const res = await fetch(url, {
            method: "POST",
            headers,
            body: payload,
            signal: controller.signal,
          })
          if (!res.ok) {
            throw new Error(`Webhook respondeu ${res.status}`)
          }
          output = { url, status: res.status }
        } finally {
          clearTimeout(timer)
        }
        break
      }

      case "action_move_stage": {
        const cfg = node.config as { to_stage_id: string }
        const dealId = (ctx.deal as { id?: string } | null)?.id
        if (!dealId) throw new Error("action_move_stage requer deal no contexto")
        await admin.from("deals").update({ stage_id: cfg.to_stage_id }).eq("id", dealId)
        output = { moved_to: cfg.to_stage_id }
        break
      }

      case "action_update_deal": {
        const cfg = node.config as { fields: Record<string, unknown> }
        const dealId = (ctx.deal as { id?: string } | null)?.id
        if (!dealId) throw new Error("action_update_deal requer deal no contexto")
        await admin.from("deals").update(cfg.fields).eq("id", dealId)
        output = { updated_fields: Object.keys(cfg.fields) }
        break
      }

      /**
       * Cria negócio a partir do contexto — o que fecha o caso
       * "quem responde o direct entra nesta pipeline".
       *
       * Estava declarado no tipo desde a fase 5 mas nunca implementado:
       * escolher a ação no builder não fazia nada.
       *
       * Idempotente por thread: se a conversa já gerou negócio, reusa em
       * vez de criar outro a cada disparo.
       */
      case "action_create_deal": {
        const cfg = node.config as {
          pipeline_id: string
          stage_id: string
          owner_id?: string | null
          title_template?: string | null
          value?: number | null
          tags?: string[] | null
        }
        if (!cfg.pipeline_id || !cfg.stage_id) {
          throw new Error("action_create_deal requer pipeline_id e stage_id")
        }

        const thread = ctx.thread as
          | {
              id?: string
              deal_id?: string | null
              lead_id?: string | null
              client_id?: string | null
              contact_name?: string | null
              contact_external_id?: string | null
              channel_type?: string
            }
          | null

        if (thread?.deal_id) {
          output = { deal_id: thread.deal_id, created: false, reason: "thread ja tem deal" }
          break
        }

        const contactName =
          thread?.contact_name?.trim() ||
          thread?.contact_external_id ||
          "Contato sem nome"
        const channelLabel =
          thread?.channel_type === "instagram"
            ? "Instagram"
            : thread?.channel_type === "whatsapp"
              ? "WhatsApp"
              : "Mensagem"

        const title =
          cfg.title_template?.trim() || `${contactName} — ${channelLabel}`

        // Dono: o configurado → quem já atende a conversa → rodízio da
        // pipeline (assignment_mode='round_robin') → responsável padrão
        // do pipeline → primeiro membro ativo da org.
        // `deals.owner_id` é NOT NULL: sem um dono real o insert falha e
        // a mensagem do cliente não vira negócio nenhum.
        let ownerId =
          cfg.owner_id ||
          (thread as { assigned_to?: string | null } | null)?.assigned_to ||
          null

        if (!ownerId) {
          ownerId = await resolveAutoOwner(admin, cfg.pipeline_id, orgId)
        }
        if (!ownerId) {
          const { data: pipe } = await admin
            .from("pipelines")
            .select("default_assignee_id")
            .eq("id", cfg.pipeline_id)
            .maybeSingle()
          ownerId = pipe?.default_assignee_id ?? null
        }
        if (!ownerId) {
          const { data: member } = await admin
            .from("org_members")
            .select("profile_id")
            .eq("org_id", orgId)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle()
          ownerId = member?.profile_id ?? null
        }
        if (!ownerId) {
          throw new Error(
            "action_create_deal: nenhum responsável disponível (configure o dono na ação ou o responsável padrão do pipeline)",
          )
        }

        const { data: maxPos } = await admin
          .from("deals")
          .select("position")
          .eq("stage_id", cfg.stage_id)
          .order("position", { ascending: false })
          .limit(1)
          .maybeSingle()

        const { data: created, error: createErr } = await admin
          .from("deals")
          .insert({
            pipeline_id: cfg.pipeline_id,
            stage_id: cfg.stage_id,
            title,
            value: cfg.value ?? 0,
            status: "open",
            owner_id: ownerId,
            position: (maxPos?.position ?? 0) + 10,
            source: thread?.channel_type ? `inbox:${thread.channel_type}` : "inbox",
            tags: cfg.tags ?? [],
            lead_id: thread?.lead_id ?? null,
            client_id: thread?.client_id ?? null,
          })
          .select("id")
          .single()

        if (createErr) throw createErr

        // Amarra a conversa ao negócio: o inbox passa a mostrar o
        // vínculo e a automação não cria outro na próxima mensagem.
        if (thread?.id) {
          await admin
            .from("crm_threads")
            .update({ deal_id: created.id })
            .eq("id", thread.id)
        }

        await admin.from("crm_deal_activities").insert({
          deal_id: created.id,
          type: "system",
          content: `Negócio criado automaticamente a partir de ${channelLabel}`,
          created_by: ownerId,
          is_internal: true,
        })

        output = { deal_id: created.id, created: true, title }
        break
      }

      case "ai_action": {
        const cfg = node.config as {
          ai_action_id: string
          input_mapping: Record<string, string>
          output_target?: { entity: "deal" | "lead" | "thread"; field: string }
        }

        // Resolve inputs
        const inputs: Record<string, unknown> = {}
        for (const [k, expr] of Object.entries(cfg.input_mapping || {})) {
          inputs[k] = expr.startsWith("$.") ? resolvePath(ctx, expr) : expr
        }

        const aiResult = await runAiAction({
          ai_action_id: cfg.ai_action_id,
          input_vars: inputs,
          automation_run_id: runId,
        })

        if (aiResult.status === "completed" && cfg.output_target && aiResult.parsed_output) {
          const target = cfg.output_target
          const value = aiResult.parsed_output[target.field]
          const entityId =
            target.entity === "deal"
              ? (ctx.deal as { id?: string } | null)?.id
              : target.entity === "lead"
                ? (ctx.lead as { id?: string } | null)?.id
                : (ctx.thread as { id?: string } | null)?.id
          if (entityId && value !== undefined) {
            const table =
              target.entity === "deal" ? "deals" : target.entity === "lead" ? "crm_leads" : "crm_threads"
            await admin.from(table).update({ [target.field]: value }).eq("id", entityId)
          }
        }

        if (aiResult.status === "failed" || aiResult.status === "invalid_output") {
          throw new Error(aiResult.error_message || "AI action falhou")
        }
        output = { ai_run_id: aiResult.run_id, parsed_output: aiResult.parsed_output }
        break
      }

      default:
        throw new Error(`Node type nao suportado: ${node.type}`)
    }

    return {
      node_id: node.id,
      node_type: node.type,
      status: "completed",
      output,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - t0,
    }
  } catch (err) {
    return {
      node_id: node.id,
      node_type: node.type,
      status: "failed",
      error: err instanceof Error ? err.message : "Erro desconhecido",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - t0,
    }
  }
}
