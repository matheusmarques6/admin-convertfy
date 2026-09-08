/**
 * GET /api/admin/stores/[id]/generation-status/[batchId]
 *
 * Retorna o status de geração para um batch. A consulta resolve o `emailId`
 * a partir do `batchId` informado e devolve TODOS os runs daquele email
 * (histórico completo). O status agregado (`running` | `done` | `error` |
 * `pending`) e o `summary` são derivados APENAS dos runs do batch
 * PERGUNTADO — runs de outros batches ficam visíveis pra UI montar
 * histórico, mas não influenciam o status.
 *
 * A resposta é sobre o batch perguntado, e é ele que sai em
 * `currentBatchId` (08/09). Antes o campo trazia o batch VIGENTE do e-mail:
 * durante a fase 1 de uma geração nova, o e-mail ainda carrega o batch
 * anterior e as runs recém-gravadas caíam no balde de "histórico" da tela.
 * `email_batch_id` continua expondo o vigente para quem precisar comparar.
 *
 * A derivação do status vive em `@/lib/agents/generation-status-derive`
 * (pura, testada) — a regra nasceu do incidente em que o `ready` da geração
 * ANTERIOR era lido como conclusão da nova.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { derivarStatusDoBatch } from "@/lib/agents/generation-status-derive"
import { logger } from "@/lib/logger"

const log = logger.child("GenerationStatus")

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; batchId: string }> },
) {
  try {
    const { batchId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    // 1. Resolver emailId a partir do batchId. Buscamos primeiro pela
    //    coluna `generation_batch_id` no email (batch atual). Se nada,
    //    fallback: olhar a tabela de runs pra descobrir o email.
    let emailId: string | null = null
    /** Batch VIGENTE do e-mail — pode não ser o perguntado. */
    let emailBatchId: string | null = null
    let emailStatus: string | null = null
    let emailFailureReason: string | null = null
    let emailUpdatedAt: string | null = null
    // Estágio da cadeia de formatação (último step concluído) — a UI usa
    // pra dizer em qual dos 4 agentes de montagem o email está.
    let emailHtmlStage: string | null = null

    const { data: emailByBatch, error: emailLookupErr } = await admin
      .from("email_flow_emails")
      .select(
        "id, generation_batch_id, status, failure_reason, updated_at, html_pipeline_stage",
      )
      .eq("generation_batch_id", batchId)
      .maybeSingle()
    if (emailLookupErr) throw emailLookupErr

    if (emailByBatch) {
      emailId = emailByBatch.id as string
      emailBatchId = (emailByBatch.generation_batch_id as string | null) ?? null
      emailStatus = (emailByBatch.status as string | null) ?? null
      emailFailureReason = (emailByBatch.failure_reason as string | null) ?? null
      emailUpdatedAt = (emailByBatch.updated_at as string | null) ?? null
      emailHtmlStage =
        (emailByBatch.html_pipeline_stage as string | null) ?? null
    } else {
      // Fallback: o email pode ter sido sobrescrito por um batch mais novo.
      // Localiza pelo run e pega o `generation_batch_id` atual do email.
      const { data: runHit } = await admin
        .from("email_generation_runs")
        .select("email_id")
        .eq("batch_id", batchId)
        .limit(1)
        .maybeSingle()

      if (runHit?.email_id) {
        emailId = runHit.email_id as string
        const { data: emailRow } = await admin
          .from("email_flow_emails")
          .select(
            "generation_batch_id, status, failure_reason, updated_at, html_pipeline_stage",
          )
          .eq("id", emailId)
          .maybeSingle()
        emailBatchId = (emailRow?.generation_batch_id as string | null) ?? null
        emailStatus = (emailRow?.status as string | null) ?? null
        emailFailureReason = (emailRow?.failure_reason as string | null) ?? null
        emailUpdatedAt = (emailRow?.updated_at as string | null) ?? null
        emailHtmlStage = (emailRow?.html_pipeline_stage as string | null) ?? null
      }
    }

    // Sem email resolvido — devolve resposta vazia consistente.
    if (!emailId) {
      return successResponse(request, {
        batchId,
        currentBatchId: batchId,
        email_batch_id: null,
        status: "pending",
        total: 0,
        completed: 0,
        errors: [],
        runs: [],
        summary: { totalCost: 0, totalDuration: 0, tokensTotal: 0 },
        email_status: null,
        email_failure_reason: null,
        email_updated_at: null,
        html_pipeline_stage: null,
      })
    }

    // 2. Buscar runs do email + runs "batch-scoped" sem email_id.
    //
    // Os agentes Montador (assembler) e Blueprint operam por
    // (storeId, flowType, emailNumber) e gravam runs com email_id=NULL.
    // Filtrar só por email_id deixaria esses runs invisiveis, com a UI
    // mostrando eles como "pending" eterno mesmo apos concluir.
    const [byEmailRes, batchScopedRes] = await Promise.all([
      admin
        .from("email_generation_runs")
        .select(
          "id, email_id, batch_id, agent, status, error_message, cost_cents, duration_ms, tokens_input, tokens_output, retry_count, created_at",
        )
        .eq("email_id", emailId)
        .order("created_at", { ascending: true }),
      admin
        .from("email_generation_runs")
        .select(
          "id, email_id, batch_id, agent, status, error_message, cost_cents, duration_ms, tokens_input, tokens_output, retry_count, created_at",
        )
        .eq("batch_id", batchId)
        .is("email_id", null)
        .order("created_at", { ascending: true }),
    ])

    if (byEmailRes.error) throw byEmailRes.error
    if (batchScopedRes.error) throw batchScopedRes.error

    const allRuns = [
      ...(batchScopedRes.data ?? []),
      ...(byEmailRes.data ?? []),
    ]
    const runs = allRuns.sort((a, b) => {
      const at = new Date((a.created_at as string) ?? 0).getTime()
      const bt = new Date((b.created_at as string) ?? 0).getTime()
      return at - bt
    })

    // 3. Status e summary são derivados SÓ dos runs do batch PERGUNTADO.
    const currentRuns = runs.filter((r) => r.batch_id === batchId)

    // Agrupar por email (continuamos suportando o shape antigo)
    const byEmail = new Map<string, {
      agents: Array<{ agent: string; status: string; errorMessage: string | null }>
    }>()

    let totalCost = 0
    let totalDuration = 0
    let totalTokens = 0
    const errors: Array<{ emailId: string; agent: string; error: string }> = []

    for (const run of currentRuns) {
      const eid = (run.email_id as string) ?? "global"

      if (!byEmail.has(eid)) {
        byEmail.set(eid, { agents: [] })
      }
      byEmail.get(eid)!.agents.push({
        agent: run.agent as string,
        status: run.status as string,
        errorMessage: run.error_message as string | null,
      })

      totalCost += (run.cost_cents as number) ?? 0
      totalDuration += (run.duration_ms as number) ?? 0
      totalTokens +=
        ((run.tokens_input as number) ?? 0) +
        ((run.tokens_output as number) ?? 0)

      if (run.status === "error" && run.error_message) {
        errors.push({
          emailId: eid,
          agent: run.agent as string,
          error: run.error_message as string,
        })
      }
    }

    // Status do batch — regra pura e testada (generation-status-derive):
    // o `email_status` só é autoridade quando o e-mail carrega ESTE batch E
    // já assentou depois da última run dele. Sem essa segunda metade, o
    // `ready` da geração ANTERIOR (que o claim não apaga) fazia a tela
    // anunciar "concluída" no primeiro tique e parar de acompanhar.
    const status = derivarStatusDoBatch({
      runs: currentRuns.map((r) => ({
        status: r.status as string,
        created_at: r.created_at as string | null,
      })),
      emailOwnsBatch: emailBatchId === batchId,
      emailStatus,
      emailUpdatedAt,
    })

    const total = byEmail.size
    const completed = Array.from(byEmail.values()).filter((e) =>
      e.agents.every((a) => a.status === "success" || a.status === "skipped"),
    ).length

    return successResponse(request, {
      batchId,
      // A resposta é sobre o batch perguntado — é ele que a tela trata como
      // "atual" ao separar histórico.
      currentBatchId: batchId,
      email_batch_id: emailBatchId,
      status,
      total,
      completed,
      errors,
      // Devolve TODOS os runs do email (com batch_id pra UI agrupar).
      runs: runs.map((r) => ({
        // id habilita o drill-down por nó no Estúdio (detalhe da run via
        // /api/admin/email-generation-logs/[id]) — aditivo.
        id: r.id,
        agent: r.agent,
        status: r.status,
        error_message: r.error_message,
        duration_ms: r.duration_ms,
        tokens_input: r.tokens_input,
        tokens_output: r.tokens_output,
        cost_cents: r.cost_cents,
        retry_count: r.retry_count,
        batch_id: r.batch_id,
        created_at: r.created_at,
      })),
      summary: {
        totalCost,
        totalDuration,
        tokensTotal: totalTokens,
      },
      email_status: emailStatus,
      email_failure_reason: emailFailureReason,
      email_updated_at: emailUpdatedAt,
      html_pipeline_stage: emailHtmlStage,
    })
  } catch (error) {
    log.error("generation-status.error", error)
    return errorResponse(request, error, "generation-status")
  }
}
