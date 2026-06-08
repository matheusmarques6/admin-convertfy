import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("EmailBlueprints")

export const dynamic = "force-dynamic"

const postSchema = z.object({
  flow_type: z.string().min(1),
  email_number: z.number().int().min(1),
  objective: z.string().min(1),
  messaging: z.string().min(1),
  subject_hint: z.string().optional(),
  blocks: z.array(z.record(z.string(), z.unknown())).default([]),
  tone_override: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const flowType = request.nextUrl.searchParams.get("flow_type")

    let query = admin
      .from("email_blueprints")
      .select("*")
      .order("flow_type")
      .order("email_number")

    if (flowType) {
      query = query.eq("flow_type", flowType)
    }

    const { data, error } = await query

    if (error) throw error

    return successResponse(request, { blueprints: data ?? [] })
  } catch (error) {
    log.error("Blueprints GET error:", error)
    return errorResponse(request, error, "blueprints-get")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = postSchema.parse(body)

    const { data, error } = await admin
      .from("email_blueprints")
      .insert({
        ...parsed,
        updated_by: user.id,
      })
      .select("*")
      .single()

    if (error) throw error

    return successResponse(request, { blueprint: data }, { status: 201 })
  } catch (error) {
    log.error("Blueprint POST error:", error)
    return errorResponse(request, error, "blueprint-post")
  }
}
