import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { PipelineBoard } from "@/components/pipeline/pipeline-board"
import { PipelineHeader } from "@/components/pipeline/pipeline-header"
import { Skeleton } from "@/components/ui/skeleton"
import type { PipelineMemberRole } from "@/types"

export const dynamic = "force-dynamic"

async function getPipelineData(searchPipelineId?: string) {
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Check if user is admin
  let isAdmin = false
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()
    isAdmin = profile?.role === "admin"
  }

  // Fetch pipelines (RLS will filter based on membership)
  const { data: pipelines } = await supabase
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

  // Fetch stages, deals, members, and import rules in parallel
  const [stagesResult, dealsResult, membersResult, rulesResult] =
    await Promise.all([
      supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", selectedPipeline.id)
        .order("order", { ascending: true }),

      supabase
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

      supabase
        .from("pipeline_members")
        .select(
          `
          *,
          user:profiles!pipeline_members_user_id_fkey (id, name, email, avatar_url, role)
        `
        )
        .eq("pipeline_id", selectedPipeline.id),

      supabase
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
