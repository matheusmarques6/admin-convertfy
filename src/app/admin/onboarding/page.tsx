import { Metadata } from "next"
import { Rocket } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/server"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
import { PageHeader } from "@/components/ui/page-header"
import { OnboardingOverviewClient } from "@/components/onboarding/onboarding-overview-client"

export const metadata: Metadata = {
  title: "Onboarding | Convertfy Admin",
  description: "Acompanhe o progresso de onboarding de todas as lojas",
}

export const dynamic = "force-dynamic"

// ─── Onboarding phases for the board ─────────────────────
const PHASES = [
  "configuracao",
  "briefing",
  "setup_klaviyo",
  "primeira_campanha",
  "go_live",
  "feedback_30d",
] as const

export type OnboardingPhaseSlug = (typeof PHASES)[number]

const PHASE_LABELS: Record<string, string> = {
  configuracao: "Configuração",
  briefing: "Briefing",
  setup_klaviyo: "Setup Klaviyo",
  primeira_campanha: "Primeira Campanha",
  go_live: "Go Live",
  feedback_30d: "Feedback 30d",
}

// ─── Status → Phase mapping ──────────────────────────────
// Maps the existing OnboardingStatus to the new 6-phase model
function statusToPhase(status: string, currentPhase?: string | null): OnboardingPhaseSlug {
  // If current_phase is already set, use it
  if (currentPhase && PHASES.includes(currentPhase as OnboardingPhaseSlug)) {
    return currentPhase as OnboardingPhaseSlug
  }

  switch (status) {
    case "not_started":
    case "pending_approval":
      return "configuracao"
    case "generating_copies":
      return "briefing"
    case "design":
      return "setup_klaviyo"
    case "implementation":
      return "primeira_campanha"
    case "in_progress":
      return "go_live"
    case "completed":
      return "feedback_30d"
    default:
      return "configuracao"
  }
}

// ─── Phase index for progress calculation ────────────────
function phaseIndex(phase: OnboardingPhaseSlug): number {
  return PHASES.indexOf(phase)
}

// ─── Data fetching ───────────────────────────────────────

interface OnboardingRow {
  id: string
  client_id: string
  store_id?: string
  status: string
  current_phase?: string | null
  progress_percent: number
  started_at?: string | null
  completed_at?: string | null
  created_at: string
  updated_at: string
  client?: { id: string; name: string; company?: string } | null
  store?: { id: string; store_name: string; platform?: string } | null
}

export interface OnboardingStoreItem {
  id: string
  storeId: string
  storeName: string
  clientName: string
  platform: string
  phase: OnboardingPhaseSlug
  phaseLabel: string
  phaseIndex: number
  totalPhases: number
  daysInPhase: number
  startDate: string | null
  status: string
}

async function getOnboardings() {
  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from("client_onboardings")
    .select(`
      id, client_id, store_id, status, current_phase, progress_percent,
      started_at, completed_at, created_at, updated_at,
      client:clients(id, name, company),
      store:client_stores(id, store_name, platform)
    `)
    .not("status", "eq", "cancelled")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching onboardings:", error)
    return []
  }

  const now = Date.now()

  return ((data || []) as unknown as OnboardingRow[]).map((row): OnboardingStoreItem => {
    const phase = statusToPhase(row.status, row.current_phase)
    const updatedAt = new Date(row.updated_at).getTime()
    const daysInPhase = Math.floor((now - updatedAt) / (1000 * 60 * 60 * 24))

    // Supabase returns nested relations as arrays — unwrap
    const client = Array.isArray(row.client) ? row.client[0] : row.client
    const store = Array.isArray(row.store) ? row.store[0] : row.store

    return {
      id: row.id,
      storeId: row.store_id || row.id,
      storeName: store?.store_name || "Loja sem nome",
      clientName: client?.name || "Cliente",
      platform: store?.platform || "shopify",
      phase,
      phaseLabel: PHASE_LABELS[phase] || phase,
      phaseIndex: phaseIndex(phase),
      totalPhases: PHASES.length,
      daysInPhase: Math.max(0, daysInPhase),
      startDate: row.started_at || row.created_at,
      status: row.status,
    }
  })
}

async function getKPIs(items: OnboardingStoreItem[]) {
  const active = items.filter((i) => i.status !== "completed")
  const totalActive = active.length

  // Average days to complete (from completed items)
  const completed = items.filter((i) => i.status === "completed")
  let avgDaysToComplete = 0
  if (completed.length > 0) {
    // Use started_at vs phase being completed — rough estimate from daysInPhase
    // This is a simplified version; ideally we'd compute from started_at to completed_at
    avgDaysToComplete = Math.round(
      completed.reduce((sum, i) => sum + i.daysInPhase, 0) / completed.length
    )
  }

  // Completion rate last 30 days
  const adminClient = createAdminClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { count: completedLast30 } = await adminClient
    .from("client_onboardings")
    .select("*", { count: "exact", head: true })
    .eq("status", "completed")
    .gte("completed_at", thirtyDaysAgo)

  const { count: totalStartedBefore30 } = await adminClient
    .from("client_onboardings")
    .select("*", { count: "exact", head: true })
    .lte("created_at", thirtyDaysAgo)
    .not("status", "eq", "cancelled")

  const completionRate = totalStartedBefore30 && totalStartedBefore30 > 0
    ? Math.round(((completedLast30 || 0) / totalStartedBefore30) * 100)
    : 0

  // Phase with most stores
  const phaseCounts = new Map<string, number>()
  active.forEach((i) => {
    phaseCounts.set(i.phase, (phaseCounts.get(i.phase) || 0) + 1)
  })
  let busiestPhase = "—"
  let busiestPhaseCount = 0
  phaseCounts.forEach((count, phase) => {
    if (count > busiestPhaseCount) {
      busiestPhaseCount = count
      busiestPhase = PHASE_LABELS[phase] || phase
    }
  })

  return {
    totalActive,
    avgDaysToComplete,
    completionRate,
    busiestPhase,
    busiestPhaseCount,
  }
}

// ─── Page ────────────────────────────────────────────────

export default async function OnboardingPage() {
  const items = await getOnboardings()
  const kpis = await getKPIs(items)

  // Only show active (non-completed) items in the board by default
  const activeItems = items.filter((i) => i.status !== "completed")

  return (
    <PagePermissionWrapper requiredFeatures={["onboarding_control", "onboarding_view"]}>
      <div className="space-y-6">
        <PageHeader
          icon={Rocket}
          title="Onboarding"
          description="Acompanhe o progresso de onboarding de todas as lojas."
        />

        <OnboardingOverviewClient
          items={activeItems}
          allItems={items}
          kpis={kpis}
          phases={PHASES as unknown as string[]}
          phaseLabels={PHASE_LABELS}
        />
      </div>
    </PagePermissionWrapper>
  )
}
