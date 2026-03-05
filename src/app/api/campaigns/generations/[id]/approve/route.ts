import { NextRequest } from "next/server"
import { errorResponse, successResponse, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("GenerationApprove")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      throw new AppError("Não autorizado", 401)
    }

    // Resolve org_member + role check
    const { data: orgMember } = await supabase
      .from("org_members")
      .select("id, org_id, role")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .single()

    // Also check admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const isAdmin = profile?.role === "admin"
    const canApprove =
      orgMember && ["owner", "manager", "coo"].includes(orgMember.role)

    if (!canApprove && !isAdmin) {
      throw new AppError(
        "Você não tem permissão para aprovar gerações de campanha",
        403
      )
    }

    const adminClient = createAdminClient()

    // Fetch generation + validate state
    const { data: generation, error: fetchError } = await adminClient
      .from("campaign_generations")
      .select("id, status, client_id, prompt, reference_doc_url")
      .eq("id", id)
      .single()

    if (fetchError || !generation) {
      throw new AppError("Geração não encontrada", 404)
    }

    if (generation.status !== "done") {
      throw new AppError(
        `Só é possível aprovar gerações com status 'done', atual: '${generation.status}'`,
        400
      )
    }

    // Update status to 'approved' — DB trigger creates 3 tasks
    const { data: updated, error: updateError } = await adminClient
      .from("campaign_generations")
      .update({
        status: "approved",
        approved_by: orgMember?.id ?? null,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "done") // optimistic concurrency
      .select("id, status, approved_at")
      .single()

    if (updateError || !updated) {
      log.error("Failed to approve generation", updateError)
      throw new AppError("Erro ao aprovar geração", 500)
    }

    // Fetch the 3 tasks created by the trigger
    const { data: tasks } = await adminClient
      .from("campaign_generation_tasks")
      .select("id, role, assignee_id")
      .eq("generation_id", id)

    // Auto-assign default org members by role
    if (tasks?.length && orgMember?.org_id) {
      const { data: candidates } = await adminClient
        .from("org_members")
        .select("id, role, profile_id")
        .eq("org_id", orgMember.org_id)
        .eq("is_active", true)
        .in("role", ["designer", "techlead", "sdr"])

      if (candidates?.length) {
        const roleMap = new Map(
          candidates.map((c) => [c.role, { id: c.id, profile_id: c.profile_id }])
        )

        const assignUpdates = tasks
          .filter((t) => !t.assignee_id && roleMap.has(t.role))
          .map((t) =>
            adminClient
              .from("campaign_generation_tasks")
              .update({ assignee_id: roleMap.get(t.role)!.id })
              .eq("id", t.id)
          )

        await Promise.all(assignUpdates)

        // Notify each assignee
        const notifications = tasks
          .filter((t) => roleMap.has(t.role))
          .map((t) => ({
            user_id: roleMap.get(t.role)!.profile_id,
            title: "Nova tarefa de campanha",
            body: `Uma geração de campanha foi aprovada e precisa da sua ação como ${t.role}.`,
            type: "info" as const,
            link: "/campaigns?view=copy",
            metadata: {
              generation_id: id,
              task_id: t.id,
              task_role: t.role,
            },
          }))

        if (notifications.length) {
          await adminClient.from("notifications").insert(notifications)
        }
      }
    }

    log.info(`Generation ${id} approved by ${user.id}`)

    return successResponse(request, {
      generation: updated,
      tasks_created: tasks?.length ?? 0,
      message: "Geração aprovada com sucesso",
    })
  } catch (error) {
    return errorResponse(request, error, "GenerationApprove")
  }
}
