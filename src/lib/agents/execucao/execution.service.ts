/**
 * execution.service — a execução manual como entidade, e o contexto que o
 * runner consulta para saber se está sob overrides.
 *
 * ── Por que só o modo MANUAL grava linha nesta v1 ─────────────────────
 *
 * Produção não pode ter override por construção (`gateFor` devolve gate
 * neutro em `mode='producao'`, sempre), então uma linha de execução para
 * ela não mudaria comportamento nenhum — seria telemetria pura, e a
 * telemetria de produção já existe: runs, status do e-mail e batch.
 *
 * O custo de gravá-la, por outro lado, é real: uma execução de produção
 * atravessa cron → n8n → webhook → rota de fase 2, e teria de ser FECHADA
 * em cinco saídas distintas (sucesso, erro, watchdog, cobertura
 * insuficiente, budget estourado). Linha `running` órfã é o estado zumbi
 * que este repo já pagou caro — foram 8 eventos presos desde 15/07 na fila
 * do inbox porque o claim não tinha lease. Aqui, a única linha viva é a que
 * um humano criou e um humano vê na tela.
 *
 * A aba Execuções segue agrupando produção por e-mail (é o que já
 * funciona); o que ela ganha é saber QUAL execução é manual e o que ela
 * mudou.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import {
  resumirOverrides,
  validarOverrides,
  type ExecutionMode,
  type ExecutionOverrides,
  type Recusa,
} from "./overrides"

const log = logger.child("ExecucaoManual")

export interface ExecucaoViva {
  id: string
  mode: ExecutionMode
  status: "running" | "paused"
  overrides: ExecutionOverrides
  stoppedAtNode: string | null
  batchId: string | null
  startedAt: string
}

/**
 * O que o runner precisa saber. Sem execução manual viva devolve o
 * contexto NEUTRO — que é o comportamento de sempre, e é o que garante que
 * ligar esta feature não muda nada em produção.
 */
export interface ContextoDeExecucao {
  executionId: string | null
  mode: ExecutionMode
  overrides: ExecutionOverrides | null
}

export const CONTEXTO_PRODUCAO: ContextoDeExecucao = {
  executionId: null,
  mode: "producao",
  overrides: null,
}

interface VivaRow {
  id: string
  mode: string
  status: string
  overrides: ExecutionOverrides | null
  stopped_at_node: string | null
  batch_id: string | null
  started_at: string
}

/**
 * A execução manual viva de um e-mail, se houver.
 *
 * Fail-open: erro de leitura (migration não aplicada, banco fora) devolve
 * `null`, e o pipeline roda como produção. Override é ferramenta de teste —
 * derrubar a geração porque a tabela de overrides não respondeu seria
 * trocar um recurso de conveniência pelo trabalho de verdade.
 */
export async function carregarExecucaoManualViva(
  emailId: string | null | undefined,
): Promise<ExecucaoViva | null> {
  if (!emailId) return null
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc("email_execution_manual_viva", {
      p_email_id: emailId,
    })
    if (error) throw error
    const row = ((data ?? []) as VivaRow[])[0]
    if (!row) return null
    return {
      id: row.id,
      mode: "manual",
      status: row.status === "paused" ? "paused" : "running",
      overrides: row.overrides ?? {},
      stoppedAtNode: row.stopped_at_node,
      batchId: row.batch_id,
      startedAt: row.started_at,
    }
  } catch (err) {
    log.warn("execucao.viva_indisponivel", { emailId, err })
    return null
  }
}

/** Contexto do runner: execução manual viva ou produção. */
export async function contextoDaExecucao(
  emailId: string | null | undefined,
): Promise<ContextoDeExecucao> {
  const viva = await carregarExecucaoManualViva(emailId)
  if (!viva) return CONTEXTO_PRODUCAO
  return {
    executionId: viva.id,
    mode: "manual",
    overrides: viva.overrides,
  }
}

/**
 * Pin sem artefato é tão fatal quanto desativar sem pin — e a régua pura
 * não pode ver isso.
 *
 * `validarOverrides` aceita qualquer pin porque é um módulo puro: ele sabe
 * que "pinar o Blueprint" declara que o blueprint existe, mas não pode
 * conferir. Sem esta conferência, pinar um blueprint que nunca foi gerado
 * passa na validação, curto-circuita a fase 1 e a peça morre em
 * `hero_failed` 3 minutos depois — o mesmo desfecho do incidente 07/09,
 * pela porta oposta.
 *
 * `start_from` sem HTML persistido é o mesmo problema com outra cara: a
 * cadeia de formatação trata "estágio sem HTML" como estado inconsistente e
 * RECOMEÇA do zero (`phase2.fmt.stage_without_html`), então o pedido seria
 * ignorado em silêncio.
 */
