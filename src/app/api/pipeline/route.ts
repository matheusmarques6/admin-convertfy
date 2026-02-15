import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  errorResponse,
  successResponse,
  requireAuth,
  parseAndValidate,
  AppError,
} from "@/lib/api/errors"
import { z } from "zod"
import { logger } from "@/lib/logger"

const log = logger.child("Pipeline")

const pipelineCreateSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  is_default: z.boolean().default(false),
  stages: z.array(z.object({
    name: z.string().min(1),
    color: z.string(),
    order: z.number().int(),
  })).min(2, "Pelo menos 2 etapas são obrigatórias"),
})

// POST /api/pipeline - Create a new pipeline with stages
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await parseAndValidate(request, pipelineCreateSchema)

    const adminClient = createAdminClient()

    // If setting as default, unmark others first
    if (body.is_default) {
      await adminClient
        .from("pipelines")
        .update({ is_default: false })
        .eq("is_default", true)
    }

    // Create pipeline
    const { data: pipeline, error: pipelineError } = await adminClient
      .from("pipelines")
      .insert({
        name: body.name,
        description: body.description || null,
        is_default: body.is_default,
        created_by: user.id,
      })
      .select()
      .single()

    if (pipelineError) {
      log.error("Error creating pipeline", { error: pipelineError.message })
      throw new AppError("Erro ao criar pipeline: " + pipelineError.message, 500)
    }

    // Create stages
    const stagesData = body.stages.map((s) => ({
      pipeline_id: pipeline.id,
      name: s.name,
      color: s.color,
      order: s.order,
    }))

    const { error: stagesError } = await adminClient
      .from("pipeline_stages")
      .insert(stagesData)

    if (stagesError) {
      log.error("Error creating stages, rolling back pipeline", { error: stagesError.message })
      await adminClient.from("pipelines").delete().eq("id", pipeline.id)
      throw new AppError("Erro ao criar etapas: " + stagesError.message, 500)
    }

    // Ensure creator is pipeline owner
    await adminClient
      .from("pipeline_members")
      .upsert(
        {
          pipeline_id: pipeline.id,
          user_id: user.id,
          role: "owner",
          added_by: user.id,
        },
        { onConflict: "pipeline_id,user_id" }
      )

    return successResponse(request, { pipeline, stages: stagesData }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "Pipeline POST")
  }
}
