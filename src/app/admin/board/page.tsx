import { Suspense } from "react"
import { ClipboardList } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/server"
import { getSessionUser, getActiveOrgMember } from "@/lib/services/admin-auth.service"
import { PageHeader } from "@/components/ui/page-header"
import { TaskBoardWithCalendar } from "@/components/board/task-board-with-calendar"
import { Skeleton } from "@/components/ui/skeleton"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
import { KANBAN_FETCH_STATUSES } from "@/lib/constants/board"
import { logger } from "@/lib/logger"
import { getDefaultsForRole } from "@/lib/services/board-config-defaults"
import type { OrgRole, TaskSourceType } from "@/types"

const log = logger.child("BoardPage")

export const dynamic = "force-dynamic"

interface ResolvedUser {
  orgId: string
  userId: string
  orgMemberId: string
  role: OrgRole
}

async function resolveCurrentUser(): Promise<ResolvedUser | null> {
  const user = await getSessionUser()
  if (!user) return null

  const currentMember = await getActiveOrgMember(user.id)

  if (!currentMember?.org_id) return null

  return {
    orgId: currentMember.org_id,
    userId: user.id,
    orgMemberId: currentMember.id,
    role: currentMember.role as OrgRole,
  }
}

async function getAllowedSourceTypes(orgMemberId: string, role: OrgRole): Promise<TaskSourceType[]> {
  const adminClient = createAdminClient()

  const { data: config } = await adminClient
    .from("board_config")
    .select("*")
    .eq("org_member_id", orgMemberId)
    .single()

  const effectiveConfig = config ?? getDefaultsForRole(role)

  const allowed: TaskSourceType[] = ["manual"]

  const mapping: [string, TaskSourceType | TaskSourceType[]][] = [
    ["show_onboarding_tasks", ["auto_onboarding", "auto_onboarding_step"]],
    ["show_meeting_tasks", "auto_meeting"],
    ["show_campaign_tasks", "auto_campaign"],
    ["show_feedback_tasks", "auto_feedback"],
    ["show_report_tasks", "auto_report"],
    ["show_contract_tasks", "auto_contract"],
  ]

  for (const [configKey, sourceType] of mapping) {
    if ((effectiveConfig as Record<string, unknown>)[configKey]) {
      if (Array.isArray(sourceType)) {
        allowed.push(...sourceType)
      } else {
        allowed.push(sourceType)
      }
    }
  }

  return allowed
}

async function getTasks(orgId: string, allowedSourceTypes: TaskSourceType[], orgMemberId: string) {
  const adminClient = createAdminClient()

  const { data: tasks, error } = await adminClient
    .from("tasks")
    .select(`
      *,
      assignee:org_members(
        id,
        role,
        profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
      ),
      creator:profiles!tasks_created_by_fkey(id, name, email, avatar_url),
      client:clients(id, name, company),
      store:client_stores(id, store_name, platform)
    `)
    .eq("org_id", orgId)
    .in("status", KANBAN_FETCH_STATUSES)
    .or(`source_type.in.(${allowedSourceTypes.join(",")}),assignee_id.eq.${orgMemberId}`)
    .order("position", { ascending: true })

  if (error) {
    log.error("Error fetching tasks:", error)
    return []
  }

  return tasks || []
}

async function getTeamMembers(orgId: string) {
  const adminClient = createAdminClient()

  const { data: members } = await adminClient
    .from("org_members")
    .select(`
      id,
      role,
      profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
    `)
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("role", { ascending: true })

  return (members || []).map(m => ({
    ...m,
    profile: Array.isArray(m.profile) ? m.profile[0] : m.profile
  }))
}

async function getClients(orgId: string) {
  const adminClient = createAdminClient()

  const { data: clients } = await adminClient
    .from("clients")
    .select("id, name, company, client_stores(id, store_name)")
    .eq("org_id", orgId)
    .in("status", ["active", "onboarding"])
    .order("name", { ascending: true })

  return (clients || []).map((c) => ({
    id: c.id,
    name: c.name,
    company: c.company,
    stores: (Array.isArray(c.client_stores) ? c.client_stores : [])
      .map((s: { id: string; store_name: string }) => s.store_name)
      .filter(Boolean),
  }))
}

async function getStores(orgId: string) {
  const adminClient = createAdminClient()

  const { data: orgClients } = await adminClient
    .from("clients")
    .select("id")
    .eq("org_id", orgId)

  const orgClientIds = orgClients?.map(c => c.id) || []
  if (orgClientIds.length === 0) return []

  const { data: stores } = await adminClient
    .from("client_stores")
    .select(`
      id,
      store_name,
      platform,
      client:clients(id, name)
    `)
    .in("client_id", orgClientIds)
    .eq("is_active", true)
    .order("store_name", { ascending: true })

  return (stores || []).map(s => ({
    ...s,
    client: Array.isArray(s.client) ? s.client[0] : s.client
  }))
}

