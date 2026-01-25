import { Suspense } from "react"
import { Plus } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { TaskBoard } from "@/components/board/task-board"
import { Skeleton } from "@/components/ui/skeleton"

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

  return members || []
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

  return stores || []
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
  const [tasks, members, clients, stores] = await Promise.all([
    getTasks(),
    getTeamMembers(),
    getClients(),
    getStores(),
  ])

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Board</h1>
          <p className="text-muted-foreground">
            Gerencie suas tarefas no estilo Kanban
          </p>
        </div>
        <Button id="add-task-trigger">
          <Plus className="mr-2 h-4 w-4" />
          Nova Tarefa
        </Button>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={<BoardSkeleton />}>
          <TaskBoard
            tasks={tasks}
            members={members}
            clients={clients}
            stores={stores}
          />
        </Suspense>
      </div>
    </div>
  )
}
