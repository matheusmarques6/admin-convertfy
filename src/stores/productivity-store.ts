"use client"

import { create } from "zustand"
import type {
  ProductivityTask,
  TaskGroup,
  GoalSummary,
  KanbanColumn,
  WeeklyBar,
} from "@/types/productivity"

// ============================================================================
// Types for API response
// ============================================================================

interface CalendarEventAPI {
  id: string
  name: string
  time: string
  duration?: number
  color: string
}

interface HabitAPI {
  id: string
  name: string
  color: string
  streak: number
  days: number[] // 0=miss, 1=done, 2=today-pending
  best_streak?: number
  total_completed?: number
}

interface DailyPlan {
  objectives?: string[]
  mood?: string
  tasks_planned?: string[]
  shutdown_at?: string
  tomorrow_priorities?: string
}

interface FocusSessionsData {
  count: number
  totalMinutes: number
}

interface ProfileData {
  name: string
  avatar_url: string | null
}

// ============================================================================
// Store
// ============================================================================

interface OrgMember {
  id: string
  name: string
  avatar_url: string | null
  initials: string
}

interface TaskComment {
  id: string
  task_id: string
  text: string
  user_name: string
  user_initials: string
  created_at: string
}

interface ProductivityState {
  // Data (loaded from API)
  tasks: ProductivityTask[]
  groups: TaskGroup[]
  calendarEvents: CalendarEventAPI[]
  goals: GoalSummary[]
  habits: HabitAPI[]
  kanbanColumns: KanbanColumn[]
  weeklyBars: WeeklyBar[]
  dailyPlan: DailyPlan | null
  focusSessions: FocusSessionsData
  profile: ProfileData
  members: OrgMember[]
  comments: TaskComment[]

  // Loading state
  isLoading: boolean
  isLoaded: boolean
  error: string | null

  // UI State — Board
  boardView: "table" | "kanban"
  selectedTaskId: string | null
  expandedTasks: Set<string>
  collapsedGroups: Set<string>
  hoveredTaskId: string | null

  // UI State — Início
  planningDone: boolean
  showShutdown: boolean
  checkedHabits: Set<string>

  // UI State — Focus Timer
  focusRunning: boolean
  focusBreak: boolean
  focusTime: number
  focusSessionCount: number

  // Actions — Data
  fetchData: () => Promise<void>
  apiAction: (action: string, data?: Record<string, unknown>) => Promise<boolean>

  // Actions — UI
  setBoardView: (view: "table" | "kanban") => void
  selectTask: (id: string | null) => void
  toggleTaskExpand: (id: string) => void
  toggleGroupCollapse: (id: string) => void
  setHoveredTask: (id: string | null) => void
  setPlanningDone: (done: boolean) => void
  setShowShutdown: (show: boolean) => void
  toggleHabitCheck: (id: string) => void
  toggleFocus: () => void
  resetFocus: () => void
  tickFocus: () => void
  toggleSubtask: (taskId: string, subtaskId: string) => void
  updateTaskStatus: (taskId: string, status: ProductivityTask["status"]) => void
}

// ============================================================================
// Helpers to map API data → store format
// ============================================================================

function mapTasksToKanban(tasks: ProductivityTask[]): KanbanColumn[] {
  const columns: Record<string, KanbanColumn> = {
    pending: { title: "Pendentes", color: "#92400E", items: [] },
    progress: { title: "Em andamento", color: "#4E62D8", items: [] },
    done: { title: "Concluidas", color: "#065F46", items: [] },
  }

  for (const t of tasks) {
    const col = t.status === "done" ? "done" : t.status === "progress" || t.status === "review" ? "progress" : "pending"
    columns[col].items.push({
      text: t.name,
      meta: `${t.project}${t.estimatedTime ? ` — ${t.estimatedTime}` : ""}`,
      avatar: t.people[0] || "?",
    })
  }

  return Object.values(columns)
}

