/**
 * POST /api/crm/deals/[id]/activities
 * Adiciona uma atividade (nota interna, mensagem, task, etc) na timeline.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmDealActivities")

export const dynamic = "force-dynamic"

const activitySchema = z.object({
  type: z.enum([
    "note", "call", "email", "wa_message", "ig_message",
    "meeting", "task", "system", "stage_change", "file_attached",
  ]),
  content: z.string().min(1).max(8000),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  due_at: z.string().nullable().optional(),
  is_internal: z.boolean().default(true),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = activitySchema.parse(body)

    const { data, error } = await admin
      .from("crm_deal_activities")
      .insert({
        deal_id: id,
        type: parsed.type,
        content: parsed.content,
        metadata: parsed.metadata,
        due_at: parsed.due_at ?? null,
        is_internal: parsed.is_internal,
        created_by: user.id,
      })
      .select(`
        id, type, content, metadata, due_at, completed_at, is_internal, created_at,
        creator:profiles!crm_deal_activities_created_by_fkey (id, name, avatar_url)
      `)
      .single()

    if (error) throw error

    log.info("[Activities] created", { deal_id: id, type: parsed.type })
    return successResponse(request, { activity: data })
  } catch (error) {
    log.error("Activity post error:", error)
    return errorResponse(request, error, "crm-activity-post")
  }
}
