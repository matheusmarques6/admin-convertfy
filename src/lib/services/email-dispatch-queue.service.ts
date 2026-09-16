/**
 * Email Dispatch Queue (fila + cron).
 *
 * Gatilho NATURAL do pipeline: o callback `/api/webhooks/n8n/pesquisa-completa`
 * enfileira um job aqui quando a Pesquisa & Diagnóstico termina (em vez de
 * disparar a copy inline). Um cron (`/api/cron/email-dispatch-queue`, every
 * minute) processa o Montador+Blueprint (Architect) de cada email em lotes e,
 * quando TODOS os emails do job estão settled (reference gerada OU tentativas
 * esgotadas → fallback global), dispara pro n8n UMA vez via
 * `dispatchEmailCopyWebhook` — o payload da copy sai com a Pesquisa E a
 * estrutura sob medida de cada email.
 *
 * Resolve o 504: o Architect (Opus, 60-180s/email × N emails) não cabe num
 * request; aqui ele roda fatiado ao longo de vários ticks do cron, sem teto.
 *
 * Tolerância a falha por email (pedido do produto): um email cujo Architect
 * falha repetidamente é marcado `failed` no job — NÃO bloqueia o dispatch; o
 * consumidor (`build-vars`/`blueprint-loader`) usa o template/blueprint global
 * que já funcionava. Só os emails que os agentes não geraram caem no global.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { seedDefaultFlows } from "@/lib/services/flow-seed.service"
import {
  generateBlueprintAndReference,
  isArchitectConfigured,
} from "@/lib/agents/architect/generate.service"
import type { ReferenceSource } from "@/lib/agents/architect/component-assembler.service"
import { ensureObjectionTargets } from "@/lib/agents/objecoes/seletor.service"
import { comOrcamentoDeFase1 } from "@/lib/agents/fase1-orcamento"
import { aplicarGate } from "@/lib/stores/prontidao.service"
import { loadTextOnlyBlueprints } from "@/lib/agents/architect/blueprint-loader"
import {
  dispatchEmailCopyWebhook,
  type DispatchEmailCopyOptions,
} from "@/lib/services/email-copy-webhook.service"

const log = logger.child("EmailDispatchQueue")

// Quantas tentativas de Architect por email antes de desistir (cai no global).
// Architect é caro — não insistir muito.
const MAX_ARCHITECT_ATTEMPTS = Number(process.env.DISPATCH_MAX_ARCHITECT_ATTEMPTS ?? 2)
// Emails gerados em paralelo por lote dentro de um tick.
const ARCHITECT_BATCH = Number(process.env.DISPATCH_ARCHITECT_BATCH ?? 4)

/**
 * ── O relógio deste cron, com os números medidos ─────────────────────
 *
 * A conta que estava escrita aqui era `45s + 240s ≤ maxDuration 300s`, com
 * o 240 vindo do `ARCHITECT_INVOKE_TIMEOUT_MS`. Ela era FALSA por duas
 * razões independentes: o Curador tem teto próprio de 360s
 * (`TETO_DE_RELOGIO_MS`) e faz até duas chamadas, e a fase 1 de um e-mail
 * inteiro leva muito mais que uma chamada.
 *
 * Medido em 14 dias (43 e-mails, `email_generation_runs`): **363s de
 * mediana, 681s no p90, 1213s no máximo**. Ou seja, um e-mail nunca coube
 * numa função de 300s. O cron sobrevivia porque morrer no meio é
 * recuperável: o lease expira, outro tick reclama o job e o e-mail
 * RECOMEÇA — pagando o Curador de novo, sem nada em tela dizendo isso.
 *
 * A fase 1 de um e-mail não é retomável no meio (o Curador não tem
 * checkpoint), então a única saída honesta é uma função que caiba UM
 * e-mail. 800s é o teto da Vercel neste plano e é o que as rotas de fase 2
 * já usam.
 */
export const CRON_MAX_DURATION_S = 800
const CRON_MAX_DURATION_MS = CRON_MAX_DURATION_S * 1_000

