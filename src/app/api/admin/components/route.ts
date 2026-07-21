/**
 * Biblioteca de componentes (Epic AE — Component Assembler).
 * GET: lista variantes (filtros block_type / is_active). POST: cria.
 */
import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { assertCanManagePrompts } from "@/lib/services/prompt-management.service"
import { logger } from "@/lib/logger"
import { COMPONENT_CATEGORY_KEYS } from "@/lib/agents/shared/component-categories"
import { outputFieldSchema } from "@/lib/agents/shared/component-schemas"

const log = logger.child("EmailComponents")

export const dynamic = "force-dynamic"

const postSchema = z.object({
  block_type: z.enum(COMPONENT_CATEGORY_KEYS as [string, ...string[]]),
  name: z.string().min(1),
  html: z.string().min(1),
  rendered_html: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  long_description: z.string().nullable().optional(),
  slots: z.array(z.string()).default([]),
  objectives: z.array(z.string()).default([]),
  tones: z.array(z.string()).default([]),
  when_use: z.string().nullable().optional(),
  when_not_use: z.string().nullable().optional(),
  copy_guidance: z.string().nullable().optional(),
  product_slots: z.number().int().min(0).max(20).default(0),
  output_schema: z.array(outputFieldSchema).default([]),
  density: z.enum(["minimal", "balanced", "rich"]).nullable().optional(),
  tags: z.array(z.string()).default([]),
  thumbnail: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
})

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const blockType = request.nextUrl.searchParams.get("block_type")
    const isActiveRaw = request.nextUrl.searchParams.get("is_active")

    let query = admin
      .from("email_component_variants")
      .select("*")
      .order("block_type", { ascending: true })
      .order("name", { ascending: true })

    if (blockType) query = query.eq("block_type", blockType)
    if (isActiveRaw === "true") query = query.eq("is_active", true)
    else if (isActiveRaw === "false") query = query.eq("is_active", false)

    const { data, error } = await query
    if (error) throw error
    return successResponse(request, { variants: data ?? [] })
  } catch (error) {
    log.error("components.get", error)
    return errorResponse(request, error, "components-get")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const parsed = postSchema.parse(await request.json())
    const { data, error } = await admin
      .from("email_component_variants")
      .insert({ ...parsed, created_by: user.id })
      .select("*")
      .single()
    if (error) throw error
    return successResponse(request, { variant: data }, { status: 201 })
  } catch (error) {
    log.error("components.post", error)
    return errorResponse(request, error, "components-post")
  }
}
