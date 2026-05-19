/**
 * POST /api/admin/email-qa
 *   Cria um novo item de checklist em um email. Recebe email_id, label e
 *   category opcional. Position auto-incrementa.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("EmailQA")

export const dynamic = "force-dynamic"

const postSchema = z.object({
  email_id: z.string().uuid(),
  label: z.string().min(1).max(120),
  category: z.enum(["content", "design", "tech", "compliance"]).nullable().optional(),
  position: z.number().int().min(1).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = postSchema.parse(body)

    let position = parsed.position
    if (position === undefined) {
      const { data: maxRow } = await admin
        .from("email_qa_checklist")
        .select("position")
        .eq("email_id", parsed.email_id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle()
      position = ((maxRow?.position as number | undefined) ?? 0) + 1
    }

    const { data, error } = await admin
      .from("email_qa_checklist")
      .insert({
        email_id: parsed.email_id,
        label: parsed.label,
        category: parsed.category ?? null,
        position,
        done: false,
      })
      .select("*")
      .single()

    if (error) throw error
    return successResponse(request, { item: data })
  } catch (error) {
    log.error("QA POST error:", error)
    return errorResponse(request, error, "qa-post")
  }
}