/**
 * O que sobra para o dispatch depois que a fase 1 fecha: o
 * seed/reconcile de blocos de todos os e-mails do job, o POST ao n8n
 * (`TIMEOUT_MS` de 15s em `email-copy-webhook.service.ts`) e os updates
 * finais do job.
 */
const RESERVA_DO_DISPATCH_MS = 60_000

/**
 * A janela da fase 1 dentro deste tick. É ela que `comOrcamentoDeFase1`
 * abre — sem isso `restanteDoOrcamento()` é `null` e todo guard de
 * orçamento da fase 1 vira código morto no caminho de produção, que era o
 * estado até aqui.
 */
export const JANELA_DO_TICK_MS = CRON_MAX_DURATION_MS - RESERVA_DO_DISPATCH_MS

/**
 * Custo de um lote, que é o do e-mail mais lento dele (os e-mails do lote
 * rodam em paralelo). p90 medido: 681s. Arredondado para cima.
 */
const CUSTO_DE_UM_LOTE_MS = 690_000

/**
 * Janela para INICIAR um novo lote — derivada, não escolhida: um lote que
 * começa no limite ainda tem de caber na janela. Continua batendo com os
 * 45s que estavam aqui, mas agora por conta e com teste
 * (`email-dispatch-queue.relogio.test.ts`), não por afirmação.
 */
const TICK_BUDGET_MS = Number(
  process.env.DISPATCH_TICK_BUDGET_MS ?? JANELA_DO_TICK_MS - CUSTO_DE_UM_LOTE_MS,
)

/**
 * Lease: um job tocado há menos disso é considerado "em processamento" por
 * outro tick e não é reclamado (evita gerar o mesmo e-mail 2x = $$).
 *
 * O número é DERIVADO do `maxDuration`, não da latência dos agentes: um
 * tick não pode segurar o job por mais tempo do que a função dele vive, e
 * quando a função morre o job tem de voltar para a fila. Amarrá-lo à
 * latência de um agente é o que fazia o lease envelhecer a cada troca de
 * modelo — e com um e-mail de 681s no p90 contra um lease de 360s, outro
 * tick reclamaria o job com o primeiro ainda rodando.
 */
const LEASE_MS = Number(process.env.DISPATCH_LEASE_MS ?? CRON_MAX_DURATION_MS + 60_000)

// "skipped": email marcado "somente texto" (email_blueprints.text_only) —
// nunca roda o Montador/Blueprint por loja; settla imediatamente (o critério
// de dispatch é `architect !== "pending"`) e o n8n recebe a estrutura global.
export type ArchitectStatus = "pending" | "done" | "failed" | "skipped"

export interface JobEmail {
  flow_type: string
  email_number: number
  architect: ArchitectStatus
  attempts: number
  /**
   * Job enfileirado com forceArchitect (regenerate-pipeline): o Architect
   * REGERA mesmo com reference+blueprint persistidos (fura o guard de reuso
   * do generate.service). Viaja no JSONB do job — sem coluna nova.
   */
  force?: boolean
}

/**
 * A ordem em que os e-mails do job são processados.
 *
 * Importa porque o pré-passo do Seletor decide o alvo de objeção em
 * sequência: welcome-2 recebe `ja_atacadas` de welcome-1. Sem ordem, o
 * `ja_atacadas` de um e-mail é o de um irmão arbitrário.
 *
 * Não vinha de lugar nenhum: o enqueue lia `email_flow_emails` sem
 * `.order()` e gravava o array na ordem que o PostgREST devolvesse. O job
 * b6d89e4c (24/07) tem o welcome como **2, 5, 8, 6, 4, 1, 3, 7**.
 *
 * Este comparador é a fonte única — o enqueue ordena o que grava e o tick
 * reordena o que lê, porque os jobs já enfileirados carregam o array
 * desordenado dentro do JSONB e nenhuma migration alcança isso.
 */
export function ordemDosEmails(a: JobEmail, b: JobEmail): number {
  if (a.flow_type !== b.flow_type) return a.flow_type < b.flow_type ? -1 : 1
  return a.email_number - b.email_number
}

