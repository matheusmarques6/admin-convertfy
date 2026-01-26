import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { TaskBoardWithCalendar } from "@/components/board/task-board-with-calendar"
import { Skeleton } from "@/components/ui/skeleton"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"

export const dynamic = "force-dynamic"

async function getTasks() {
  const supabase = await createClient()

  const { data: tasks, error } = await supabase
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

  const { data: members } = await supabase
    .from("org_members")
    .select(`
      id,
      role,
      profile:profiles(id, name, email, avatar_url)
    `)
    .eq("is_active", true)
    .order("role", { ascending: true })

  // Transform profile from array to single object (Supabase quirk)
  return (members || []).map(m => ({
    ...m,
    profile: Array.isArray(m.profile) ? m.profile[0] : m.profile
  }))
}

async function getClients() {
  const supabase = await createClient()

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, company")
    .in("status", ["active", "onboarding"])
    .order("name", { ascending: true })

  return clients || []
}

async function getStores() {
  const supabase = await createClient()

  const { data: stores } = await supabase
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

  const { data: meetings } = await supabase
    .from("meetings")
    .select(`
      *,
      client:clients (id, name, company),
      user:profiles!meetings_user_id_fkey (id, name, email, avatar_url)
    `)
    .order("scheduled_at", { ascending: true })

  return (meetings || []).map(m => ({
    ...m,
    client: Array.isArray(m.client) ? m.client[0] : m.client,
    user: Array.isArray(m.user) ? m.user[0] : m.user
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
