import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("PortalOnboarding")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





/**
 * GET /api/portal/onboarding
 *
 * Returns the active onboarding for the logged-in portal user's client.
 * Includes all steps grouped by category with progress info.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    // Get portal user (using admin client to bypass RLS)
    const { data: portalUser } = await adminClient
      .from("client_portal_users")
      .select("client_id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      return NextResponse.json(
        { error: "Não autorizado" },
        { status: 401, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    const clientId = portalUser.client_id

    // Find the most recent active onboarding for this client
    const { data: onboarding, error: onboardingError } = await adminClient
      .from("client_onboardings")
      .select(`
        id,
        status,
        progress_percent,
        started_at,
        target_completion_date,
        completed_at,
        notes
      `)
      .eq("client_id", clientId)
      .in("status", ["not_started", "in_progress", "paused", "completed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (onboardingError || !onboarding) {
      return NextResponse.json(
        { onboarding: null, message: "Nenhum onboarding encontrado" },
        { headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    // Get all steps for this onboarding (no sensitive data)
    const { data: steps, error: stepsError } = await adminClient
      .from("client_onboarding_steps")
      .select(`
        id,
        name,
        description,
        category,
        position,
        status,
        started_at,
        completed_at,
        due_date
      `)
      .eq("onboarding_id", onboarding.id)
      .order("position", { ascending: true })

    if (stepsError) {
      log.error("[Portal Onboarding] Error fetching steps:", stepsError)
      return NextResponse.json(
        { error: "Erro ao buscar etapas" },
        { status: 500, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    // Group steps by category
    const categories = ["setup", "integration", "training", "launch"]
    const categoryLabels: Record<string, string> = {
      setup: "Configuração",
      integration: "Integrações",
      training: "Treinamento",
      launch: "Lançamento",
    }

    const grouped = categories
      .map((cat) => {
        const catSteps = (steps || []).filter((s) => s.category === cat)
        const completed = catSteps.filter(
          (s) => s.status === "completed" || s.status === "skipped"
        ).length
        return {
          category: cat,
          label: categoryLabels[cat] || cat,
          steps: catSteps,
          total: catSteps.length,
          completed,
        }
      })
      .filter((g) => g.total > 0)

    const totalSteps = steps?.length || 0
    const completedSteps = (steps || []).filter(
      (s) => s.status === "completed" || s.status === "skipped"
    ).length

    return NextResponse.json(
      {
        onboarding: {
          id: onboarding.id,
          status: onboarding.status,
          progress_percent: onboarding.progress_percent,
          started_at: onboarding.started_at,
          target_completion_date: onboarding.target_completion_date,
          completed_at: onboarding.completed_at,
          total_steps: totalSteps,
          completed_steps: completedSteps,
        },
        grouped,
      },
      { headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    log.error("[Portal Onboarding] Error:", error)
    return NextResponse.json(
      { error: "Erro interno" },
      { status: 500, headers: corsHeaders(request.headers.get("origin")) }
    )
  }
}
