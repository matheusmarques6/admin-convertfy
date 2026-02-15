import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

// POST /api/pipeline - Create a new pipeline with stages
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, is_default, stages } = body

    if (!name || !stages || stages.length < 2) {
      return NextResponse.json(
        { error: "Nome e pelo menos 2 etapas são obrigatórios" },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    // If setting as default, unmark others first
    if (is_default) {
      await adminClient
        .from("pipelines")
        .update({ is_default: false })
        .eq("is_default", true)
    }

    // Create pipeline
    const { data: pipeline, error: pipelineError } = await adminClient
      .from("pipelines")
      .insert({
        name,
        description: description || null,
        is_default: is_default || false,
        created_by: user.id,
      })
      .select()
      .single()

    if (pipelineError) {
      console.error("Error creating pipeline:", pipelineError)
      return NextResponse.json(
        { error: `Erro ao criar pipeline: ${pipelineError.message}` },
        { status: 500 }
      )
    }

    // Create stages
    const stagesData = stages.map(
      (s: { name: string; color: string; order: number }) => ({
        pipeline_id: pipeline.id,
        name: s.name,
        color: s.color,
        order: s.order,
      })
    )

    const { error: stagesError } = await adminClient
      .from("pipeline_stages")
      .insert(stagesData)

    if (stagesError) {
      console.error("Error creating stages:", stagesError)
      // Cleanup: delete the pipeline we just created
      await adminClient.from("pipelines").delete().eq("id", pipeline.id)
      return NextResponse.json(
        { error: `Erro ao criar etapas: ${stagesError.message}` },
        { status: 500 }
      )
    }

    // The trigger auto_add_pipeline_owner should have added the creator as owner
    // But let's ensure it explicitly in case the trigger doesn't exist yet
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

    return NextResponse.json({ pipeline, stages: stagesData })
  } catch (error) {
    console.error("Pipeline creation error:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    )
  }
}
