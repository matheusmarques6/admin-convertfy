/**
 * POST /api/admin/email-flows/[flowId]/emails
 *   Cria um novo email num flow. Auto-increment do número.
 *   Body opcional: { name, subject, delay_hours }
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("FlowEmails")

export const dynamic = "force-dynamic"

const postSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  subject: z.string().max(240).nullable().optional(),
  preheader: z.string().max(240).nullable().optional(),
  delay_hours: z.number().int().min(0).nullable().optional(),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ flowId: string }> },
) {
  try {
    const { flowId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json().catch(() => ({}))
    const parsed = postSchema.parse(body)

    // Descobre próximo número
    const { data: maxRow } = await admin
      .from("email_flow_emails")
      .select("number")
      .eq("flow_id", flowId)
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle()
    const nextNumber = ((maxRow?.number as number | undefined) ?? 0) + 1

    const { data, error } = await admin
      .from("email_flow_emails")
      .insert({
        flow_id: flowId,
        number: nextNumber,
        name: parsed.name ?? `E-mail #${String(nextNumber).padStart(2, "0")}`,
        subject: parsed.subject ?? null,
        preheader: parsed.preheader ?? null,
        delay_hours: parsed.delay_hours ?? null,
        status: "draft",
      })
      .select("*")
      .single()

    if (error) throw error

    return successResponse(request, { email: data })
  } catch (error) {
    log.error("Flow email POST error:", error)
    return errorResponse(request, error, "flow-email-post")
  }
}
