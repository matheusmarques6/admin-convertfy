import { Suspense } from "react"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { TaskBoardWithCalendar } from "@/components/board/task-board-with-calendar"
import { Skeleton } from "@/components/ui/skeleton"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"

export const dynamic = "force-dynamic"

async function getTasks() {
  const adminClient = createAdminClient()

  const { data: tasks, error } = await adminClient
    .from("tasks")
    .select(`
      *,
      assignee:org_members(
        id,
        role,
        profile:profiles(id, name, email, avatar_url)
      ),
      creator:profiles!tasks_created_by_fkey(id, name, email, avatar_url),
      client:clients(id, name, company),
      store:client_stores(id, store_name, platform)
    `)
    .in("status", ["pending", "in_progress", "blocked", "review"])
    .order("position", { ascending: true })

  if (error) {
    console.error("Error fetching tasks:", error)
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
      profile:profiles(id, name, email, avatar_url)
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

async function getClients() {
  const adminClient = createAdminClient()

  const { data: clients } = await adminClient
    .from("clients")
    .select("id, name, company")
    .in("status", ["active", "onboarding"])
    .order("name", { ascending: true })

  return clients || []
}

async function getStores() {
  const adminClient = createAdminClient()

  const { data: stores } = await adminClient
    .from("client_stores")
    .select(`
      id,
      store_name,
      platform,
      client:clients(id, name)
    `)
    .eq("is_active", true)
    .order("store_name", { ascending: true })

  // Transform client from array to single object (Supabase quirk)
  return (stores || []).map(s => ({
    ...s,
    client: Array.isArray(s.client) ? s.client[0] : s.client
  }))
}

async function getMeetings() {
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

  // First, get meetings the user owns or is a participant of
  const { data: meetings } = await adminClient
    .from("meetings")
    .select(`
      *,
      client:clients (id, name, company),
      user:profiles!meetings_user_id_fkey (id, name, email, avatar_url),
      participants:meeting_participants(
        id,
        participant_id,
        participant_type,
        is_organizer,
        response_status,
        profile:profiles(id, name, email, avatar_url)
      )
    `)
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

  return filteredMeetings.map(m => ({
    ...m,
    client: Array.isArray(m.client) ? m.client[0] : m.client,
    user: Array.isArray(m.user) ? m.user[0] : m.user,
    participants: (m.participants || []).map((p: Record<string, unknown>) => ({
      ...p,
      profile: Array.isArray(p.profile) ? p.profile[0] : p.profile,
    })),
  }))
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
  const [tasks, members, clients, stores, meetings] = await Promise.all([
    getTasks(),
    getTeamMembers(),
    getClients(),
    getStores(),
    getMeetings(),
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
