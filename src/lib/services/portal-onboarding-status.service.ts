/**
 * Portal Onboarding Status Service
 *
 * Loads the active onboarding for a client with steps grouped by category
 * and the phase timeline.
 *
 * Extracted from portal/onboarding/route.ts so Server Components can call
 * it directly without an HTTP hop.
 */

import { SupabaseClient } from "@supabase/supabase-js"
import { AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("PortalOnboarding")

export interface PortalOnboardingStep {
  id: string
  name: string
  description: string | null
  category: string
  position: number
  status: string
  started_at: string | null
  completed_at: string | null
  due_date: string | null
}

export interface PortalOnboardingStatus {
  status: string | null
  onboarding: {
    id: string
    status: string
    current_phase: string
    progress_percent: number | null
    started_at: string | null
    target_completion_date: string | null
    completed_at: string | null
    total_steps: number
    completed_steps: number
  } | null
  phase_timeline: Array<{ id: string; label: string; completedAt: string | null }>
  grouped: Array<{
    category: string
    label: string
    steps: PortalOnboardingStep[]
    total: number
    completed: number
  }>
}

export async function getPortalOnboardingStatus(
  clientId: string,
  adminClient: SupabaseClient
): Promise<PortalOnboardingStatus> {
  // Find the most recent active onboarding for this client
  const { data: onboarding, error: onboardingError } = await adminClient
    .from("client_onboardings")
    .select(`
      id,
      status,
      current_phase,
      progress_percent,
      started_at,
      submitted_at,
      approved_at,
      copies_completed_at,
      design_completed_at,
      implementation_started_at,
      target_completion_date,
      completed_at,
      notes
    `)
    .eq("client_id", clientId)
    .in("status", ["not_started", "pending_approval", "generating_copies", "design", "implementation", "in_progress", "paused", "completed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (onboardingError || !onboarding) {
    return { status: null, onboarding: null, phase_timeline: [], grouped: [] }
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
    throw new AppError("Erro ao buscar etapas", 500)
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
        steps: catSteps as PortalOnboardingStep[],
        total: catSteps.length,
        completed,
      }
    })
    .filter((g) => g.total > 0)

  const totalSteps = steps?.length || 0
  const completedSteps = (steps || []).filter(
    (s) => s.status === "completed" || s.status === "skipped"
  ).length

  // Build phase timeline
  const currentPhase = onboarding.current_phase || onboarding.status
  const phaseTimeline = [
    { id: "pending_approval", label: "Cadastro", completedAt: onboarding.submitted_at },
    { id: "generating_copies", label: "Aprovado", completedAt: onboarding.approved_at },
    { id: "design", label: "Design", completedAt: onboarding.copies_completed_at },
    { id: "implementation", label: "Implementação", completedAt: onboarding.design_completed_at },
    { id: "completed", label: "Concluído", completedAt: onboarding.completed_at },
  ]

  return {
    status: onboarding.status,
    onboarding: {
      id: onboarding.id,
      status: onboarding.status,
      current_phase: currentPhase,
      progress_percent: onboarding.progress_percent,
      started_at: onboarding.started_at,
      target_completion_date: onboarding.target_completion_date,
      completed_at: onboarding.completed_at,
      total_steps: totalSteps,
      completed_steps: completedSteps,
    },
    phase_timeline: phaseTimeline,
    grouped,
  }
}
