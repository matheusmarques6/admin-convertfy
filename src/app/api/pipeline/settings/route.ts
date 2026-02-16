import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("PipelineSettings")

// PUT - Update pipeline and its stages
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()
    const { pipeline_id, name, description, is_default, stages, initial_stage_ids } = body

    if (!pipeline_id || !name) {
      throw new AppError("pipeline_id and name are required", 400)
    }

    // If setting as default, unset others
    if (is_default) {
      await supabase
        .from("pipelines")
        .update({ is_default: false })
        .eq("is_default", true)
    }

    // Update pipeline
    const { error: pipelineError } = await supabase
      .from("pipelines")
      .update({ name, description: description || null, is_default })
      .eq("id", pipeline_id)

    if (pipelineError) throw pipelineError

    // Manage stages
    if (stages && Array.isArray(stages)) {
      const existingIds = stages.filter((s: { id?: string; isNew?: boolean }) => s.id && !s.isNew).map((s: { id: string }) => s.id)
      const removedIds = (initial_stage_ids || []).filter((id: string) => !existingIds.includes(id))

      // Move deals from removed stages to first remaining stage
      if (removedIds.length > 0) {
        const firstStage = stages[0]
        if (firstStage?.id) {
          for (const removedId of removedIds) {
            await supabase
              .from("deals")
              .update({ stage_id: firstStage.id })
              .eq("stage_id", removedId)
          }
        }

        const { error } = await supabase
          .from("pipeline_stages")
          .delete()
          .in("id", removedIds)

        if (error) throw error
      }

      // Update existing stages
      for (const stage of stages.filter((s: { id?: string; isNew?: boolean }) => s.id && !s.isNew)) {
        const { error } = await supabase
          .from("pipeline_stages")
          .update({ name: stage.name, color: stage.color, order: stage.order })
          .eq("id", stage.id)

        if (error) throw error
      }

      // Create new stages
      const newStages = stages.filter((s: { isNew?: boolean; id?: string }) => s.isNew || !s.id)
      if (newStages.length > 0) {
        const { error } = await supabase.from("pipeline_stages").insert(
          newStages.map((s: { name: string; color: string; order: number }) => ({
            pipeline_id,
            name: s.name,
            color: s.color,
            order: s.order,
          }))
        )
        if (error) throw error
      }
    }

    log.info("Pipeline updated", { pipeline_id })
    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "PipelineSettings")
  }
}

// DELETE - Delete a pipeline
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const pipeline_id = request.nextUrl.searchParams.get("pipeline_id")
    const migrate_to = request.nextUrl.searchParams.get("migrate_to")

    if (!pipeline_id) {
      throw new AppError("pipeline_id is required", 400)
    }

    // Migrate deals if target specified
    if (migrate_to) {
      const { data: targetStages } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("pipeline_id", migrate_to)
        .order("order", { ascending: true })
        .limit(1)

      if (targetStages && targetStages.length > 0) {
        await supabase
          .from("deals")
          .update({ pipeline_id: migrate_to, stage_id: targetStages[0].id })
          .eq("pipeline_id", pipeline_id)
      }
    }

    const { error } = await supabase
      .from("pipelines")
      .delete()
      .eq("id", pipeline_id)

    if (error) throw error

    log.info("Pipeline deleted", { pipeline_id, migrate_to })
    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "PipelineSettings")
  }
}
