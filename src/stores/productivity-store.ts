"use client"

import { create } from "zustand"
import type {
  ProductivityTask,
  TaskGroup,
  CalendarEvent,
  Note,
  Objective,
  Habit,
  HabitDay,
  TeamMember,
  GoalSummary,
  KanbanColumn,
  WeeklyBar,
} from "@/types/productivity"

// ============================================================================
// Mock Data — Produtividade
// ============================================================================

const MOCK_TASKS: ProductivityTask[] = [
  {
    id: "t1", name: "Revisar proposta Alphaville", status: "progress", priority: 1,
    people: ["MC"], date: "24 Mar", estimatedTime: "45m", time: "09:00", project: "Vendas",
    subtasks: [
      { id: "s1", name: "Ajustar valores Premium", done: true },
      { id: "s2", name: "Incluir case study", done: false },
    ],
  },
  {
    id: "t2", name: "Aprovar layout landing", status: "review", priority: 2,
    people: ["LS"], date: "25 Mar", estimatedTime: "20m", time: "10:30", project: "Projeto X",
    subtasks: [],
  },
  {
    id: "t3", name: "Reuniao alinhamento", status: "pending", priority: 2,
    people: ["MC"], date: "24 Mar", estimatedTime: "60m", time: "14:00", project: "Interno",
    subtasks: [],
  },
  {
    id: "t4", name: "Enviar relatorio", status: "done", priority: 3,
    people: ["MC"], date: "24 Mar", estimatedTime: "15m", time: "-", project: "Admin",
    subtasks: [],
  },
  {
    id: "t5", name: "Feedback Meta Ads", status: "pending", priority: 2,
    people: ["RA"], date: "25 Mar", estimatedTime: "30m", time: "17:00", project: "MKT",
    subtasks: [
      { id: "s4", name: "Analisar CTR", done: false },
      { id: "s5", name: "Benchmark", done: false },
    ],
  },
]

const MOCK_GROUPS: TaskGroup[] = [
  {
    id: "g1", name: "Sprint 12", color: "#4E62D8",
    items: [
      ...MOCK_TASKS.slice(0, 3),
      {
        id: "t6", name: "Documentar API v2", status: "pending", priority: 3,
        people: ["MC"], date: "27 Mar", estimatedTime: "3h", time: "-", project: "Dev",
        subtasks: [],
      },
    ],
  },
  { id: "g2", name: "Concluido", color: "#065F46", items: [MOCK_TASKS[3]] },
]

const MOCK_CALENDAR_EVENTS: CalendarEvent[] = [
  { id: "g1", name: "Reuniao investidor", day: 24, time: "09:00", color: "#4E62D8" },
  { id: "g2", name: "Call equipe design", day: 24, time: "14:00", color: "#065F46" },
  { id: "g3", name: "Review sprint", day: 24, time: "16:30", color: "#92400E" },
]

const MOCK_NOTES: Note[] = [
  { id: "n1", title: "Sprint 12 Planning", preview: "Objetivos: refatorar auth...", date: "Hoje", favorite: true, tags: ["Sprint"], words: 847 },
  { id: "n2", title: "Ata Donaris", preview: "Participantes: MC, LS...", date: "Ontem", favorite: false, tags: ["Ata"], words: 523 },
  { id: "n3", title: "Brief remarketing", preview: "Recuperar 15% carrinhos...", date: "22 Mar", favorite: true, tags: ["Brief"], words: 1204 },
]

const MOCK_OBJECTIVES: Objective[] = [
  {
    id: "o1", title: "Escalar receita R$150k MRR", area: "Receita", progress: 74, status: "on-track",
    keyResults: [
      { title: "200 clientes", current: 168, target: 200, percentage: 84 },
      { title: "Ticket R$750", current: 680, target: 750, percentage: 91 },
      { title: "Churn <3%", current: 4.2, target: 3, percentage: 48 },
    ],
  },
  {
    id: "o2", title: "Lancar produtividade", area: "Produto", progress: 60, status: "on-track",
    keyResults: [
      { title: "Board 3 views", current: 3, target: 3, percentage: 100 },
      { title: "Planning+Foco", current: 1, target: 2, percentage: 50 },
    ],
  },
]

