/**
 * GET /api/admin/stores/[id]/generation-status/[batchId]
 *
 * Retorna o status de um batch de geração, agrupado por email.
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

    const { data: runs, error } = await admin
      .from("email_generation_runs")
      .select("id, email_id, agent, status, error_message, cost_cents, duration_ms, tokens_input, tokens_output")
      .eq("batch_id", batchId)
      .order("created_at", { ascending: true })

    if (error) throw error

    // Agrupar por email
    const byEmail = new Map<string, {
      agents: Array<{
        agent: string
        status: string
        errorMessage: string | null
      }>
    }>()

    let totalCost = 0
    let totalDuration = 0
    let totalTokens = 0
    const errors: Array<{ emailId: string; agent: string; error: string }> = []

    for (const run of runs ?? []) {
      const emailId = (run.email_id as string) ?? "global"

      if (!byEmail.has(emailId)) {
        byEmail.set(emailId, { agents: [] })
      }
      byEmail.get(emailId)!.agents.push({
        agent: run.agent as string,
        status: run.status as string,
        errorMessage: run.error_message as string | null,
      })

      totalCost += (run.cost_cents as number) ?? 0
      totalDuration += (run.duration_ms as number) ?? 0
      totalTokens += ((run.tokens_input as number) ?? 0) + ((run.tokens_output as number) ?? 0)

      if (run.status === "error" && run.error_message) {
        errors.push({
          emailId,
          agent: run.agent as string,
          error: run.error_message as string,
        })
      }
    }

    // Calcular status geral
    const allStatuses = (runs ?? []).map((r) => r.status as string)
    const hasRunning = allStatuses.includes("running")
    const hasError = allStatuses.includes("error")
    const allDone = allStatuses.every((s) => s === "success" || s === "skipped")

    const status = hasRunning ? "running" : allDone ? "done" : hasError ? "error" : "pending"

    const total = byEmail.size
    const completed = Array.from(byEmail.values()).filter((e) =>
      e.agents.every((a) => a.status === "success" || a.status === "skipped"),
    ).length

    return successResponse(request, {
      batchId,
      status,
      total,
      completed,
      errors,
      runs: (runs ?? []).map((r) => ({
        agent: r.agent,
        status: r.status,
        error_message: r.error_message,
        duration_ms: r.duration_ms,
        tokens_input: r.tokens_input,
        tokens_output: r.tokens_output,
        cost_cents: r.cost_cents,
      })),
      summary: {
        totalCost,
        totalDuration,
        tokensTotal: totalTokens,
      },
    })
  } catch (error) {
    log.error("generation-status.error", error)
    return errorResponse(request, error, "generation-status")
  }
}
