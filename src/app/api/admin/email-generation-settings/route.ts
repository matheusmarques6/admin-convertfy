import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("EmailGenerationSettings")

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  org_id: z.string().uuid(),
  auto_trigger: z.boolean().optional(),
  max_parallel: z.number().int().min(1).max(10).optional(),
  generate_images: z.boolean().optional(),
  notify_on_error: z.boolean().optional(),
  notify_on_success: z.boolean().optional(),
  notify_emails: z.array(z.string().email()).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const orgId = request.nextUrl.searchParams.get("org_id")
    if (!orgId) {
      return errorResponse(
        request,
        new Error("org_id is required"),
        "settings-get-missing-org",
      )
    }

    const { data, error } = await admin
      .from("email_generation_settings")
      .select("*")
      .eq("org_id", orgId)
      .maybeSingle()

    if (error) throw error

    return successResponse(request, { settings: data })
  } catch (error) {
    log.error("GenerationSettings GET error:", error)
    return errorResponse(request, error, "gen-settings-get")
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = patchSchema.parse(body)

    const { org_id, ...fields } = parsed

    const { data, error } = await admin
      .from("email_generation_settings")
      .upsert(
        {
          org_id,
          ...fields,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        },
        { onConflict: "org_id" },
      )
      .select("*")
      .single()

    if (error) throw error

    return successResponse(request, { settings: data })
  } catch (error) {
    log.error("GenerationSettings PATCH error:", error)
    return errorResponse(request, error, "gen-settings-patch")
  }
}
