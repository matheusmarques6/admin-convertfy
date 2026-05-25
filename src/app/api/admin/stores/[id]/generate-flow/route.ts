/**
 * POST /api/admin/stores/[id]/generate-flow
 *
 * Gera todos os emails de um flow usando a pipeline de IA.
 * Body: { flowId }
 *
 * Busca todos os emails do flow e gera em paralelo, respeitando max_parallel.
 * maxDuration: 300s
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { generateEmail } from "@/lib/agents/email-generation.service"

const log = logger.child("GenerateFlow")

export const dynamic = "force-dynamic"
export const maxDuration = 300

const bodySchema = z.object({
  flowId: z.string().uuid(),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = bodySchema.parse(body)

    const batchId = crypto.randomUUID()

    // Buscar flow e emails
    const { data: flow, error: flowErr } = await admin
      .from("email_flows")
      .select("id, flow_type")
      .eq("id", parsed.flowId)
      .eq("store_id", storeId)
      .single()

    if (flowErr || !flow) {
      return errorResponse(
        request,
        new Error("Flow não encontrado"),
        "generate-flow",
      )
    }

    const { data: emails, error: emailsErr } = await admin
      .from("email_flow_emails")
      .select("id, number")
      .eq("flow_id", parsed.flowId)
      .order("number", { ascending: true })

    if (emailsErr || !emails || emails.length === 0) {
      return errorResponse(
        request,
        new Error("Nenhum email encontrado no flow"),
        "generate-flow",
      )
    }

    log.info("generate-flow.start", {
      storeId,
      flowId: parsed.flowId,
      batchId,
      emailCount: emails.length,
    })

    // Buscar max_parallel do settings
    const { data: settings } = await admin
      .from("email_generation_settings")
      .select("max_parallel")
      .limit(1)
      .maybeSingle()

    const maxParallel = (settings?.max_parallel as number) ?? 2

    // Gerar emails em batches respeitando max_parallel
    const results: Array<{ emailId: string; status: string; error?: string }> = []
    const emailQueue = [...emails]

    while (emailQueue.length > 0) {
      const batch = emailQueue.splice(0, maxParallel)
      const batchResults = await Promise.allSettled(
        batch.map((email) =>
          generateEmail({
            storeId,
            flowId: parsed.flowId,
            emailId: email.id as string,
            flowType: flow.flow_type as string,
            emailNumber: email.number as number,
            triggeredBy: user.id,
            batchId,
          }).then((r) => ({
            emailId: email.id as string,
            ...r,
          })),
        ),
      )

      for (const r of batchResults) {
        if (r.status === "fulfilled") {
          results.push(r.value)
        } else {
          results.push({
            emailId: "unknown",
            status: "error",
            error: r.reason instanceof Error ? r.reason.message : "Unknown error",
          })
        }
      }
    }

    const completed = results.filter((r) => r.status === "done").length
    const errors = results.filter((r) => r.status === "error")

    log.info("generate-flow.done", {
      storeId,
      batchId,
      total: results.length,
      completed,
      errors: errors.length,
    })

    return successResponse(request, {
      batchId,
      total: results.length,
      completed,
      errors: errors.map((e) => ({ emailId: e.emailId, error: e.error })),
    })
  } catch (error) {
    log.error("generate-flow.error", error)
    return errorResponse(request, error, "generate-flow")
  }
}