export interface EnqueueOptions {
  flowIds?: string[]
  onlyDrafts?: boolean
  triggerSource?: string
  triggeredBy?: string
  /**
   * Regeneração completa: ignora o skip-existing e re-roda o Montador +
   * Blueprint mesmo para emails com reference já persistida (o upsert do
   * Architect sobrescreve). Usado pelo endpoint regenerate-pipeline.
   */
  forceArchitect?: boolean
  /** Motivo humano para gerar com bloqueio de prontidão (run `gate_override`). */
  gateOverride?: { motivo: string } | null
}

export interface EnqueueResult {
  ok: boolean
  job_id?: string
  email_count?: number
  reason?: string
}

interface FlowRow {
  id: string
  flow_type: string
}

/**
 * Enfileira um job de disparo. Garante que os emails default existam
 * (auto-cura idempotente), resolve a lista de emails-alvo (respeitando
 * onlyDrafts) e insere o job `pending`. Não roda LLM aqui — só o cron roda.
 */
export async function enqueueDispatchJob(
  storeId: string,
  options: EnqueueOptions = {},
): Promise<EnqueueResult> {
  const admin = createAdminClient()
  const onlyDrafts = options.onlyDrafts ?? true

  // Gate de prontidão (B1, set/2026): a loja só entra na fila se pesquisa,
  // produtos, paleta, logo e fontes existem. Roda ANTES do dedup para o run
  // `gate` ser gravado mesmo quando já há job ativo — quem olha a tela
  // precisa ver por que a loja não gerou. O batch aqui é sintético (o job
  // ainda não existe); a fase 1 grava as runs dela sob o batch do job, e o
  // gate fica ligado à loja pela data.
  const gate = await aplicarGate({
    storeId,
    batchId: crypto.randomUUID(),
    triggeredBy: options.triggeredBy ?? null,
    origem: `enqueue:${options.triggerSource ?? "manual_store_button"}`,
    override: options.gateOverride ?? null,
  })
  if (gate.bloqueada) {
    log.info("enqueue.store_not_ready", { storeId, bloqueios: gate.prontidao.bloqueios.map((b) => b.id) })
    return { ok: false, reason: "store_not_ready" }
  }

  // Dedup: se já existe job ativo pra loja, não enfileira outro (o n8n pode
  // re-chamar o callback pesquisa-completa; sem isso pagaríamos Opus 2×).
  const { data: activeJobs, error: dedupErr } = await admin
    .from("email_dispatch_jobs")
    .select("id")
    .eq("store_id", storeId)
    .in("status", ["pending", "generating", "dispatching"])
    .limit(1)
  if (dedupErr) {
    log.error("enqueue.dedup_query_failed", { storeId, error: dedupErr.message })
    return { ok: false, reason: "dedup_query_failed" }
  }
  const activeJob = (activeJobs ?? [])[0] as { id: string } | undefined
  if (activeJob) {
    log.info("enqueue.dedup", { storeId, jobId: activeJob.id })
    return { ok: true, job_id: activeJob.id, reason: "already_queued" }
  }

  // Auto-cura: garante 7 flows + 38 emails default (idempotente; só adiciona
  // o que falta). Resolve lojas onde o seed nunca rodou / emails apagados.
  try {
    await seedDefaultFlows(storeId, admin)
  } catch (err) {
    log.warn("enqueue.seed_failed", {
      storeId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // Flows selecionados.
  let flowQuery = admin
    .from("email_flows")
    .select("id, flow_type")
    .eq("store_id", storeId)
  if (options.flowIds && options.flowIds.length > 0) {
    flowQuery = flowQuery.in("id", options.flowIds)
  }
  const { data: flowsData, error: flowErr } = await flowQuery
  if (flowErr) {
    log.error("enqueue.flows_query_failed", { storeId, error: flowErr.message })
    return { ok: false, reason: "flows_query_failed" }
  }
  const flows = (flowsData ?? []) as FlowRow[]
  if (flows.length === 0) return { ok: false, reason: "no_flows" }

  const flowTypeById = new Map(flows.map((f) => [f.id, f.flow_type]))
  const flowIds = flows.map((f) => f.id)

  // Emails-alvo (mesma semântica do dispatch: filtro de draft opcional).
  // `.order` aqui é higiene (query determinística); quem garante a ordem do
  // job é `ordemDosEmails`, aplicada ao array mapeado logo abaixo.
  let emailsQuery = admin
    .from("email_flow_emails")
    .select("flow_id, number")
    .in("flow_id", flowIds)
    .order("number", { ascending: true })
  if (onlyDrafts) emailsQuery = emailsQuery.eq("status", "draft")
  const { data: emailsData, error: emailErr } = await emailsQuery
  if (emailErr) {
    log.error("enqueue.emails_query_failed", { storeId, error: emailErr.message })
    return { ok: false, reason: "emails_query_failed" }
  }
  const rows = (emailsData ?? []) as Array<{ flow_id: string; number: number }>

  if (rows.length === 0) {
    // Distingue "sem draft" de "sem email nenhum" (igual ao dispatch).
    if (onlyDrafts) {
      const { data: anyEmail } = await admin
        .from("email_flow_emails")
        .select("id")
        .in("flow_id", flowIds)
        .limit(1)
      if (anyEmail && anyEmail.length > 0) return { ok: false, reason: "no_draft_emails" }
    }
    return { ok: false, reason: "no_emails" }
  }

  // Architect não configurado (biblioteca de outlines/variantes vazia): não
  // há LLM a rodar — o job nasce com TODOS os emails settled ('failed') e o
  // cron despacha no próximo tick direto com a estrutura global.
  const architectConfigured = await isArchitectConfigured()
  if (!architectConfigured) {
    log.info("enqueue.architect_not_configured", { storeId })
  }

  // Emails "somente texto" (email_blueprints.text_only): nascem 'skipped' —
  // nunca rodam o Architect e vão pro n8n com a estrutura global. Prevalece
  // sobre existingRefs e sobre architect-não-configurado.
  const flowTypes = Array.from(new Set(flows.map((f) => f.flow_type)))
  const textOnlyKeys = new Set(
    (await loadTextOnlyBlueprints(admin, flowTypes)).keys(),
  )

  // Skip-existing: emails cuja reference sob medida JÁ foi persistida entram
  // 'done' (o Montador só persiste quando gera de verdade) — não re-paga LLM.
  // forceArchitect pula este bloco: todos entram 'pending' e o Architect
  // re-gera (upsert sobrescreve a reference/blueprint antigos).
  const forceArchitect = options.forceArchitect === true
  const existingRefs = new Set<string>()
  if (architectConfigured && !forceArchitect) {
    const { data: refs } = await admin
      .from("store_email_references")
      .select("flow_type, email_number")
      .eq("store_id", storeId)
    for (const ref of (refs ?? []) as Array<{ flow_type: string; email_number: number }>) {
      existingRefs.add(`${ref.flow_type}:${ref.email_number}`)
    }
  }

  const emails: JobEmail[] = rows
    .map((r): JobEmail | null => {
      const flowType = flowTypeById.get(r.flow_id)
      if (!flowType) return null
      const architect: ArchitectStatus = textOnlyKeys.has(`${flowType}:${r.number}`)
        ? "skipped"
        : !architectConfigured
          ? "failed"
          : existingRefs.has(`${flowType}:${r.number}`)
            ? "done"
            : "pending"
      return {
        flow_type: flowType,
        email_number: r.number,
        architect,
        attempts: 0,
        ...(forceArchitect ? { force: true } : {}),
      }
    })
    .filter((e): e is JobEmail => e !== null)
    .sort(ordemDosEmails)

  const { data: job, error: insErr } = await admin
    .from("email_dispatch_jobs")
    .insert({
      store_id: storeId,
      flow_ids: options.flowIds && options.flowIds.length > 0 ? options.flowIds : null,
      only_drafts: onlyDrafts,
      trigger_source: options.triggerSource ?? "manual_store_button",
      triggered_by: options.triggeredBy ?? null,
      status: "pending",
      emails,
      architect_total: emails.length,
      architect_done: emails.filter((e) => e.architect === "done").length,
    })
    .select("id")
    .single()

  if (insErr || !job) {
    // 23505 = unique_violation no índice parcial uq_edj_one_active_per_store:
    // outro callback criou o job ativo entre o dedup e o insert. Mesmo
    // resultado do dedup app-level — não é erro.
    if (insErr?.code === "23505") {
      log.info("enqueue.dedup_race", { storeId })
      return { ok: true, reason: "already_queued" }
    }
    log.error("enqueue.insert_failed", { storeId, error: insErr?.message })
    return { ok: false, reason: "enqueue_failed" }
  }

  log.info("enqueue.ok", { storeId, jobId: job.id, emailCount: emails.length })
  return { ok: true, job_id: job.id as string, email_count: emails.length }
}

interface JobRow {
  id: string
  store_id: string
  flow_ids: string[] | null
  only_drafts: boolean
  trigger_source: string
  triggered_by: string | null
  status: string
  emails: JobEmail[]
  architect_total: number
  architect_done: number
  updated_at: string
}

type DispatchTriggerSource = DispatchEmailCopyOptions["triggerSource"]

const DISPATCH_TRIGGER_SOURCES: readonly DispatchTriggerSource[] = [
  "briefing_confirmed",
  "manual_store_button",
  "pesquisa_completa",
]

/** `trigger_source` no DB é TEXT; narrowing pro union do dispatch. */
function toDispatchTriggerSource(value: string): DispatchTriggerSource {
  return (DISPATCH_TRIGGER_SOURCES as readonly string[]).includes(value)
    ? (value as DispatchTriggerSource)
    : "manual_store_button"
}

/**
 * Claim otimista: marca o job como `generating` (heartbeat) só se ninguém o
 * tocou dentro do LEASE. `.eq('updated_at', readVal)` garante que apenas 1
 * tick pega o job (sem FOR UPDATE no PostgREST). Retorna o job ou null.
 */
async function claimNextJob(admin: SupabaseClient): Promise<JobRow | null> {
  const leaseThreshold = new Date(Date.now() - LEASE_MS).toISOString()
  const { data: candidates, error } = await admin
    .from("email_dispatch_jobs")
    .select("*")
    .in("status", ["pending", "generating", "dispatching"])
    .or(`status.eq.pending,updated_at.lt.${leaseThreshold}`)
    .order("created_at", { ascending: true })
    .limit(5)
  if (error) {
    log.error("claim.query_failed", { error: error.message })
    return null
  }
  for (const cand of (candidates ?? []) as JobRow[]) {
    const { data: claimed, error: claimErr } = await admin
      .from("email_dispatch_jobs")
      .update({ status: "generating", updated_at: new Date().toISOString() })
      .eq("id", cand.id)
      .eq("updated_at", cand.updated_at) // optimistic lock
      .select("*")
      .maybeSingle()
    if (claimErr) {
      log.warn("claim.update_failed", { jobId: cand.id, error: claimErr.message })
      continue
    }
    if (claimed) return claimed as JobRow
    // else: outro tick pegou primeiro → tenta o próximo candidato
  }
  return null
}

async function heartbeat(admin: SupabaseClient, job: JobRow): Promise<void> {
  await admin
    .from("email_dispatch_jobs")
    .update({
      emails: job.emails,
      architect_done: job.emails.filter((e) => e.architect === "done").length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
}

/** Roda o Architect de um email e devolve o novo status settled/pending. */
/**
 * Fontes de reference que SETTLAM o email na fila (não contam tentativa).
 *
 * Exportada e coberta por teste de exaustividade: quando `ReferenceSource`
 * ganhar um valor novo, o teste falha e obriga a decisão explícita de settlar
 * ou re-tentar. Foi assim que o `"code"` do CM-2 quase passou de fora — o que
 * faria TODA geração bem-sucedida repagar o Curador e terminar como `failed`.
 */
export const SETTLED_REFERENCE_SOURCES: ReadonlySet<ReferenceSource> = new Set<
  ReferenceSource
>(["code", "llm", "global", "store", "lacuna"])

async function runArchitectForEmail(
  job: JobRow,
  e: JobEmail,
): Promise<ArchitectStatus> {
  let referenceSource: ReferenceSource | null = null
  try {
    const res = await generateBlueprintAndReference({
      storeId: job.store_id,
      flowType: e.flow_type,
      emailNumber: e.email_number,
      batchId: job.id,
      triggeredBy: job.triggered_by ?? undefined,
      // regenerate-pipeline: fura o guard de reuso (upsert sobrescreve).
      force: e.force === true,
    })
    referenceSource = res.referenceSource
  } catch (err) {
    log.warn("architect.threw", {
      jobId: job.id,
      flowType: e.flow_type,
      emailNumber: e.email_number,
      error: err instanceof Error ? err.message : String(err),
    })
  }
  // Settled quando o reference efetivo já existe:
  //   "code"   — documento montado pelo código e persistido (caminho normal
  //              desde CM-2; sem isso na lista, TODA geração bem-sucedida
  //              contaria tentativa e repagaria o Curador);
  //   "llm"    — legado: Montador gerou e persistiu antes do CM-2;
  //   "global" — caiu no template curado de email_reference_templates
  //              (intencional, não re-tenta);
  //   "store"  — guard de reuso achou reference+blueprint já persistidos,
  //              settla sem repagar Curador/Blueprint.
  //   "lacuna" — Passo 11: a biblioteca não tem variante para uma posição
  //              decidida (hero vazia ou 2+ lacunas). O e-mail já foi
  //              marcado `failed: lacuna_biblioteca` pelo generate.service;
  //              repetir o Curador pagaria pelo mesmo resultado, e o
  //              dispatch pula e-mail com esse motivo.
  // "none" (nenhum bloco montado e sem global curado) ou exceção → conta
  // tentativa; esgotou → 'failed'.
  if (referenceSource && SETTLED_REFERENCE_SOURCES.has(referenceSource))
    return "done"
  return e.attempts + 1 >= MAX_ARCHITECT_ATTEMPTS ? "failed" : "pending"
}

/**
 * Processa a fila: claim 1 job, roda o Architect dos emails pendentes em lotes
 * dentro do orçamento de tempo e, quando todos settled, dispara pro n8n.
 * Retorna um resumo pro telemetria do cron.
 */
export async function processDispatchJobs(): Promise<{
  claimed: boolean
  jobId?: string
  architectRan: number
  dispatched: boolean
  done: boolean
}> {
  const admin = createAdminClient()
  const t0 = Date.now()

  const job = await claimNextJob(admin)
  if (!job) return { claimed: false, architectRan: 0, dispatched: false, done: false }

  // Jobs enfileirados antes de `ordemDosEmails` existir carregam o array na
  // ordem que o PostgREST devolveu. Reordenar aqui é o único caminho: o
  // array mora no JSONB do job e nenhuma migration o alcança.
  job.emails = [...job.emails].sort(ordemDosEmails)

  let architectRan = 0

  // A JANELA da fase 1 vale para tudo que roda aqui dentro — Seletor,
  // Estruturador, Curador, Montador, Blueprint, Subject. Sem este escopo
  // aberto, `restanteDoOrcamento()` devolve `null` no caminho do cron e
  // TODO o guard de `fase1-orcamento.ts` é código morto em produção: o
  // relógio de cada chamada vira o teto absoluto e `cabeNaJanela` responde
  // sempre "cabe". Era o estado até aqui — o módulo só estava ligado na aba
  // Teste e nas rotas do Catalogador.
  await comOrcamentoDeFase1(JANELA_DO_TICK_MS, async () => {
    // Pré-passo do SELETOR de objeções (set/2026): o alvo de cada email nasce
    // AQUI, em ordem de email_number, antes dos lotes paralelos — welcome-2
    // precisa saber o que welcome-1 atacou. Reaproveita o alvo vigente quando
    // o catálogo não mudou (sem LLM nos ticks seguintes). Nunca derruba o job.
    const pendentesSeletor = job.emails.filter((e) => e.architect === "pending")
    if (pendentesSeletor.length > 0) {
      const r = await ensureObjectionTargets({
        storeId: job.store_id,
        emails: pendentesSeletor.map((e) => ({ flowType: e.flow_type, emailNumber: e.email_number })),
        triggeredBy: job.triggered_by ?? undefined,
        batchId: job.id,
        logSkipped: pendentesSeletor.every((e) => e.attempts === 0),
      })
      if (r.mode !== "off") {
        log.info("seletor.pre_passo", {
          jobId: job.id, mode: r.mode, ran: r.ran, reused: r.reused,
          skipped: r.skipped, semOrcamento: r.semOrcamento, error: r.error,
        })
      }
    }

    // Roda o Architect dos pendentes em lotes paralelos até esgotar ou estourar
    // o orçamento de tempo do tick.
    while (Date.now() - t0 < TICK_BUDGET_MS) {
      const pending = job.emails.filter((e) => e.architect === "pending")
      if (pending.length === 0) break

      const batch = pending.slice(0, ARCHITECT_BATCH)
      await Promise.all(
        batch.map(async (e) => {
          const next = await runArchitectForEmail(job, e)
          e.attempts += 1
          e.architect = next
          architectRan += 1
          // Heartbeat por E-MAIL, não por lote. O lease é derivado do
          // `maxDuration` e não da latência dos agentes, então esta linha não
          // é o que impede a reclamação — ela é o que mantém o progresso
          // VISÍVEL enquanto um lote de 11 minutos roda, e o que manterá a
          // premissa de pé quando o lote for de um e-mail só.
          await heartbeat(admin, job)
        }),
      )
    }
  })

  const allSettled = job.emails.every((e) => e.architect !== "pending")
  if (!allSettled) {
    // Ainda há pendentes (estourou o orçamento) — próximo tick continua.
    await admin
      .from("email_dispatch_jobs")
      .update({ status: "generating", updated_at: new Date().toISOString() })
      .eq("id", job.id)
    return { claimed: true, jobId: job.id, architectRan, dispatched: false, done: false }
  }

  // Todos settled → dispara pro n8n UMA vez. dispatchEmailCopyWebhook usa as
  // references/blueprints gerados + fallback global para os 'failed'.
  await admin
    .from("email_dispatch_jobs")
    .update({
      status: "dispatching",
      emails: job.emails,
      architect_done: job.emails.filter((e) => e.architect === "done").length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)

  let dispatchOk = false
  let dispatchReason: string | undefined
  try {
    const res = await dispatchEmailCopyWebhook(job.store_id, {
      triggerSource: toDispatchTriggerSource(job.trigger_source),
      flowIds: job.flow_ids ?? undefined,
      triggeredBy: job.triggered_by ?? undefined,
      onlyDrafts: job.only_drafts,
    })
    dispatchOk = res.ok
    dispatchReason = res.reason
  } catch (err) {
    dispatchReason = err instanceof Error ? err.message : String(err)
    log.error("dispatch.threw", { jobId: job.id, error: dispatchReason })
  }

  // Recovery: um job 'dispatching' re-claimado (crash entre o POST ok ao n8n
  // e o update final) re-tenta o dispatch; como os emails já saíram de draft
  // (in_progress), volta 'no_draft_emails' — o batch JÁ foi despachado. Marca
  // 'done' com nota, não 'failed', pra não enganar o operador.
  const alreadyDispatched = !dispatchOk && dispatchReason === "no_draft_emails"
  await admin
    .from("email_dispatch_jobs")
    .update({
      status: dispatchOk || alreadyDispatched ? "done" : "failed",
      error: dispatchOk
        ? null
        : alreadyDispatched
          ? "no_draft_emails (batch provavelmente já despachado antes)"
          : (dispatchReason ?? "dispatch_failed"),
      dispatched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)

  log.info("job.dispatched", {
    jobId: job.id,
    storeId: job.store_id,
    dispatchOk,
    architectDone: job.emails.filter((e) => e.architect === "done").length,
    architectFailed: job.emails.filter((e) => e.architect === "failed").length,
    architectSkipped: job.emails.filter((e) => e.architect === "skipped").length,
  })

  return { claimed: true, jobId: job.id, architectRan, dispatched: dispatchOk, done: true }
}