async function getMeetings(orgId: string, userId: string, orgMemberId: string) {
  const adminClient = createAdminClient()

  const { data: meetings } = await adminClient
    .from("meetings")
    .select(`
      *,
      client:clients (id, name, company, client_stores(id, store_name)),
      user:profiles!meetings_user_id_fkey (id, name, email, avatar_url),
      participants:meeting_participants(
        id,
        participant_id,
        participant_type,
        is_organizer,
        response_status
      )
    `)
    .eq("org_id", orgId)
    .order("scheduled_at", { ascending: true })

  const filteredMeetings = (meetings || []).filter(m => {
    if (m.user_id === userId) return true
    const participants = m.participants || []
    return participants.some((p: { participant_id: string; participant_type: string }) => {
      if (p.participant_type === "profile" && p.participant_id === userId) return true
      if (p.participant_type === "org_member" && p.participant_id === orgMemberId) return true
      return false
    })
  })

  const boardProfIds = new Set<string>()
  const boardOmIds = new Set<string>()
  filteredMeetings.forEach(m => {
    ;(m.participants || []).forEach((p: { participant_type: string; participant_id: string }) => {
      if (p.participant_type === "profile" && p.participant_id) boardProfIds.add(p.participant_id)
      else if (p.participant_type === "org_member" && p.participant_id) boardOmIds.add(p.participant_id)
    })
  })

  const boardProfilesMap = new Map<string, Record<string, unknown>>()
  if (boardProfIds.size > 0) {
    const { data: profs } = await adminClient.from("profiles").select("id, name, email, avatar_url").in("id", Array.from(boardProfIds))
    ;(profs || []).forEach(p => boardProfilesMap.set(p.id, p))
  }
  if (boardOmIds.size > 0) {
    const { data: oms } = await adminClient.from("org_members").select("id, profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)").in("id", Array.from(boardOmIds))
    ;(oms || []).forEach(om => {
      const prof = Array.isArray(om.profile) ? om.profile[0] : om.profile
      if (prof) boardProfilesMap.set(om.id, prof as Record<string, unknown>)
    })
  }

  return filteredMeetings.map(m => {
    const clientRaw = Array.isArray(m.client) ? m.client[0] : m.client
    return {
      ...m,
      client: clientRaw ? {
        id: clientRaw.id,
        name: clientRaw.name,
        company: clientRaw.company,
        stores: (Array.isArray(clientRaw.client_stores) ? clientRaw.client_stores : [])
          .map((s: { store_name: string }) => s.store_name)
          .filter(Boolean),
      } : null,
      user: Array.isArray(m.user) ? m.user[0] : m.user,
      participants: (m.participants || []).map((p: Record<string, unknown>) => ({
        ...p,
        profile: boardProfilesMap.get(p.participant_id as string) || null,
      })),
    }
  })
}

function BoardSkeleton() {
  return (
    <div className="flex gap-3 h-full overflow-x-auto">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex-1 min-w-[280px]">
          <Skeleton className="h-10 w-full mb-3 rounded-[8px]" />
          <div className="space-y-2">
            <Skeleton className="h-28 w-full rounded-[8px]" />
            <Skeleton className="h-28 w-full rounded-[8px]" />
            <Skeleton className="h-28 w-full rounded-[8px]" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default async function BoardPage() {
  const currentUser = await resolveCurrentUser()
  if (!currentUser) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-gray-500 dark:text-[#8B92A5]">
          Acesso negado — organização não encontrada.
        </p>
      </div>
    )
  }

  const { orgId, orgMemberId, role, userId } = currentUser

  // getAllowedSourceTypes→getTasks é a única cadeia real; encadeada dentro
  // do Promise.all para não bloquear os outros 4 fetchers.
  const [tasks, members, clients, stores, meetings] = await Promise.all([
    getAllowedSourceTypes(orgMemberId, role).then((allowed) =>
      getTasks(orgId, allowed, orgMemberId)
    ),
    getTeamMembers(orgId),
    getClients(orgId),
    getStores(orgId),
    getMeetings(orgId, userId, orgMemberId),
  ])

  return (
    <PagePermissionWrapper requiredFeatures={["request_control", "request_execute"]}>
      <div className="h-[calc(100dvh-10rem)] sm:h-[calc(100dvh-8rem)] flex flex-col space-y-4">
        {/* PageHeader — DS v3.0 Rule 14, no icon-in-circle */}
        <PageHeader
          title="Board"
          description="Gerencie tarefas e acompanhe o progresso da equipe"
          icon={ClipboardList}
          badge={tasks.length}
        />

        <Suspense fallback={<BoardSkeleton />}>
          <TaskBoardWithCalendar
            tasks={tasks}
            members={members}
            clients={clients}
            stores={stores}
            meetings={meetings}
            orgMemberId={orgMemberId}
          />
        </Suspense>
      </div>
    </PagePermissionWrapper>
  )
}
