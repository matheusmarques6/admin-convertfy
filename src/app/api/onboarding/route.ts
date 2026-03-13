import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"
import { TaskAutomationService } from "@/lib/services/task-automation.service"
import { StepDependencyService } from "@/lib/services/step-dependency.service"

const log = logger.child("Onboarding")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - List client onboardings
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const clientId = searchParams.get("client_id")
    const storeId = searchParams.get("store_id")
    const status = searchParams.get("status")
    const assignedToMe = searchParams.get("assigned_to_me") === "true"

    // Use adminClient to bypass RLS for reading onboardings data
    const adminClient = createAdminClient()

    let query = adminClient
      .from("client_onboardings")
      .select(`
        *,
        client:clients(id, name, company, email),
        store:client_stores(id, store_name, platform),
        assignee:org_members(
          id,
          role,
          profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
        )
      `)
      .order("created_at", { ascending: false })

    if (clientId) {
      query = query.eq("client_id", clientId)
    }

    if (storeId) {
      query = query.eq("store_id", storeId)
    }

    if (status) {
      query = query.eq("status", status)
    }

    if (assignedToMe) {
      const { data: orgMember } = await adminClient
        .from("org_members")
        .select("id")
        .eq("profile_id", user.id)
        .eq("is_active", true)
        .single()

      if (orgMember) {
        query = query.eq("assigned_to", orgMember.id)
      }
    }

    const { data: onboardings, error } = await query

    if (error) {
      log.error("[Onboarding] Error fetching:", error)
      throw new AppError("Erro ao buscar onboardings", 500)
    }

    return successResponse(request, { onboardings: onboardings || [] })
  } catch (error) {
    return errorResponse(request, error, "Onboarding")
  }
}

