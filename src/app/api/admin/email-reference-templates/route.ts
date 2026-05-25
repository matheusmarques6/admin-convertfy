import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("EmailReferenceTemplates")

export const dynamic = "force-dynamic"

const imageMapEntrySchema = z.object({
  src: z.string(),
  alt: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  type: z.enum(["logo", "product", "hero", "icon", "decorative", "custom"]),
  product_index: z.number().optional(),
  instruction: z.string().nullable().optional(),
})

const postSchema = z.object({
  flow_type: z.string().optional(),
  email_number: z.number().int().min(1).optional().nullable(),
  name: z.string().min(1),
  html: z.string().optional(),
  copy: z.string().optional(),
  image_map: z.array(imageMapEntrySchema).optional().nullable(),
  thumbnail: z.string().optional(),
  tags: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
})

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const flowType = request.nextUrl.searchParams.get("flow_type")

    let query = admin
      .from("email_reference_templates")
      .select("*")
      .order("created_at", { ascending: false })

    if (flowType) {
      query = query.eq("flow_type", flowType)
    }

    const { data, error } = await query

    if (error) throw error

    return successResponse(request, { templates: data ?? [] })
  } catch (error) {
    log.error("ReferenceTemplates GET error:", error)
    return errorResponse(request, error, "ref-templates-get")
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
      .from("email_reference_templates")
      .insert({
        ...parsed,
        created_by: user.id,
      })
      .select("*")
      .single()

    if (error) throw error

    return successResponse(request, { template: data }, { status: 201 })
  } catch (error) {
    log.error("ReferenceTemplate POST error:", error)
    return errorResponse(request, error, "ref-template-post")
  }
}