const MOCK_HABITS: Habit[] = [
  { id: "h1", name: "Revisar tarefas", color: "#4E62D8", streak: 12, best: 18, total: 67 },
  { id: "h2", name: "30 min leitura", color: "#065F46", streak: 5, best: 14, total: 43 },
  { id: "h3", name: "Exercicio", color: "#92400E", streak: 3, best: 21, total: 38 },
  { id: "h4", name: "1h foco profundo", color: "#7C3AED", streak: 8, best: 12, total: 52 },
]

const MOCK_HABIT_DAYS: HabitDay[] = [
  { name: "Revisar tarefas", streak: 7, days: [1, 1, 1, 1, 1, 1, 1] },
  { name: "30 min leitura", streak: 5, days: [1, 1, 0, 1, 1, 1, 2] },
  { name: "Exercicio", streak: 3, days: [1, 0, 0, 0, 1, 1, 2] },
  { name: "1h foco", streak: 2, days: [0, 0, 1, 0, 0, 1, 2] },
]

const MOCK_GOALS: GoalSummary[] = [
  { name: "Faturar R$150k MRR", current: "R$112k", percentage: 74, color: "#4E62D8" },
  { name: "200 clientes ativos", current: "168/200", percentage: 84, color: "#065F46" },
  { name: "Lancar automacao", current: "3/5 etapas", percentage: 60, color: "#92400E" },
]

const MOCK_KANBAN_COLUMNS: KanbanColumn[] = [
  {
    title: "Pendentes", color: "#92400E",
    items: [
      { text: "Wireframe preco", meta: "Design — 45m", avatar: "LS" },
      { text: "Pixel Meta", meta: "MKT — 20m", avatar: "RA" },
      { text: "API v2", meta: "Dev — 60m", avatar: "MC" },
    ],
  },
  {
    title: "Em andamento", color: "#4E62D8",
    items: [
      { text: "Refatorar auth", meta: "Dev — 2h", avatar: "MC" },
      { text: "Remarketing", meta: "MKT — 1h", avatar: "RA" },
    ],
  },
  {
    title: "Concluidas", color: "#065F46",
    items: [
      { text: "Relatorio", meta: "Admin", avatar: "MC" },
      { text: "Fix checkout", meta: "Dev", avatar: "MC" },
    ],
  },
]

const MOCK_WEEKLY_BARS: WeeklyBar[] = [
  { label: "Seg", actual: 3, estimated: 4 },
  { label: "Ter", actual: 6, estimated: 5 },
  { label: "Qua", actual: 4, estimated: 5 },
  { label: "Qui", actual: 8, estimated: 6 },
  { label: "Sex", actual: 5, estimated: 5 },
  { label: "Sab", actual: 2, estimated: 1 },
  { label: "Dom", actual: 1, estimated: 0 },
]

const MOCK_TEAM: TeamMember[] = [
  {
    id: "MC", name: "Matheus C.", role: "Tech Lead", capacity: 8,
    dailyHours: [8.5, 5, 4, 3, 1],
    tasks: [
      { name: "Auth", hours: 4, days: [0, 1], color: "#4E62D8" },
      { name: "API", hours: 3, days: [2, 3], color: "#7C3AED" },
    ],
  },
  {
    id: "LS", name: "Lucas S.", role: "Designer", capacity: 8,
    dailyHours: [3, 6, 6, 6, 2],
    tasks: [
      { name: "Wire", hours: 2, days: [0], color: "#4E62D8" },
      { name: "Redesign", hours: 8, days: [1, 2, 3, 4], color: "#7C3AED" },
    ],
  },
  {
    id: "RA", name: "Rafael A.", role: "MKT", capacity: 8,
    dailyHours: [4, 4, 3, 2, 0],
    tasks: [
      { name: "Pixel", hours: 1, days: [0], color: "#92400E" },
      { name: "Remarketing", hours: 6, days: [0, 1, 2], color: "#4E62D8" },
    ],
  },
]

