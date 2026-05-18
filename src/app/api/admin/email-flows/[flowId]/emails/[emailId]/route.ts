/**
 * GET   /api/admin/email-flows/[flowId]/emails/[emailId]
 *   Retorna detalhe completo do email: blocos + HTML + QA checklist.
 *
 * PATCH /api/admin/email-flows/[flowId]/emails/[emailId]
 *   Atualiza envelope (subject, preheader, from), status, html.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("EmailDetail")

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ flowId: string; emailId: string }> },
) {
  try {
    const { emailId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { data: email, error } = await admin
      .from("email_flow_emails")
      .select("*")
      .eq("id", emailId)
      .single()

    if (error || !email) {
      return errorResponse(
        request,
        new Error("Email nao encontrado"),
        "email-detail-not-found",
      )
    }

    const [{ data: blocks }, { data: qa }] = await Promise.all([
      admin
        .from("email_blocks")
        .select("*")
        .eq("email_id", emailId)
        .order("position", { ascending: true }),
      admin
        .from("email_qa_checklist")
        .select("*")
        .eq("email_id", emailId)
        .order("position", { ascending: true }),
    ])

    return successResponse(request, {
      email: { ...email, blocks: blocks || [], qa_items: qa || [] },
    })
  } catch (error) {
    log.error("Email detail GET error:", error)
    return errorResponse(request, error, "email-detail-get")
  }
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  from_name: z.string().max(120).nullable().optional(),
  from_email: z.string().email().nullable().optional(),
  subject: z.string().max(240).nullable().optional(),
  preheader: z.string().max(240).nullable().optional(),
  html: z.string().nullable().optional(),
  delay_hours: z.number().int().min(0).nullable().optional(),
  status: z.enum(["draft", "in_progress", "ready", "approved", "live"]).optional(),
  klaviyo_message_id: z.string().nullable().optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ flowId: string; emailId: string }> },
) {
  try {
    const { emailId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = patchSchema.parse(body)

    const { error } = await admin
      .from("email_flow_emails")
      .update(parsed)
      .eq("id", emailId)

    if (error) throw error

    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Email PATCH error:", error)
    return errorResponse(request, error, "email-patch")
  }
}
