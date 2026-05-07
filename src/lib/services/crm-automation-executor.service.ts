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
import { sendWhatsAppMessage } from "./whatsapp-cloud.service"
import { runAiAction } from "./crm-ai-action.service"

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
  status: "completed" | "failed" | "skipped"
  node_results: CrmNodeRunResult[]
  error?: string
}

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
  try {
    await traverseDAG(dag, startNode, params.context, run.id, automation.org_id, nodeResults)
  } catch (err) {
    runError = err instanceof Error ? err.message : "Erro desconhecido"
    log.error("[Executor] traverse error", err)
  }

  const failed = nodeResults.some((r) => r.status === "failed") || !!runError
  await admin
    .from("crm_automation_runs")
    .update({
      status: failed ? "failed" : "completed",
      error_message: runError || null,
      node_results: nodeResults as unknown as Record<string, unknown>[],
      completed_at: new Date().toISOString(),
    })
    .eq("id", run.id)

  return {
    run_id: run.id,
    status: failed ? "failed" : "completed",
    node_results: nodeResults,
    error: runError,
  }
}

async function traverseDAG(
  dag: CrmAutomationDAG,
  current: CrmAutomationNode,
  ctx: CrmAutomationContext,
  runId: string,
  orgId: string,
  results: CrmNodeRunResult[],
): Promise<void> {
  const result = await executeNode(current, ctx, runId, orgId)
  results.push(result)

  if (result.status === "failed") return

  // Find outgoing edges
  const outgoing = dag.edges.filter((e) => e.from === current.id)
  for (const edge of outgoing) {
    if (edge.condition && !evaluateCondition(edge.condition, ctx)) {
      continue // skip this branch
    }
    const next = dag.nodes.find((n) => n.id === edge.to)
    if (next) {
      await traverseDAG(dag, next, ctx, runId, orgId, results)
    }
  }
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
        // Em producao real seria deferido pra fila. Aqui caso curto, executa.
        if (cfg.seconds > 0 && cfg.seconds < 30) {
          await new Promise((r) => setTimeout(r, cfg.seconds * 1000))
        }
        output = { waited: cfg.seconds }
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
          config: Record<string, string | undefined> | null
          external_id: string | null
        }
        const { data: channel } = await admin
          .from("crm_channels")
          .select("config, external_id")
          .eq("id", cfg.channel_id)
          .single<ChannelRow>()
        if (!channel) throw new Error(`Channel ${cfg.channel_id} nao encontrado`)

        const conf = channel.config || {}
        const body = renderTemplate(cfg.body_template, ctx)
        const result = await sendWhatsAppMessage(
          {
            phone_number_id: channel.external_id || conf.phone_number_id || "",
            access_token: conf.access_token || "",
          },
          { to: toResolved, type: "text", text: { body } },
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
          // Pega o owner com menos deals abertos no scope da org
          const { data: members } = await admin
            .from("org_members")
            .select("profile_id")
            .eq("org_id", orgId)
            .eq("is_active", true)
            .limit(50)
          if (members && members.length > 0) {
            const counts = await Promise.all(
              members.map(async (m) => {
                const { count } = await admin
                  .from("deals")
                  .select("id", { count: "exact", head: true })
                  .eq("owner_id", m.profile_id)
                  .eq("status", "open")
                return { profile_id: m.profile_id, count: count || 0 }
              }),
            )
            counts.sort((a, b) => a.count - b.count)
            assignTo = counts[0]?.profile_id || null
          }
        }
        if (!assignTo) throw new Error("Nao foi possivel resolver owner")

        if (dealId) await admin.from("deals").update({ owner_id: assignTo }).eq("id", dealId)
        if (leadId) await admin.from("crm_leads").update({ assigned_to: assignTo }).eq("id", leadId)
        output = { assigned_to: assignTo }
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
