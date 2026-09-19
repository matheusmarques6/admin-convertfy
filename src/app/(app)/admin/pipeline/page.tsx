import { Kanban } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/server"
import { getSessionUser, getProfileByUserId } from "@/lib/services/admin-auth.service"
import { PageHeader } from "@/components/ui/page-header"
import { PipelineContent } from "@/components/pipeline/pipeline-content"
import { PipelineStoreInitializer } from "@/components/pipeline/pipeline-store-initializer"
import type { PipelineMemberRole } from "@/types"

export const dynamic = "force-dynamic"

async function getPipelineData(searchPipelineId?: string) {
  const adminClient = createAdminClient()

  // user/profile e a lista de pipelines são independentes — uma onda.
  // (getSessionUser/getProfileByUserId dedupam com o layout via React.cache.)
  const [{ user, profile }, { data: pipelines }] = await Promise.all([
    getSessionUser().then(async (user) => ({
      user,
      profile: user ? await getProfileByUserId(user.id) : null,
    })),
    adminClient
      .from("pipelines")
      .select("*")
      .order("created_at", { ascending: true }),
  ])

  const isAdmin = profile?.role === "admin"

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

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const params = await searchParams
  const data = await getPipelineData(params.id)

  return (
    <div className="space-y-5 h-full flex flex-col">
      {/* PageHeader — DS v3.0 Rule 14, no icon-in-circle */}
      <PageHeader
        title="Pipeline"
        description="Gerencie oportunidades e acompanhe o funil de vendas"
        icon={Kanban}
        badge={data.deals.length}
      />

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

      {/* Pipeline Content — view switcher + kanban/list + dialogs */}
      <PipelineContent
        pipelines={data.pipelines}
        currentPipeline={data.pipeline}
        stages={data.stages}
        deals={data.deals}
        members={data.members}
        importRules={data.importRules}
        currentUserRole={data.currentUserRole}
      />
    </div>
  )
}