// ============================================================================
// Store
// ============================================================================

interface ProductivityState {
  // Data
  tasks: ProductivityTask[]
  groups: TaskGroup[]
  calendarEvents: CalendarEvent[]
  notes: Note[]
  objectives: Objective[]
  habits: Habit[]
  habitDays: HabitDay[]
  goals: GoalSummary[]
  kanbanColumns: KanbanColumn[]
  weeklyBars: WeeklyBar[]
  team: TeamMember[]

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
  focusSessions: number

  // UI State — Docs
  activeNoteId: string | null
  noteSearch: string

  // UI State — Metas
  expandedObjectiveId: string | null

  // Actions
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
  setActiveNote: (id: string | null) => void
  setNoteSearch: (search: string) => void
  toggleObjective: (id: string) => void
  toggleSubtask: (taskId: string, subtaskId: string) => void
  updateTaskStatus: (taskId: string, status: ProductivityTask["status"]) => void
}

export const useProductivityStore = create<ProductivityState>()((set, get) => ({
  // Data
  tasks: MOCK_TASKS,
  groups: MOCK_GROUPS,
  calendarEvents: MOCK_CALENDAR_EVENTS,
  notes: MOCK_NOTES,
  objectives: MOCK_OBJECTIVES,
  habits: MOCK_HABITS,
  habitDays: MOCK_HABIT_DAYS,
  goals: MOCK_GOALS,
  kanbanColumns: MOCK_KANBAN_COLUMNS,
  weeklyBars: MOCK_WEEKLY_BARS,
  team: MOCK_TEAM,

  // UI State
  boardView: "table",
  selectedTaskId: null,
  expandedTasks: new Set(["t1"]),
  collapsedGroups: new Set(["g2"]),
  hoveredTaskId: null,
  planningDone: false,
  showShutdown: false,
  checkedHabits: new Set(["h1", "h4"]),
  focusRunning: false,
  focusBreak: false,
  focusTime: 1500,
  focusSessions: 3,
  activeNoteId: "n1",
  noteSearch: "",
  expandedObjectiveId: null,

  // Actions
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
  toggleHabitCheck: (id) => set((state) => {
    const next = new Set(state.checkedHabits)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return { checkedHabits: next }
  }),
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
        focusSessions: nextBreak ? state.focusSessions : state.focusSessions + 1,
      })
    }
  },
  setActiveNote: (id) => set({ activeNoteId: id }),
  setNoteSearch: (search) => set({ noteSearch: search }),
  toggleObjective: (id) => set((state) => ({
    expandedObjectiveId: state.expandedObjectiveId === id ? null : id,
  })),
  toggleSubtask: (taskId, subtaskId) => set((state) => {
    const updateTasks = (tasks: ProductivityTask[]) =>
      tasks.map((t) =>
        t.id === taskId
          ? { ...t, subtasks: t.subtasks.map((s) => s.id === subtaskId ? { ...s, done: !s.done } : s) }
          : t
      )
    return {
      tasks: updateTasks(state.tasks),
      groups: state.groups.map((g) => ({ ...g, items: updateTasks(g.items) })),
    }
  }),
  updateTaskStatus: (taskId, status) => set((state) => {
    const updateTasks = (tasks: ProductivityTask[]) =>
      tasks.map((t) => t.id === taskId ? { ...t, status } : t)
    return {
      tasks: updateTasks(state.tasks),
      groups: state.groups.map((g) => ({ ...g, items: updateTasks(g.items) })),
    }
  }),
}))
