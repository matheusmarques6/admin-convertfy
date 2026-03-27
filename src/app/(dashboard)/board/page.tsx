import { Suspense } from "react"
import { createClient, createAdminClient } from "@/lib/supabase/server"
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
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: currentMember } = await adminClient
    .from("org_members")
    .select("id, org_id, role")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single()

  if (!currentMember?.org_id) return null

  return {
    orgId: currentMember.org_id,
    userId: user.id,
    orgMemberId: currentMember.id,
    role: currentMember.role as OrgRole,
  }
}

/**
 * Busca a board_config do membro ou retorna defaults da role.
 * Retorna os source_types permitidos para filtrar tasks.
 */
async function getAllowedSourceTypes(orgMemberId: string, role: OrgRole): Promise<TaskSourceType[]> {
  const adminClient = createAdminClient()

  const { data: config } = await adminClient
    .from("board_config")
    .select("*")
    .eq("org_member_id", orgMemberId)
    .single()

  const effectiveConfig = config ?? getDefaultsForRole(role)

  const allowed: TaskSourceType[] = ["manual"] // manual tasks always show

  const mapping: [string, TaskSourceType][] = [
    ["show_onboarding_tasks", "auto_onboarding"],
    ["show_meeting_tasks", "auto_meeting"],
    ["show_campaign_tasks", "auto_campaign"],
    ["show_feedback_tasks", "auto_feedback"],
    ["show_report_tasks", "auto_report"],
    ["show_contract_tasks", "auto_contract"],
  ]

  for (const [configKey, sourceType] of mapping) {
    if ((effectiveConfig as Record<string, unknown>)[configKey]) {
      allowed.push(sourceType)
    }
  }

  return allowed
}

async function getTasks(orgId: string, allowedSourceTypes: TaskSourceType[], orgMemberId: string) {
  const adminClient = createAdminClient()

  // Fetch tasks that match allowed source types OR are assigned to the current member
  // This ensures the user always sees their own assigned tasks regardless of config
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

async function getTeamMembers() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  // Get current user's org_id
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: currentMember } = await adminClient
    .from("org_members")
    .select("org_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single()

  if (!currentMember?.org_id) return []

  // Fetch all active members of the same org
  const { data: members } = await adminClient
    .from("org_members")
    .select(`
      id,
      role,
      profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
    `)
    .eq("org_id", currentMember.org_id)
    .eq("is_active", true)
    .order("role", { ascending: true })

  // Transform profile from array to single object (Supabase quirk)
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

  // Get org's client IDs first, then filter stores
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

  // Transform client from array to single object (Supabase quirk)
  return (stores || []).map(s => ({
    ...s,
    client: Array.isArray(s.client) ? s.client[0] : s.client
  }))
}

async function getMeetings(orgId: string) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  // Get current user to filter meetings where they are a participant
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id

  // Get org_member_id for the current user (if they are an org member)
  let orgMemberId: string | null = null
  if (userId) {
    const { data: orgMember } = await adminClient
      .from("org_members")
      .select("id")
      .eq("profile_id", userId)
      .eq("is_active", true)
      .single()
    orgMemberId = orgMember?.id || null
  }

  // Get meetings scoped to org
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

  // Filter to include meetings where user is owner OR participant
  const filteredMeetings = (meetings || []).filter(m => {
    // User is owner
    if (m.user_id === userId) return true

    // User is a participant
    const participants = m.participants || []
    return participants.some((p: { participant_id: string; participant_type: string }) => {
      // Direct profile participant
      if (p.participant_type === "profile" && p.participant_id === userId) return true
      // Org member participant
      if (p.participant_type === "org_member" && p.participant_id === orgMemberId) return true
      return false
    })
  })

  // Fetch profiles for participants separately (polymorphic participant_id has no FK)
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
    const { data: oms } = await adminClient.from("org_members").select("id, profile:profiles(id, name, email, avatar_url)").in("id", Array.from(boardOmIds))
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
  }})
}

function BoardSkeleton() {
  return (
    <div className="flex gap-4 h-full">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex-1 min-w-[280px]">
          <Skeleton className="h-10 w-full mb-4" />
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
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
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Acesso negado — organização não encontrada.</p>
      </div>
    )
  }

  const { orgId, orgMemberId, role } = currentUser
  const allowedSourceTypes = await getAllowedSourceTypes(orgMemberId, role)

  const [tasks, members, clients, stores, meetings] = await Promise.all([
    getTasks(orgId, allowedSourceTypes, orgMemberId),
    getTeamMembers(),
    getClients(orgId),
    getStores(orgId),
    getMeetings(orgId),
  ])

  return (
    <PagePermissionWrapper requiredFeatures={["request_control", "request_execute"]}>
      <div className="h-[calc(100vh-8rem)] flex flex-col">
        <Suspense fallback={<BoardSkeleton />}>
          <TaskBoardWithCalendar
            tasks={tasks}
            members={members}
            clients={clients}
            stores={stores}
            meetings={meetings}
          />
        </Suspense>
      </div>
    </PagePermissionWrapper>
  )
}