async function verificarPins(
  emailId: string,
  overrides: ExecutionOverrides,
): Promise<Recusa[]> {
  const pinned = Object.keys(overrides.pinned ?? {})
  if (pinned.length === 0 && !overrides.start_from) return []

  const admin = createAdminClient()
  const { data: email } = await admin
    .from("email_flow_emails")
    .select("id, number, html, html_pipeline_stage, flow:email_flows!inner(store_id, flow_type)")
    .eq("id", emailId)
    .maybeSingle()
  if (!email) return [{ node: "-", motivo: "e-mail não encontrado" }]

  // O PostgREST devolve o embed como objeto ou array conforme a
  // cardinalidade que ele infere; `!inner` num to-one vem objeto, mas o tipo
  // gerado diz array. Normaliza em vez de apostar.
  const embed = (email as unknown as {
    flow?: { store_id: string; flow_type: string } | Array<{ store_id: string; flow_type: string }>
  }).flow
  const flow = Array.isArray(embed) ? embed[0] : embed
  const chave = {
    store_id: flow?.store_id ?? "",
    flow_type: flow?.flow_type ?? "",
    email_number: (email as { number: number }).number,
  }
  const out: Recusa[] = []

  const precisaReferencia =
    pinned.includes("assembler_chooser") || pinned.includes("assembler")
  const precisaBlueprint = pinned.includes("blueprint")
  const precisaCopy = pinned.includes("copy") || pinned.includes("copy_dispatch")

  if (precisaReferencia) {
    const { data } = await admin
      .from("store_email_references")
      .select("id")
      .match(chave)
      .maybeSingle()
    if (!data) {
      out.push({
        node: "assembler_chooser",
        motivo:
          "não existe referência gravada para este e-mail — não há o que reusar. Rode a fase 1 uma vez antes de pinar",
      })
    }
  }
  if (precisaBlueprint) {
    const { data } = await admin
      .from("store_email_blueprints")
      .select("id")
      .match(chave)
      .maybeSingle()
    if (!data) {
      out.push({
        node: "blueprint",
        motivo:
          "não existe blueprint gravado para este e-mail — sem contrato de campos o merge não ancora nada. Rode a fase 1 uma vez antes de pinar",
      })
    }
  }
  if (precisaCopy) {
    const { data } = await admin
      .from("email_blocks")
      .select("id, content")
      .eq("email_id", emailId)
      .limit(50)
    const temCopy = (data ?? []).some((b: { content: unknown }) => {
      const c = b.content as Record<string, unknown> | null
      return c != null && Object.keys(c).length > 0
    })
    if (!temCopy) {
      out.push({
        node: "copy",
        motivo:
          "os blocos deste e-mail estão sem copy — não há o que reusar. Rode o pipeline completo uma vez antes de pinar a copy",
      })
    }
  }
  if (overrides.start_from) {
    const html = (email as { html: string | null }).html
    if (!html) {
      out.push({
        node: overrides.start_from,
        motivo:
          "não existe HTML persistido para retomar — a cadeia recomeçaria da hero e o pedido seria ignorado em silêncio. Rode a fase 2 uma vez antes de retomar",
      })
    }
  }

  return out
}

export interface CriarExecucaoInput {
  storeId: string
  flowId?: string | null
  emailId: string
  overrides: ExecutionOverrides
  triggeredBy?: string | null
  /** Modos e configs em vigor — o "snapshot do workflow" do n8n. */
  configSnapshot?: Record<string, unknown>
}

export type CriarExecucaoResult =
  | { ok: true; executionId: string }
  /** Overrides que a régua de degradação reprova (ver `validarOverrides`). */
  | { ok: false; kind: "recusado"; recusas: Recusa[] }
  /** Já existe execução manual viva para este e-mail (índice único). */
  | { ok: false; kind: "conflito"; viva: ExecucaoViva }
  | { ok: false; kind: "erro"; mensagem: string }

/**
 * Cria a execução manual.
 *
 * Valida ANTES de gravar, e é de propósito que a mesma
 * `validarOverrides` rode aqui e na tela: a tela explica antes de gastar, o
 * servidor garante que ninguém contorna por `curl`.
 */