function mapGoals(goals: Array<Record<string, unknown>>): GoalSummary[] {
  return (goals || []).map((g) => ({
    name: String(g.title || g.name || ""),
    current: String(g.current_value || "0"),
    percentage: Number(g.progress || 0),
    color: String(g.color || "#4E62D8"),
  }))
}

// ============================================================================
// Store implementation
// ============================================================================

export const useProductivityStore = create<ProductivityState>()((set, get) => ({
  // Data
  tasks: [],
  groups: [],
  calendarEvents: [],
  goals: [],
  habits: [],
  kanbanColumns: [],
  weeklyBars: [],
  dailyPlan: null,
  focusSessions: { count: 0, totalMinutes: 0 },
  profile: { name: "Usuario", avatar_url: null },
  members: [],
  comments: [],

  // Loading
  isLoading: false,
  isLoaded: false,
  error: null,

  // UI State
  boardView: "table",
  selectedTaskId: null,
  expandedTasks: new Set<string>(),
  collapsedGroups: new Set<string>(),
  hoveredTaskId: null,
  planningDone: false,
  showShutdown: false,
  checkedHabits: new Set<string>(),
  focusRunning: false,
  focusBreak: false,
  focusTime: 1500, // 25 min
  focusSessionCount: 0,

  // ── Fetch data from API ──
  fetchData: async () => {
    if (get().isLoading) return
    set({ isLoading: true, error: null })

    try {
      const res = await fetch("/api/productivity")
      if (!res.ok) throw new Error(`API error: ${res.status}`)

      const json = await res.json()
      const data = json.data || json

      // Map API groups to store format. Spread primeiro pra preservar
      // campos extras (source_type, stage_name, stage_color, plan,
      // mrr_value, client_name) que o GET injeta pra grupos de onboarding.
      const groups: TaskGroup[] = (data.groups || []).map((g: Record<string, unknown>) => ({
        ...(g as object),
        id: String(g.id),
        name: String(g.name),
        color: String(g.color || "#4E62D8"),
        items: ((g.items || []) as Array<Record<string, unknown>>).map(mapApiTask),
      }) as TaskGroup)

      const allTasks = groups.flatMap((g) => g.items)

      // Map habits — check which are completed today
      const habits: HabitAPI[] = (data.habits || []).map((h: Record<string, unknown>) => ({
        id: String(h.id),
        name: String(h.name),
        color: String(h.color || "#4E62D8"),
        streak: Number(h.streak || 0),
        days: (h.days as number[]) || [0, 0, 0, 0, 0, 0, 2],
      }))

      const checkedHabits = new Set(
        habits.filter((h) => h.days[h.days.length - 1] === 1).map((h) => h.id)
      )

      // Check if daily planning is done
      const dailyPlan = data.dailyPlan || null
      const planningDone = !!(dailyPlan?.objectives?.length)

      set({
        tasks: allTasks,
        groups,
        calendarEvents: data.calendarEvents || [],
        goals: mapGoals(data.goals),
        habits,
        kanbanColumns: mapTasksToKanban(allTasks),
        weeklyBars: data.weeklyBars || [],
        dailyPlan,
        focusSessions: data.focusSessions || { count: 0, totalMinutes: 0 },
        profile: data.profile || { name: "Usuario", avatar_url: null },
        members: data.members || [],
        comments: data.comments || [],
        planningDone,
        checkedHabits,
        isLoading: false,
        isLoaded: true,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar dados"
      console.error("[ProductivityStore] fetchData error:", msg)
      set({ isLoading: false, error: msg })
    }
  },

  // ── Generic API action ──
  apiAction: async (action: string, data?: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/productivity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...data }),
      })
      if (!res.ok) return false
      // Refresh data after mutation
      get().fetchData()
      return true
    } catch {
      return false
    }
  },

  // ── UI Actions ──
  setBoardView: (view) => set({ boardView: view }),
  selectTask: (id) => set({ selectedTaskId: id }),
  toggleTaskExpand: (id) => set((state) => {
    const next = new Set(state.expandedTasks)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return { expandedTasks: next }
  }),
  toggleGroupCollapse: (id) => set((state) => {
    const next = new Set(state.collapsedGroups)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return { collapsedGroups: next }
  }),
  setHoveredTask: (id) => set({ hoveredTaskId: id }),
  setPlanningDone: (done) => set({ planningDone: done }),
  setShowShutdown: (show) => set({ showShutdown: show }),

  toggleHabitCheck: (id) => {
    const state = get()
    const next = new Set(state.checkedHabits)
    if (next.has(id)) {
      next.delete(id)
      state.apiAction("uncomplete_habit", { habit_id: id })
    } else {
      next.add(id)
      state.apiAction("complete_habit", { habit_id: id })
    }
    set({ checkedHabits: next })
  },

  toggleFocus: () => set((state) => ({ focusRunning: !state.focusRunning })),
  resetFocus: () => set({ focusRunning: false, focusTime: 1500 }),
  tickFocus: () => {
    const state = get()
    if (state.focusTime > 0) {
      set({ focusTime: state.focusTime - 1 })
    } else {
      const nextBreak = !state.focusBreak
      set({
        focusRunning: false,
        focusBreak: nextBreak,
        focusTime: nextBreak ? 300 : 1500,
        focusSessionCount: nextBreak ? state.focusSessionCount : state.focusSessionCount + 1,
      })
    }
  },

  toggleSubtask: (taskId, subtaskId) => {
    const state = get()
    const task = state.tasks.find((t) => t.id === taskId)
    const sub = task?.subtasks.find((s) => s.id === subtaskId)
    if (sub) {
      state.apiAction("toggle_subtask", { id: subtaskId, done: !sub.done })
    }

    // Optimistic update
    const updateTasks = (tasks: ProductivityTask[]) =>
      tasks.map((t) =>
        t.id === taskId
          ? { ...t, subtasks: t.subtasks.map((s) => s.id === subtaskId ? { ...s, done: !s.done } : s) }
          : t
      )
    set({
      tasks: updateTasks(state.tasks),
      groups: state.groups.map((g) => ({ ...g, items: updateTasks(g.items) })),
    })
  },

  updateTaskStatus: (taskId, status) => {
    const state = get()
    state.apiAction("update_task", { id: taskId, status })

    // Optimistic update
    const updateTasks = (tasks: ProductivityTask[]) =>
      tasks.map((t) => t.id === taskId ? { ...t, status } : t)
    const updatedTasks = updateTasks(state.tasks)
    set({
      tasks: updatedTasks,
      groups: state.groups.map((g) => ({ ...g, items: updateTasks(g.items) })),
      kanbanColumns: mapTasksToKanban(updatedTasks),
    })
  },
}))

// ── Helper to map API task response to ProductivityTask ──

function mapApiTask(t: Record<string, unknown>): ProductivityTask {
  // Spread primeiro pra preservar campos extras (description, source_type,
  // onboarding_id, metadata, deliverables, checklist, task_comments,
  // attachments, links, assignee_role) — depois sobrescreve com os
  // campos canonicos do tipo ProductivityTask.
  return {
    ...(t as object),
    id: String(t.id),
    name: String(t.name || t.title || ""),
    status: (t.status as ProductivityTask["status"]) || "pending",
    priority: (Number(t.priority) || 4) as 1 | 2 | 3 | 4,
    people: (t.assigned_to as string[]) || (t.people as string[]) || [],
    date: t.due_date ? new Date(String(t.due_date)).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—",
    estimatedTime: t.estimated_minutes ? `${t.estimated_minutes}m` : (t.estimatedTime as string) || "",
    time: (t.scheduled_time as string) || "—",
    project: String(t.project || t.group_name || ""),
    subtasks: ((t.subtasks || []) as Array<Record<string, unknown>>).map((s) => ({
      id: String(s.id),
      name: String(s.name || s.title || ""),
      done: Boolean(s.done),
    })),
  } as ProductivityTask
}
