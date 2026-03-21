import { Suspense } from "react"
import { Kanban, TrendingUp, DollarSign } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { PipelineBoard } from "@/components/pipeline/pipeline-board"
import { PipelineHeader } from "@/components/pipeline/pipeline-header"
import { PipelineStoreInitializer } from "@/components/pipeline/pipeline-store-initializer"
import { Skeleton } from "@/components/ui/skeleton"
import type { PipelineMemberRole } from "@/types"

export const dynamic = "force-dynamic"

async function getPipelineData(searchPipelineId?: string) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Check if user is admin
  let isAdmin = false
  if (user) {
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()
    isAdmin = profile?.role === "admin"
  }

  // Fetch pipelines using adminClient to bypass RLS
  const { data: pipelines } = await adminClient
    .from("pipelines")
    .select("*")
    .order("created_at", { ascending: true })

  // Select pipeline: by ID param, or default, or first available
  let selectedPipeline = searchPipelineId
    ? pipelines?.find((p) => p.id === searchPipelineId)
    : null

  if (!selectedPipeline) {
    selectedPipeline =
      pipelines?.find((p) => p.is_default) || pipelines?.[0] || null
  }

  if (!selectedPipeline) {
    return {
      pipelines: pipelines || [],
      pipeline: null,
      stages: [],
      deals: [],
      members: [],
      importRules: [],
      currentUserRole: isAdmin ? ("owner" as PipelineMemberRole) : null,
    }
  }

  // Fetch stages, deals, members, and import rules in parallel (adminClient bypasses RLS)
  const [stagesResult, dealsResult, membersResult, rulesResult] =
    await Promise.all([
      adminClient
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", selectedPipeline.id)
        .order("order", { ascending: true }),

      adminClient
        .from("deals")
        .select(
          `
          *,
          client:clients (id, name, email, company),
          owner:profiles!deals_owner_id_fkey (id, name, avatar_url)
        `
        )
        .eq("pipeline_id", selectedPipeline.id)
        .order("created_at", { ascending: false }),

      adminClient
        .from("pipeline_members")
        .select(
          `
          *,
          user:profiles!pipeline_members_user_id_fkey (id, name, email, avatar_url, role)
        `
        )
        .eq("pipeline_id", selectedPipeline.id),

      adminClient
        .from("pipeline_import_rules")
        .select(
          `
          *,
          target_stage:pipeline_stages!pipeline_import_rules_target_stage_id_fkey (id, name, color)
        `
        )
        .eq("pipeline_id", selectedPipeline.id)
        .order("priority", { ascending: false }),
    ])

  // Determine current user role
  let currentUserRole: PipelineMemberRole | null = null
  if (user && membersResult.data) {
    const membership = membersResult.data.find(
      (m) => m.user_id === user.id
    )
    currentUserRole = membership
      ? (membership.role as PipelineMemberRole)
      : null
  }
  // Admins always have owner-level access
  if (isAdmin && !currentUserRole) {
    currentUserRole = "owner"
  }

  return {
    pipelines: pipelines || [],
    pipeline: selectedPipeline,
    stages: stagesResult.data || [],
    deals: dealsResult.data || [],
    members: membersResult.data || [],
    importRules: rulesResult.data || [],
    currentUserRole,
  }
}

function BoardSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} className="h-[500px] w-[300px] flex-shrink-0" />
      ))}
    </div>
  )
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const params = await searchParams
  const data = await getPipelineData(params.id)

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
            <Icon icon={Kanban} size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
            <p className="text-sm text-muted-foreground">Gerencie oportunidades e acompanhe o funil de vendas</p>
          </div>
        </div>
        {/* Pipeline KPIs */}
        {data.deals.length > 0 && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card">
              <Icon icon={TrendingUp} size={16} className="text-primary" />
              <div>
                <p className="text-lg font-bold leading-none">{data.deals.length}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">deals ativos</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card">
              <Icon icon={DollarSign} size={16} className="text-success" />
              <div>
                <p className="text-lg font-bold leading-none">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(
                    data.deals.reduce((sum, d) => sum + (Number(d.value) || 0), 0)
                  )}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">valor total</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sync server data into Zustand store */}
      <PipelineStoreInitializer
        pipelines={data.pipelines}
        selectedPipeline={data.pipeline}
        stages={data.stages}
        deals={data.deals}
        members={data.members}
        importRules={data.importRules}
        currentUserRole={data.currentUserRole}
      />

      {/* Header */}
      <PipelineHeader
        pipelines={data.pipelines}
        currentPipeline={data.pipeline}
        stages={data.stages}
        members={data.members}
        importRules={data.importRules}
        currentUserRole={data.currentUserRole}
      />

      {/* Kanban Board */}
      <div className="flex-1 min-h-0">
        <Suspense fallback={<BoardSkeleton />}>
          <PipelineBoard
            stages={data.stages}
            deals={data.deals}
            pipelineId={data.pipeline?.id}
            currentUserRole={data.currentUserRole}
          />
        </Suspense>
      </div>
    </div>
  )
}