// POST - Start new onboarding for a client
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()

    if (!body.client_id) {
      throw new AppError("client_id é obrigatório", 400)
    }

    const adminClient = createAdminClient()

    // Check if client already has an active onboarding
    const { data: existing } = await supabase
      .from("client_onboardings")
      .select("id")
      .eq("client_id", body.client_id)
      .in("status", ["not_started", "pending_approval", "generating_copies", "design", "implementation", "in_progress", "paused"])
      .maybeSingle()

    if (existing) {
      throw new AppError("Cliente já possui um onboarding ativo", 400)
    }

    // Get default template
    const { data: template } = await supabase
      .from("onboarding_templates")
      .select(`
        *,
        steps:onboarding_template_steps(*)
      `)
      .eq("is_default", true)
      .eq("is_active", true)
      .single()

    if (!template) {
      throw new AppError("Nenhum template de onboarding encontrado", 400)
    }

    // AC 40.10.13: Validate DAG before creating onboarding
    if (template.steps && template.steps.length > 0) {
      const dagResult = StepDependencyService.validateDag(template.steps)
      if (!dagResult.valid) {
        const cycleInfo = dagResult.cycle ? ` Ciclo: ${dagResult.cycle.join(" -> ")}` : ""
        throw new AppError(
          `Template contém ciclo de dependências e não pode ser usado.${cycleInfo}`,
          400,
        )
      }
    }

    // Calculate target completion date
    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() + (template.estimated_days || 14))

    // Create onboarding
    const { data: onboarding, error: insertError } = await adminClient
      .from("client_onboardings")
      .insert({
        client_id: body.client_id,
        store_id: body.store_id || null,
        template_id: template.id,
        status: "in_progress",
        assigned_to: body.assigned_to || null,
        started_at: new Date().toISOString(),
        target_completion_date: targetDate.toISOString(),
        notes: body.notes || null,
      })
      .select()
      .single()

    if (insertError) {
      log.error("[Onboarding] Insert error:", insertError)
      throw new AppError("Erro ao criar onboarding", 500)
    }

    // Create steps from template — copy all relevant fields
    interface TemplateStep {
      id: string
      name: string
      description?: string
      category: string
      position: number
      estimated_hours: number
      metadata: Record<string, unknown>
      is_required?: boolean
      phase?: string
      depends_on?: string
      depends_on_steps?: string[]
    }

    // Resolve org_id from assigned member or client
    let resolvedOrgId: string | null = null
    if (body.assigned_to) {
      const { data: assigneeMember } = await adminClient
        .from("org_members")
        .select("org_id")
        .eq("id", body.assigned_to)
        .single()
      resolvedOrgId = assigneeMember?.org_id ?? null
    }
    if (!resolvedOrgId) {
      const { data: clientData } = await adminClient
        .from("clients")
        .select("org_id")
        .eq("id", body.client_id)
        .single()
      resolvedOrgId = clientData?.org_id ?? null
    }

    const sortedTemplateSteps = (template.steps || [])
      .sort((a: TemplateStep, b: TemplateStep) => a.position - b.position)

    const steps = sortedTemplateSteps.map((step: TemplateStep) => ({
      onboarding_id: onboarding.id,
      template_step_id: step.id,
      name: step.name,
      description: step.description,
      category: step.category,
      position: step.position,
      status: "pending",
      metadata: step.metadata || {},
      is_required: step.is_required ?? true,
      phase: step.phase ?? null,
      org_id: resolvedOrgId,
    }))

    if (steps.length > 0) {
      const { data: insertedSteps } = await adminClient
        .from("client_onboarding_steps")
        .insert(steps)
        .select("id, template_step_id")

      // Resolve depends_on_step_ids from template dependencies
      if (insertedSteps && insertedSteps.length > 0) {
        const templateToClientStep = new Map(
          insertedSteps.map((s: { id: string; template_step_id: string }) => [s.template_step_id, s.id])
        )

        for (const tStep of sortedTemplateSteps) {
          // Gather all template dependency IDs
          const templateDepIds: string[] = [
            ...(tStep.depends_on_steps || []),
            ...(tStep.depends_on && !(tStep.depends_on_steps || []).includes(tStep.depends_on)
              ? [tStep.depends_on]
              : []),
          ]

          if (templateDepIds.length === 0) continue

          const clientDepIds = templateDepIds
            .map((tid: string) => templateToClientStep.get(tid))
            .filter(Boolean) as string[]

          if (clientDepIds.length > 0) {
            const clientStepId = templateToClientStep.get(tStep.id)
            if (clientStepId) {
              await adminClient
                .from("client_onboarding_steps")
                .update({ depends_on_step_ids: clientDepIds })
                .eq("id", clientStepId)
            }
          }
        }

        // Initialize step statuses (set 'waiting' for steps with unmet deps)
        await adminClient.rpc("initialize_onboarding_step_statuses", {
          p_onboarding_id: onboarding.id,
        })
      }
    }

    // Update client status to onboarding
    await adminClient
      .from("clients")
      .update({ status: "onboarding" })
      .eq("id", body.client_id)

    // Fetch complete onboarding with steps
    const { data: completeOnboarding } = await supabase
      .from("client_onboardings")
      .select(`
        *,
        client:clients(id, name, company),
        store:client_stores(id, store_name),
        steps:client_onboarding_steps(*)
      `)
      .eq("id", onboarding.id)
      .single()

    // Auto-create board task for assigned agent (non-blocking)
    if (onboarding.assigned_to) {
      const storeName = completeOnboarding?.store
        ? (Array.isArray(completeOnboarding.store) ? completeOnboarding.store[0] : completeOnboarding.store)?.store_name
        : "Nova loja"
      // Resolve org_id from the assigned member
      const { data: assigneeMember } = await adminClient
        .from("org_members")
        .select("org_id")
        .eq("id", onboarding.assigned_to)
        .single()
      if (assigneeMember?.org_id) {
        TaskAutomationService.onOnboardingStarted({
          onboardingId: onboarding.id,
          storeName: storeName || "Nova loja",
          clientId: body.client_id,
          storeId: body.store_id,
          assignedTo: onboarding.assigned_to,
          orgId: assigneeMember.org_id,
        }).catch((err) => log.error("Erro ao criar auto-task de onboarding", { err }))
      }
    }

    return successResponse(request, { onboarding: completeOnboarding, message: "Onboarding iniciado com sucesso" }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "Onboarding")
  }
}
