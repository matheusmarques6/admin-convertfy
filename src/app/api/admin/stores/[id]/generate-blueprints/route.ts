/**
 * Dispara o Component Assembler (blueprint + reference) para a loja.
 * POST opcional body: { flow_ids?: string[] } para restringir a flows.
 * Usado pela UI ("Regenerar") e para validação manual.
 */
import { ensureObjectionTargets } from "@/lib/agents/objecoes/seletor.service"
import { NextRequest } from "next/server"
import { randomUUID } from "crypto"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { generateForEmails } from "@/lib/agents/architect/generate.service"

const log = logger.child("GenerateBlueprints")

export const dynamic = "force-dynamic"
// Montador (Opus, HTML completo) leva 60-180s por email; lote inteiro precisa
// de mais que os 60s default. Para lojas grandes, restrinja por flow_ids.
export const maxDuration = 300

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = (await request.json().catch(() => ({}))) as {
      flow_ids?: string[]
      force?: boolean
    }
    const flowIds = Array.isArray(body?.flow_ids) ? body.flow_ids : null
    const force = body?.force === true

    let flowQuery = admin
      .from("email_flows")
      .select("id, flow_type")
      .eq("store_id", storeId)
    if (flowIds && flowIds.length > 0) flowQuery = flowQuery.in("id", flowIds)

    const { data: flows, error: flowErr } = await flowQuery
    if (flowErr) throw flowErr

    const flowTypeById = new Map(
      (flows ?? []).map((f) => [f.id as string, f.flow_type as string]),
    )
    const flowIdList = Array.from(flowTypeById.keys())
    if (flowIdList.length === 0) {
      return successResponse(request, { ok: 0, failed: 0, emails: 0 })
    }

    const { data: emails, error: emailErr } = await admin
      .from("email_flow_emails")
      .select("flow_id, number")
      .in("flow_id", flowIdList)
    if (emailErr) throw emailErr

    const list = (emails ?? [])
      .map((e) => ({
        flowType: flowTypeById.get(e.flow_id as string),
        emailNumber: e.number as number,
      }))
      .filter(
        (e): e is { flowType: string; emailNumber: number } =>
          typeof e.flowType === "string",
      )

    // Seletor de objeções antes da fase 1 (set/2026): sequencial por email.
    const batchId = randomUUID()
    await ensureObjectionTargets({ storeId, emails: list, triggeredBy: user.id, batchId, force, logSkipped: true })
    const result = await generateForEmails(
      storeId,
      batchId,
      list,
      user.id,
      { force },
    )
    return successResponse(request, { ...result, emails: list.length, force })
  } catch (error) {
    log.error("generate_blueprints.post", error)
    return errorResponse(request, error, "generate-blueprints-post")
  }
}