export async function criarExecucaoManual(
  input: CriarExecucaoInput,
): Promise<CriarExecucaoResult> {
  const recusas = validarOverrides(input.overrides)
  if (recusas.length > 0) return { ok: false, kind: "recusado", recusas }

  // Segunda régua, a que precisa de banco: pin só vale se o artefato
  // pinado existir de verdade.
  const semArtefato = await verificarPins(input.emailId, input.overrides)
  if (semArtefato.length > 0) {
    return { ok: false, kind: "recusado", recusas: semArtefato }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("email_generation_executions")
    .insert({
      store_id: input.storeId,
      flow_id: input.flowId ?? null,
      email_id: input.emailId,
      mode: "manual",
      triggered_by: input.triggeredBy ?? null,
      overrides: input.overrides,
      config_snapshot: input.configSnapshot ?? {},
      status: "running",
    })
    .select("id")
    .single()

  if (error) {
    // 23505 = o índice único parcial `uniq_ege_manual_viva`. Não é erro de
    // programação: é duas pessoas testando o mesmo e-mail, e o segundo
    // disparo tem de ver a execução do primeiro em vez de embaralhar os
    // overrides das duas no mesmo HTML.
    if ((error as { code?: string }).code === "23505") {
      const viva = await carregarExecucaoManualViva(input.emailId)
      if (viva) return { ok: false, kind: "conflito", viva }
    }
    log.error("execucao.criar_falhou", { emailId: input.emailId, error })
    return { ok: false, kind: "erro", mensagem: error.message }
  }

  log.info("execucao.criada", {
    executionId: data.id,
    emailId: input.emailId,
    overrides: resumirOverrides(input.overrides),
  })
  return { ok: true, executionId: data.id }
}

/**
 * A execução parou onde o operador pediu.
 *
 * `paused`, não `success`: a diferença é o que o watchdog faz com ela. Uma
 * execução pausada de propósito não pode ser varrida como geração travada —
 * senão parar no nó X e sair para almoçar devolve a execução morta.
 */
export async function pausarExecucao(
  executionId: string,
  node: string,
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from("email_generation_executions")
    .update({ status: "paused", stopped_at_node: node })
    .eq("id", executionId)
    .eq("status", "running")
  if (error) log.error("execucao.pausar_falhou", { executionId, node, error })
  else log.info("execucao.pausada", { executionId, node })
}

export async function finalizarExecucao(
  executionId: string,
  status: "success" | "error" | "cancelled",
  failureReason?: string | null,
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from("email_generation_executions")
    .update({
      status,
      failure_reason: failureReason ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", executionId)
    .in("status", ["running", "paused"])
  if (error) log.error("execucao.finalizar_falhou", { executionId, status, error })
}

/** Grava o batch da copy na execução, quando ele nasce. */
export async function vincularBatch(
  executionId: string,
  batchId: string,
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from("email_generation_executions")
    .update({ batch_id: batchId })
    .eq("id", executionId)
  if (error) log.warn("execucao.vincular_batch_falhou", { executionId, error })
}

/**
 * Modos em vigor na org — o snapshot que permite dizer, depois, que a
 * saída de uma run não representa mais a configuração de hoje (o "dirty
 * node" do n8n).
 */
export async function snapshotDeConfig(
  storeId: string,
): Promise<Record<string, unknown>> {
  try {
    const admin = createAdminClient()
    const { data: store } = await admin
      .from("client_stores")
      .select("org_id")
      .eq("id", storeId)
      .maybeSingle()
    const orgId = (store as { org_id?: string } | null)?.org_id
    if (!orgId) return {}
    const { data } = await admin
      .from("email_generation_settings")
      .select(
        "blueprint_mode, estruturador_mode, seletor_mode, montador_mode, merge_verifier_mode, qa_vision_enabled, default_model",
      )
      .eq("org_id", orgId)
      .maybeSingle()
    const { data: configs } = await admin
      .from("email_agent_configs")
      .select("id, agent_type, version, model, is_active")
      .eq("is_active", true)
    return {
      settings: data ?? null,
      agentes: (configs ?? []).map(
        (c: { agent_type: string; id: string; version: number; model: string }) => ({
          agent: c.agent_type,
          config_id: c.id,
          version: c.version,
          model: c.model,
        }),
      ),
    }
  } catch (err) {
    log.warn("execucao.snapshot_falhou", { storeId, err })
    return {}
  }
}
