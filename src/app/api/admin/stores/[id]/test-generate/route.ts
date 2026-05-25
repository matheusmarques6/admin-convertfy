/**
 * POST /api/admin/stores/[id]/test-generate
 *
 * Teste rápido de geração: usa (ou cria) flow + email temporários.
 * Body: { flowType, emailNumber }
 *
 * maxDuration: 300s
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { generateEmail } from "@/lib/agents/email-generation.service"

const log = logger.child("TestGenerate")

export const dynamic = "force-dynamic"
export const maxDuration = 300

const bodySchema = z.object({
  flowType: z.string().min(1),
  emailNumber: z.number().int().min(1),
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

    // Buscar ou criar flow
    let flowId: string
    const { data: existingFlow } = await admin
      .from("email_flows")
      .select("id")
      .eq("store_id", storeId)
      .eq("flow_type", parsed.flowType)
      .maybeSingle()

    if (existingFlow) {
      flowId = existingFlow.id as string
    } else {
      const { data: newFlow, error: flowErr } = await admin
        .from("email_flows")
        .insert({
          store_id: storeId,
          flow_type: parsed.flowType,
          name: `Test ${parsed.flowType}`,
          status: "in_progress",
          position: 99,
        })
        .select("id")
        .single()

      if (flowErr || !newFlow) {
        throw new Error("Falha ao criar flow de teste")
      }
      flowId = newFlow.id as string
    }

    // Buscar ou criar email
    let emailId: string
    const { data: existingEmail } = await admin
      .from("email_flow_emails")
      .select("id")
      .eq("flow_id", flowId)
      .eq("number", parsed.emailNumber)
      .maybeSingle()

    if (existingEmail) {
      emailId = existingEmail.id as string
    } else {
      const { data: newEmail, error: emailErr } = await admin
        .from("email_flow_emails")
        .insert({
          flow_id: flowId,
          number: parsed.emailNumber,
          name: `Test ${parsed.flowType} #${parsed.emailNumber}`,
          status: "draft",
        })
        .select("id")
        .single()

      if (emailErr || !newEmail) {
        throw new Error("Falha ao criar email de teste")
      }
      emailId = newEmail.id as string
    }

    const batchId = crypto.randomUUID()

    log.info("test-generate.start", {
      storeId,
      flowId,
      emailId,
      batchId,
    })

    const result = await generateEmail({
      storeId,
      flowId,
      emailId,
      flowType: parsed.flowType,
      emailNumber: parsed.emailNumber,
      triggeredBy: user.id,
      batchId,
    })

    return successResponse(request, { batchId, emailId, flowId, ...result })
  } catch (error) {
    log.error("test-generate.error", error)
    return errorResponse(request, error, "test-generate")
  }
}
