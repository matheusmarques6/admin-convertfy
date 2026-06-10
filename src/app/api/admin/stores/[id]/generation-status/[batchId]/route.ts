/**
 * GET /api/admin/stores/[id]/generation-status/[batchId]
 *
 * Retorna o status de geração para um batch. A consulta resolve o `emailId`
 * a partir do `batchId` informado e devolve TODOS os runs daquele email
 * (histórico completo). O status agregado (`running` | `done` | `error` |
 * `pending`) e o `summary` são derivados APENAS dos runs do batch atual do
 * email — runs de batches anteriores ficam visíveis pra UI montar histórico,
 * mas não influenciam o status.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
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
    let currentBatchId: string = batchId
    let emailStatus: string | null = null
    let emailFailureReason: string | null = null
    let emailUpdatedAt: string | null = null

    const { data: emailByBatch, error: emailLookupErr } = await admin
      .from("email_flow_emails")
      .select("id, generation_batch_id, status, failure_reason, updated_at")
      .eq("generation_batch_id", batchId)
      .maybeSingle()
    if (emailLookupErr) throw emailLookupErr

    if (emailByBatch) {
      emailId = emailByBatch.id as string
      currentBatchId = (emailByBatch.generation_batch_id as string | null) ?? batchId
      emailStatus = (emailByBatch.status as string | null) ?? null
      emailFailureReason = (emailByBatch.failure_reason as string | null) ?? null
      emailUpdatedAt = (emailByBatch.updated_at as string | null) ?? null
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
          .select("generation_batch_id, status, failure_reason, updated_at")
          .eq("id", emailId)
          .maybeSingle()
        currentBatchId =
          (emailRow?.generation_batch_id as string | null) ?? batchId
        emailStatus = (emailRow?.status as string | null) ?? null
        emailFailureReason = (emailRow?.failure_reason as string | null) ?? null
        emailUpdatedAt = (emailRow?.updated_at as string | null) ?? null
      }
    }

    // Sem email resolvido — devolve resposta vazia consistente.
    if (!emailId) {
      return successResponse(request, {
        batchId,
        currentBatchId: batchId,
        status: "pending",
        total: 0,
        completed: 0,
        errors: [],
        runs: [],
        summary: { totalCost: 0, totalDuration: 0, tokensTotal: 0 },
        email_status: null,
        email_failure_reason: null,
        email_updated_at: null,
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
          "id, email_id, batch_id, agent, status, error_message, cost_cents, duration_ms, tokens_input, tokens_output, created_at",
        )
        .eq("email_id", emailId)
        .order("created_at", { ascending: true }),
      admin
        .from("email_generation_runs")
        .select(
          "id, email_id, batch_id, agent, status, error_message, cost_cents, duration_ms, tokens_input, tokens_output, created_at",
        )
        .eq("batch_id", currentBatchId)
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

    // 3. Status e summary são derivados SO dos runs do batch atual.
    const currentRuns = runs.filter((r) => r.batch_id === currentBatchId)

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

    const currentStatuses = currentRuns.map((r) => r.status as string)
    const hasRunning = currentStatuses.includes("running")
    const hasError = currentStatuses.includes("error")
    const allDone =
      currentRuns.length > 0 &&
      currentStatuses.every((s) => s === "success" || s === "skipped")

    const status = hasRunning
      ? "running"
      : allDone
        ? "done"
        : hasError
          ? "error"
          : "pending"

    const total = byEmail.size
    const completed = Array.from(byEmail.values()).filter((e) =>
      e.agents.every((a) => a.status === "success" || a.status === "skipped"),
    ).length

    return successResponse(request, {
      batchId,
      currentBatchId,
      status,
      total,
      completed,
      errors,
      // Devolve TODOS os runs do email (com batch_id pra UI agrupar).
      runs: runs.map((r) => ({
        agent: r.agent,
        status: r.status,
        error_message: r.error_message,
        duration_ms: r.duration_ms,
        tokens_input: r.tokens_input,
        tokens_output: r.tokens_output,
        cost_cents: r.cost_cents,
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
    })
  } catch (error) {
    log.error("generation-status.error", error)
    return errorResponse(request, error, "generation-status")
  }
}
