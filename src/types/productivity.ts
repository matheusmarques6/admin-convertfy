// ============================================================================
// Tipos do módulo de Produtividade — Convertfy Admin
// ============================================================================

export interface ProductivityTask {
  id: string
  name: string
  status: "pending" | "progress" | "review" | "done"
  priority: 1 | 2 | 3 | 4
  people: string[]
  date: string
  estimatedTime: string
  time: string
  project: string
  subtasks: ProductivitySubtask[]
  // Time tracking persistente (server-side): total acumulado + inicio da
  // sessao corrente quando o timer esta rodando (null = parado).
  time_spent_seconds?: number
  timer_started_at?: string | null
}

export interface ProductivitySubtask {
  id: string
  name: string
  done: boolean
}

export interface TaskGroup {
  id: string
  name: string
  color: string
  items: ProductivityTask[]
}

export interface CalendarEvent {
  id: string
  name: string
  day: number
  time: string
  color: string
}

export interface CalendarTask {
  id: number
  name: string
  day: number
  priority: 1 | 2 | 3 | 4
}

export interface Note {
  id: string
  title: string
  preview: string
  date: string
  favorite: boolean
  tags: string[]
  words: number
}

export interface Objective {
  id: string
  title: string
  area: string
  progress: number
  status: "on-track" | "at-risk"
  keyResults: KeyResult[]
}

export interface KeyResult {
  title: string
  current: number
  target: number
  percentage: number
}

export interface Habit {
  id: string
  name: string
  color: string
  streak: number
  best: number
  total: number
}

export interface HabitDay {
  name: string
  streak: number
  days: number[] // 0=miss, 1=done, 2=today
}

export interface TeamMember {
  id: string
  name: string
  role: string
  capacity: number
  dailyHours: number[]
  tasks: { name: string; hours: number; days: number[]; color: string }[]
}

export interface GoalSummary {
  name: string
  current: string
  percentage: number
  color: string
}

export interface KanbanColumn {
  title: string
  color: string
  items: { text: string; meta: string; avatar: string }[]
}

export interface WeeklyBar {
  label: string
  actual: number
  estimated: number
}

export type TaskStatusConfig = {
  id: ProductivityTask["status"]
  label: string
  color: string
}

export const TASK_STATUSES: TaskStatusConfig[] = [
  { id: "pending", label: "Pendente", color: "#9CA3AF" },
  { id: "progress", label: "Em progresso", color: "#4E62D8" },
  { id: "review", label: "Em revisao", color: "#92400E" },
  { id: "done", label: "Concluido", color: "#065F46" },
]

export const PRIORITY_COLORS: Record<number, string> = {
  1: "#991B1B",
  2: "#92400E",
  3: "#4E62D8",
  4: "#9CA3AF",
}

export const PRIORITY_LABELS: Record<number, string> = {
  1: "Critica",
  2: "Alta",
  3: "Media",
  4: "Baixa",
}
