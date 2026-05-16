"use client"

/**
 * ProductivityHome — Dashboard de Início (Modo Caverna pra empresa).
 *
 * Layout reformulado seguindo o prototipo do Bruno:
 *  - PageHeader: workspace + titulo + stats inline + DayFilter rich
 *  - MorningRitualCard: gradient banner com saudacao + iniciar ritual
 *  - ObjectivesCard + CalendarCard: 2 colunas
 *  - TodayTasksCard: tabela de tarefas do dia
 *  - ProjectsOverview: onboardings ativos do store
 *  - FocusModeCard + WeekChart: 2 colunas
 *  - GoalsCard + HabitsCard: 2 colunas (com modais ricos)
 *  - ClosingRitualCard: checklist colapsavel
 *
 * Toda informacao vem do store (que puxa /api/productivity). ZERO mock.
 */

import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { useProductivityStore } from "@/stores/productivity-store"
import { DailyPlanning } from "./daily-planning"
import { NightlyReflection } from "./nightly-reflection"
import {
  PriorityDot, Avatar, Checkbox,
  IconCheck, IconCalendar, IconChevronLeft, IconChevronRight,
  IconChart, IconTarget, IconFire,
  IconFlag, IconSun, IconMoon, IconPlay, IconPause, IconRefresh,
  IconPlus, IconClose,
} from "./ds-atoms"

// ── Tokens ───────────────────────────────────────────────────────────────────
const BRAND = "#2137B6"
const BRAND_LIGHT = "#4E62D8"
const BRAND_50 = "#EEF0FB"

const mono = "font-mono tabular-nums"

// ── ProductivityHome ────────────────────────────────────────────────────────

export function ProductivityHome() {
  const {
    tasks, calendarEvents, planningDone, setPlanningDone,
    showShutdown, setShowShutdown, goals, habits,
    weeklyBars, groups,
    focusRunning, focusTime, toggleFocus, resetFocus, tickFocus,
    isLoaded, fetchData, profile, apiAction,
    dailyPlan,
  } = useProductivityStore()

  const [showDailyPlanning, setShowDailyPlanning] = useState(false)
  const [habitModalOpen, setHabitModalOpen] = useState(false)
  const [goalModalOpen, setGoalModalOpen] = useState(false)

  // Day filter (Ontem/Hoje/Amanha) — UI-only por enquanto, filtra tasks locais
  const [day, setDay] = useState<"Ontem" | "Hoje" | "Amanhã">("Hoje")

  // Load data on mount
  useEffect(() => {
    if (!isLoaded) fetchData()
  }, [isLoaded, fetchData])

  // Focus timer tick
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (focusRunning && focusTime > 0) {
      timerRef.current = setInterval(tickFocus, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [focusRunning, focusTime, tickFocus])

  // Derivados
  const fm = Math.floor(focusTime / 60)
  const fs = focusTime % 60
  const pendingCount = tasks.filter((t) => t.status !== "done").length
  const plannedMinutes = tasks.filter(t => t.status !== "done").reduce((sum, t) => {
    const m = parseInt(t.estimatedTime) || 0
    return sum + m
  }, 0)
  const plannedHours = Math.round(plannedMinutes / 60 * 10) / 10
  const maxBar = Math.max(1, ...weeklyBars.map((b) => Math.max(b.actual, b.estimated)))

  // Objetivos do plano diario
  const dayObjectives = ((dailyPlan?.objectives || []) as string[])
    .filter(Boolean)
    .map((text, i) => ({ id: i, text, done: false, mit: true }))

  // Greeting + data
  const hour = new Date().getHours()
  const greeting = hour < 6 ? "Boa madrugada" :
                   hour < 12 ? "Bom dia" :
                   hour < 18 ? "Boa tarde" :
                   "Boa noite"
  const userName = profile.name?.split(" ")[0] || "Usuário"
  const dateStr = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  })

  // Onboardings ativos — projetos vindos do GET productivity como groups
  const onboardingProjects = groups.filter((g) => {
    const gAny = g as unknown as { source_type?: string }
    return gAny.source_type === "onboarding"
  })

  return (
    <>
    <div className="max-w-[1500px] mx-auto flex flex-col gap-4 md:gap-6 w-full pb-8">

        {/* ═══════════ PAGE HEADER: Workspace + Título + Stats + DayFilter ═══════════ */}
        <PageHeader
          dayLabel={day}
          onDayChange={setDay}
          pendingTasks={pendingCount}
          totalProjects={onboardingProjects.length}
          mits={{
            done: dayObjectives.filter(o => o.done).length,
            total: dayObjectives.length || 3,
          }}
          plannedHours={plannedHours}
        />

        {/* ═══════════ MORNING RITUAL CARD ═══════════ */}
        {!planningDone && (
          <MorningRitualCard
            greeting={greeting}
            userName={userName}
            date={dateStr}
            onSkip={() => setPlanningDone(true)}
            onStart={() => setShowDailyPlanning(true)}
          />
        )}

        {/* ═══════════ VISÃO DO DIA: Objetivos + Calendário ═══════════ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-[18px]">
          <ObjectivesCard
            objectives={dayObjectives}
            onAddObjective={() => setShowDailyPlanning(true)}
          />
          <CalendarCard events={calendarEvents} />
        </div>

        {/* ═══════════ TAREFAS DO DIA ═══════════ */}
        <TodayTasksCard
          tasks={tasks}
          onToggle={(id) => {
            const t = tasks.find(x => x.id === id)
            if (!t) return
            apiAction("update_task", { id, status: t.status === "done" ? "pending" : "done" })
          }}
          onDelete={(id, name) => {
            if (window.confirm(`Excluir a tarefa "${name}"?`)) {
              apiAction("delete_task", { id })
            }
          }}
        />

        {/* ═══════════ PROJETOS ATIVOS (overview) ═══════════ */}
        {onboardingProjects.length > 0 && (
          <ProjectsOverview projects={onboardingProjects} />
        )}

        {/* ═══════════ PRODUTIVIDADE: Foco + Gráfico semanal ═══════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4 lg:gap-[18px]">
          <FocusModeCard
            currentTask={
              tasks.find((t) => t.status === "progress") ||
              tasks.find((t) => t.status !== "done")
            }
            running={focusRunning}
            minutes={fm}
            seconds={fs}
            onToggle={toggleFocus}
            onReset={resetFocus}
          />
          <WeekChart
            tasks={tasks}
            weeklyBars={weeklyBars}
            maxBar={maxBar}
          />
        </div>

        {/* ═══════════ CRESCIMENTO: Metas + Hábitos ═══════════ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-[18px]">
          <GoalsCard
            goals={goals}
            onAddGoal={() => setGoalModalOpen(true)}
          />
          <HabitsCard
            habits={habits}
            onAddHabit={() => setHabitModalOpen(true)}
          />
        </div>

        {/* ═══════════ RITUAL DE ENCERRAMENTO ═══════════ */}
        <ClosingRitualCard
          tasks={tasks}
          onReflect={() => setShowShutdown(true)}
        />

      </div>

      {/* Modais */}
      <DailyPlanning open={showDailyPlanning} onClose={() => setShowDailyPlanning(false)} />
      <NightlyReflection open={showShutdown} onClose={() => setShowShutdown(false)} />
      <HabitModal
        open={habitModalOpen}
        onClose={() => setHabitModalOpen(false)}
        onSave={async (data) => {
          await apiAction("create_habit", {
            name: data.title,
            frequency: data.frequency,
            reminder_at: data.reminder,
            note: data.note,
          })
          setHabitModalOpen(false)
        }}
      />
      <GoalModal
        open={goalModalOpen}
        onClose={() => setGoalModalOpen(false)}
        onSave={async (data) => {
          await apiAction("create_goal", {
            title: data.label,
            target: data.target,
            current: data.current,
            unit: data.unit,
            quarter: data.quarter,
          })
          setGoalModalOpen(false)
        }}
      />
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// PageHeader — Workspace + Título + Stats inline + DayFilter
// ════════════════════════════════════════════════════════════════════════════

function PageHeader({
  dayLabel, onDayChange, pendingTasks, totalProjects, mits, plannedHours,
}: {
  dayLabel: "Ontem" | "Hoje" | "Amanhã"
  onDayChange: (d: "Ontem" | "Hoje" | "Amanhã") => void
  pendingTasks: number
  totalProjects: number
  mits: { done: number; total: number }
  plannedHours: number
}) {
  const stats = [
    {
      label: "MITs do dia",
      value: `${mits.done}/${mits.total}`,
      sub: mits.done === mits.total && mits.total > 0 ? "todos prontos" : "em andamento",
    },
    {
      label: "Tarefas hoje",
      value: String(pendingTasks),
      sub: "pendentes",
    },
    {
      label: "Projetos ativos",
      value: String(totalProjects),
      sub: "em onboarding",
    },
    {
      label: "Carga prevista",
      value: `${plannedHours}h`,
      sub: "/ 8h hoje",
    },
  ]

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 sm:gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-gray-500 mb-1 tracking-[0.01em]">
            Workspace · Geral
          </div>
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <h1 className="text-[20px] md:text-[24px] font-bold text-gray-900 m-0 -tracking-[0.025em] leading-tight">
              Início
            </h1>
            <span className={cn("text-[12px] md:text-[13px] font-medium text-gray-500 px-2 py-0.5 rounded-md bg-gray-100", mono)}>
              {pendingTasks} tarefas hoje
            </span>
          </div>
        </div>
        <DayFilter dayLabel={dayLabel} onDayChange={onDayChange} />
      </div>

      {/* Stats inline bar — grid responsivo (2 cols mobile, 4 desktop) */}
      <div
        className="bg-white border rounded-xl grid grid-cols-2 md:grid-cols-4 shadow-sm overflow-hidden divide-x divide-y md:divide-y-0"
        style={{
          borderColor: "rgba(0,0,0,0.06)",
        }}
      >
        {stats.map((s) => (
          <div
            key={s.label}
            className="py-3 md:py-4 px-3 md:px-5"
            style={{
              borderColor: "rgba(0,0,0,0.06)",
            }}
          >
            <div className="text-[9.5px] md:text-[10px] font-semibold text-gray-500 uppercase tracking-[0.08em] mb-1 md:mb-1.5">
              {s.label}
            </div>
            <div className={cn("text-[18px] md:text-[22px] font-bold text-gray-900 -tracking-[0.025em] leading-none mb-1", mono)}>
              {s.value}
            </div>
            <div className="text-[10.5px] md:text-[11px] text-gray-500">{s.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── DayFilter (Ontem/Hoje/Amanha com data + chevrons) ───────────────────────

function DayFilter({
  dayLabel, onDayChange,
}: {
  dayLabel: "Ontem" | "Hoje" | "Amanhã"
  onDayChange: (d: "Ontem" | "Hoje" | "Amanhã") => void
}) {
  const today = new Date()
  const fmt = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, "0")
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    return `${dd}/${mm}`
  }
  const dayMap: Record<string, Date> = {
    Ontem: new Date(today.getTime() - 86400000),
    Hoje: today,
    Amanhã: new Date(today.getTime() + 86400000),
  }
  const handlePrev = () => {
    if (dayLabel === "Amanhã") onDayChange("Hoje")
    else if (dayLabel === "Hoje") onDayChange("Ontem")
  }
  const handleNext = () => {
    if (dayLabel === "Ontem") onDayChange("Hoje")
    else if (dayLabel === "Hoje") onDayChange("Amanhã")
  }
  return (
    <div
      className="flex items-center gap-1.5 p-1 bg-white border rounded-[10px]"
      style={{ borderColor: "rgba(0,0,0,0.06)" }}
    >
      <button
        onClick={handlePrev}
        disabled={dayLabel === "Ontem"}
        className={cn(
          "p-1.5 rounded-md flex transition-colors",
          dayLabel === "Ontem"
            ? "text-gray-300 cursor-default"
            : "text-gray-600 hover:bg-gray-50",
        )}
      >
        <IconChevronLeft size={13} />
      </button>
      <div className="flex gap-0.5">
        {(["Ontem", "Hoje", "Amanhã"] as const).map((d) => {
          const isActive = dayLabel === d
          const dateLabel = fmt(dayMap[d])
          return (
            <button
              key={d}
              onClick={() => onDayChange(d)}
              className={cn(
                "px-3 py-1.5 rounded-md border-none cursor-pointer transition-colors flex flex-col items-center min-w-[56px]",
                isActive ? "bg-brand-50 text-brand-600" : "bg-transparent text-gray-700 hover:bg-gray-50",
              )}
            >
              <span className={cn("text-[11.5px] leading-tight", isActive ? "font-bold" : "font-medium")}>
                {d}
              </span>
              <span
                className={cn(
                  "text-[9px] font-medium mt-0.5 leading-none",
                  mono,
                  isActive ? "text-brand-600" : "text-gray-400",
                )}
              >
                {dateLabel}
              </span>
            </button>
          )
        })}
      </div>
      <button
        onClick={handleNext}
        disabled={dayLabel === "Amanhã"}
        className={cn(
          "p-1.5 rounded-md flex transition-colors",
          dayLabel === "Amanhã"
            ? "text-gray-300 cursor-default"
            : "text-gray-600 hover:bg-gray-50",
        )}
      >
        <IconChevronRight size={13} />
      </button>
      <div className="w-px h-[22px] bg-black/[0.06] mx-0.5" />
      <button
        className="p-1.5 rounded-md text-gray-600 hover:bg-gray-50 hover:text-brand-600 flex transition-colors"
        title="Escolher data"
      >
        <IconCalendar size={13} />
      </button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// MorningRitualCard — banner gradient com saudação + iniciar ritual
// ════════════════════════════════════════════════════════════════════════════

function MorningRitualCard({
  greeting, userName, date, onSkip, onStart,
}: {
  greeting: string
  userName: string
  date: string
  onSkip: () => void
  onStart: () => void
}) {
  return (
    <div
      className="rounded-xl p-5 text-white overflow-hidden relative"
      style={{
        background: `linear-gradient(135deg, #041366, ${BRAND})`,
      }}
    >
      {/* Decorative blob */}
      <div
        className="absolute -top-10 -right-8 w-[200px] h-[200px] rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${BRAND_LIGHT}50, transparent 70%)`,
        }}
      />
      <div className="absolute top-5 right-[200px] w-[3px] h-[3px] rounded-full bg-white/40" />
      <div className="absolute top-[50px] right-[240px] w-[2px] h-[2px] rounded-full bg-white/30" />

      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 md:gap-4 relative">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center text-white backdrop-blur-sm shrink-0">
            <IconSun size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[9.5px] font-bold text-white/70 uppercase tracking-[0.08em] mb-1">
              {date}
            </div>
            <div className="text-[17px] font-bold text-white -tracking-[0.015em] leading-tight mb-1">
              {greeting}, {userName}
            </div>
            <div className="text-[12.5px] text-white/80 leading-snug flex items-center gap-1.5 flex-wrap">
              <span>O seu rito de planejamento matinal recupera por volta de 2h do seu dia.</span>
              <span className={cn("text-[9px] font-bold text-white/95 bg-white/15 px-2 py-0.5 rounded-full tracking-[0.06em]", mono)}>
                ~10 MIN
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          <button
            onClick={onSkip}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white/10 text-white border border-white/20 rounded-lg text-[12px] font-semibold cursor-pointer hover:bg-white/20 transition-colors"
          >
            <IconCheck size={11} /> Já planejei
          </button>
          <button
            onClick={onStart}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white text-[#041366] rounded-lg text-[12.5px] font-semibold cursor-pointer hover:-translate-y-px transition-transform shadow-lg"
          >
            ✨ Iniciar ritual
          </button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Card primitives (Card + CardHeader)
// ════════════════════════════════════════════════════════════════════════════

function Card({
  children,
  padding = 16,
  className,
}: {
  children: React.ReactNode
  padding?: number
  className?: string
}) {
  return (
    <div
      className={cn("bg-white border rounded-xl shadow-sm", className)}
      style={{ borderColor: "rgba(0,0,0,0.06)", padding }}
    >
      {children}
    </div>
  )
}

function CardHeader({
  icon, title, count, action, accent,
}: {
  icon?: React.ReactNode
  title: string
  count?: number | string
  action?: React.ReactNode
  accent?: string
}) {
  return (
    <div className="flex justify-between items-center mb-3.5">
      <div className="flex items-center gap-2.5">
        {icon && (
          <span className="flex" style={{ color: accent || "#6B7280" }}>
            {icon}
          </span>
        )}
        <span className="text-[13px] font-bold text-gray-900 -tracking-[0.01em]">
          {title}
        </span>
        {count !== undefined && (
          <span className={cn("text-[11px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full", mono)}>
            {count}
          </span>
        )}
      </div>
      {action}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ObjectivesCard — MITs do dia
// ════════════════════════════════════════════════════════════════════════════

function ObjectivesCard({
  objectives, onAddObjective,
}: {
  objectives: Array<{ id: number; text: string; done: boolean; mit?: boolean }>
  onAddObjective: () => void
}) {
  const done = objectives.filter(o => o.done).length
  return (
    <Card>
      <CardHeader
        icon={<IconFlag size={15} />}
        accent={BRAND}
        title="Objetivos do dia"
        count={`${done}/${objectives.length || 3}`}
        action={<span className={cn("text-[10px] font-semibold text-gray-500 uppercase tracking-[0.06em]", mono)}>Max 3</span>}
      />
      <div className="flex flex-col gap-0.5">
        {objectives.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-[12px] text-gray-500 mb-2">
              Nenhum objetivo definido para hoje
            </p>
            <button
              type="button"
              onClick={onAddObjective}
              className="text-[12px] font-medium text-brand-600 hover:underline bg-transparent border-none cursor-pointer"
            >
              Iniciar planejamento diário →
            </button>
          </div>
        )}
        {objectives.map((o, i) => (
          <div
            key={o.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors hover:bg-gray-50"
          >
            <div
              className="w-[22px] h-[22px] rounded-md flex items-center justify-center text-[11px] font-bold -tracking-[0.02em] shrink-0 transition-colors"
              style={{
                background: o.done ? "#10B981" : BRAND_50,
                color: o.done ? "#FFFFFF" : BRAND,
              }}
            >
              {o.done ? <IconCheck size={12} /> : i + 1}
            </div>
            <span
              className={cn(
                "flex-1 text-[13px] font-medium leading-snug -tracking-[0.005em]",
                o.done ? "text-gray-400 line-through" : "text-gray-900",
              )}
            >
              {o.text}
            </span>
            {o.mit && (
              <span className={cn("text-[9px] font-bold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-full tracking-[0.06em]", mono)}>
                MIT
              </span>
            )}
          </div>
        ))}
        {objectives.length > 0 && objectives.length < 3 && (
          <button
            onClick={onAddObjective}
            className="flex items-center gap-1.5 px-3 py-2 mt-1 bg-transparent border border-dashed rounded-md text-[12px] text-gray-500 font-medium cursor-pointer transition-colors hover:border-brand-500 hover:text-brand-600"
            style={{ borderColor: "rgba(0,0,0,0.10)" }}
          >
            <IconPlus size={12} /> Adicionar objetivo
          </button>
        )}
      </div>
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// CalendarCard — Eventos do dia (Google Cal)
// ════════════════════════════════════════════════════════════════════════════

type CalEvent = {
  id?: string
  name: string
  time: string
  duration?: number | string
  color?: string
}

function CalendarCard({ events }: { events: CalEvent[] }) {
  return (
    <Card>
      <CardHeader
        icon={<IconCalendar size={15} />}
        accent="#10B981"
        title="Calendário"
        action={
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[11px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Google Cal
          </span>
        }
      />
      {events.length === 0 ? (
        <div className="py-6 text-center text-[12px] text-gray-400 italic">
          Sem eventos hoje.
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {events.map((ev, i) => (
            <div
              key={ev.id ?? i}
              className="flex items-stretch gap-2.5 px-2.5 py-2 rounded-md cursor-pointer transition-colors hover:bg-gray-50"
            >
              <div
                className="w-[3px] rounded-full shrink-0"
                style={{ background: ev.color || BRAND }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-medium text-gray-900 -tracking-[0.005em] truncate mb-0.5">
                  {ev.name}
                </div>
                <div className={cn("text-[11px] text-gray-500 flex items-center gap-1.5", mono)}>
                  <span>{ev.time}</span>
                  <span className="text-gray-300">·</span>
                  <span>{typeof ev.duration === "number" ? `${ev.duration}min` : ev.duration}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// TodayTasksCard — Tabela de tarefas do dia
// ════════════════════════════════════════════════════════════════════════════

type Task = {
  id: string
  name: string
  status: string
  priority: 1 | 2 | 3 | 4
  project: string
  estimatedTime: string
  time: string
  people: string[]
}

function TodayTasksCard({
  tasks, onToggle, onDelete,
}: {
  tasks: Task[]
  onToggle: (id: string) => void
  onDelete: (id: string, name: string) => void
}) {
  const pending = tasks.filter(t => t.status !== "done").length
  return (
    <Card padding={16}>
      <CardHeader
        icon={<IconCheck size={15} />}
        accent="#065F46"
        title="Tarefas do dia"
        action={
          <span className={cn(
            "text-[11px] font-bold",
            pending >= 5 ? "text-red-700" : "text-gray-600",
            mono,
          )}>
            {pending} pendentes
          </span>
        }
      />

      {/* Header de colunas — esconde colunas extras em mobile */}
      <div
        className="hidden md:grid gap-2.5 px-2.5 py-1.5 text-[9.5px] font-semibold text-gray-400 uppercase tracking-[0.08em] border-b mb-1"
        style={{
          gridTemplateColumns: "auto auto minmax(0,1fr) 130px 70px 32px 50px",
          borderColor: "rgba(0,0,0,0.06)",
        }}
      >
        <span />
        <span />
        <span>Tarefa</span>
        <span>Projeto</span>
        <span>Est.</span>
        <span>Resp.</span>
        <span className="text-right">Hora</span>
      </div>

      {tasks.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-[12px] text-gray-400 mb-2">Nenhuma tarefa para hoje</p>
          <a href="/admin/projects" className="text-[12px] font-medium text-brand-600 hover:underline">
            Criar tarefa →
          </a>
        </div>
      )}
      {tasks.map((t) => {
        const isDone = t.status === "done"
        return (
          <TaskRow
            key={t.id}
            task={t}
            isDone={isDone}
            onToggle={() => onToggle(t.id)}
            onDelete={() => onDelete(t.id, t.name)}
          />
        )
      })}
    </Card>
  )
}

// TaskRow — linha responsiva: mobile = flex compacto, desktop = grid 7-cols
function TaskRow({
  task: t,
  isDone,
  onToggle,
  onDelete,
}: {
  task: Task
  isDone: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <>
      {/* Mobile (< md): card compacto com nome em cima e chips embaixo */}
      <div className="md:hidden flex items-start gap-2.5 px-2.5 py-2.5 rounded-md hover:bg-gray-50 transition-colors group border-b last:border-b-0" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
        <div className="flex flex-col gap-1.5 pt-0.5 items-center">
          <PriorityDot priority={t.priority} />
          <Checkbox checked={isDone} onChange={onToggle} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={cn(
            "text-[13px] font-medium -tracking-[0.005em] mb-1",
            isDone ? "text-gray-400 line-through" : "text-gray-900",
          )}>
            {t.name}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full truncate max-w-[60vw]">
              <span className="w-1 h-1 rounded-full bg-brand-500 shrink-0" />
              <span className="truncate">{t.project}</span>
            </span>
            {t.estimatedTime && (
              <span className={cn("text-[10.5px] text-gray-500 px-1.5 py-0.5 bg-gray-100 rounded", mono)}>
                {t.estimatedTime}
              </span>
            )}
            {t.people[0] && <Avatar initials={t.people[0]} size={18} />}
            {isDone && (
              <span className={cn("text-[10px] font-bold text-emerald-700", mono)}>✓ Feito</span>
            )}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="h-7 w-7 inline-flex items-center justify-center rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 shrink-0"
          title="Excluir tarefa"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-2 14H7L5 6" />
            <path d="M10 11v6M14 11v6" />
          </svg>
        </button>
      </div>

      {/* Desktop (>= md): grid 7-cols */}
      <div
        className="hidden md:grid gap-2.5 px-2.5 py-2 rounded-md cursor-pointer transition-colors items-center group hover:bg-gray-50"
        style={{ gridTemplateColumns: "auto auto minmax(0,1fr) 130px 70px 32px 50px" }}
      >
        <PriorityDot priority={t.priority} />
        <Checkbox checked={isDone} onChange={onToggle} />
        <span className={cn(
          "text-[13px] font-medium truncate -tracking-[0.005em]",
          isDone ? "text-gray-400 line-through" : "text-gray-900",
        )}>
          {t.name}
        </span>
        <span
          className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full truncate"
          title={t.project}
        >
          <span className="w-1 h-1 rounded-full bg-brand-500 shrink-0" />
          <span className="truncate">{t.project}</span>
        </span>
        <span className={cn("text-[11px] text-gray-500", mono)}>{t.estimatedTime || "—"}</span>
        <div className="flex">
          <Avatar initials={t.people[0]} size={22} />
        </div>
        <div className="flex items-center justify-end gap-1">
          <span className={cn(
            "text-[10px] font-bold text-right",
            isDone ? "text-emerald-700" : "text-gray-400",
            mono,
          )}>
            {isDone ? "Feito" : (t.time || "—")}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="h-5 w-5 inline-flex items-center justify-center rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Excluir tarefa"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-2 14H7L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
          </button>
        </div>
      </div>
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ProjectsOverview — Onboardings ativos com tarefas
// ════════════════════════════════════════════════════════════════════════════

type ProjectGroup = {
  id: string
  name: string
  color: string
  items: Array<Task & { date?: string }>
  source_type?: string
  stage_name?: string
  stage_color?: string
  plan?: string
  mrr_value?: number | string | null
  client_name?: string
}

function ProjectsOverview({ projects }: { projects: Array<ProjectGroup> }) {
  return (
    <Card padding={0}>
      <div
        className="flex justify-between items-center px-[18px] py-4 border-b"
        style={{ borderColor: "rgba(0,0,0,0.06)" }}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex" style={{ color: BRAND }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
          </span>
          <span className="text-[13px] font-bold text-gray-900 -tracking-[0.01em]">
            Projetos ativos
          </span>
          <span className={cn("text-[11px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full", mono)}>
            {projects.length}
          </span>
        </div>
        <a
          href="/admin/projects"
          className="text-[11.5px] font-medium text-gray-500 hover:text-brand-600 inline-flex items-center gap-1"
        >
          Ver todos →
        </a>
      </div>

      {/* Wrapper com overflow-x pra permitir scroll horizontal em mobile */}
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Header de colunas — esconde em mobile */}
          <div
            className="hidden md:grid gap-3 px-[46px] py-2.5 text-[9.5px] font-semibold text-gray-500 uppercase tracking-[0.08em] bg-gray-50/60 border-b"
            style={{
              gridTemplateColumns: "minmax(0,1fr) 130px 80px 100px 70px 40px",
              borderColor: "rgba(0,0,0,0.06)",
            }}
          >
            <span>Tarefa</span>
            <span>Status</span>
            <span>Resp.</span>
            <span>Data</span>
            <span>Est.</span>
            <span />
          </div>

          {projects.map((p, i) => (
            <ProjectBlock key={p.id} project={p} defaultOpen={i === 0} />
          ))}
        </div>
      </div>
    </Card>
  )
}

function fmtBRL(v: number | string | null | undefined): string {
  const n = typeof v === "string" ? Number(v) : v
  if (!n || isNaN(n as number)) return ""
  return (n as number) >= 1000
    ? `R$ ${((n as number) / 1000).toFixed((n as number) >= 10000 ? 0 : 1).replace(".", ",")}k`
    : `R$ ${n}`
}

function ProjectBlock({
  project, defaultOpen,
}: {
  project: ProjectGroup
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const done = project.items.filter((t) => t.status === "done").length
  const total = project.items.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const stageColor = project.stage_color ?? project.color
  return (
    <div>
      {/* Project header */}
      <div
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 px-[18px] py-3 bg-white cursor-pointer transition-colors hover:bg-gray-50"
        style={{ borderBottom: open ? "1px solid rgba(0,0,0,0.06)" : "none" }}
      >
        <span
          className={cn(
            "text-gray-500 flex transition-transform",
            open && "rotate-90",
          )}
        >
          <IconChevronRight size={12} />
        </span>
        <span className="text-[13px] font-bold text-gray-900 -tracking-[0.005em]">
          {project.name}
        </span>
        {project.stage_name && (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ color: stageColor, background: `${stageColor}1A` }}
          >
            <span className="w-1 h-1 rounded-full" style={{ background: stageColor }} />
            {project.stage_name}
          </span>
        )}
        <div className="flex items-center gap-1.5 ml-1">
          <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                background: pct === 100 ? "#10B981" : BRAND,
              }}
            />
          </div>
          <span className={cn("text-[11px] font-semibold text-gray-600", mono)}>
            {done}/{total}
          </span>
        </div>
        <span className="flex-1" />
        {(project.plan || project.mrr_value) && (
          <span className={cn("text-[10px] text-gray-500 font-medium", mono)}>
            {[project.plan, fmtBRL(project.mrr_value)].filter(Boolean).join(" · ")}
            {project.mrr_value ? "/mês" : ""}
          </span>
        )}
      </div>
      {/* Tasks */}
      {open && project.items.map((t) => {
        const isDone = t.status === "done"
        return (
          <div
            key={t.id}
            className="grid gap-3 px-[46px] py-2.5 bg-white items-center cursor-pointer transition-colors hover:bg-gray-50"
            style={{
              gridTemplateColumns: "minmax(0,1fr) 130px 80px 100px 70px 40px",
              borderBottom: "1px solid rgba(0,0,0,0.04)",
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Checkbox checked={isDone} />
              <PriorityDot priority={t.priority} />
              <span
                className={cn(
                  "text-[12.5px] font-medium -tracking-[0.005em] truncate",
                  isDone ? "text-gray-400 line-through" : "text-gray-900",
                )}
              >
                {t.name}
              </span>
            </div>
            <StatusChip status={t.status} />
            <Avatar initials={t.people[0]} size={22} />
            <span className={cn("text-[11px] font-medium text-gray-600", mono)}>
              {t.date || "—"}
            </span>
            <span className={cn("text-[11px] text-gray-600", mono)}>
              {t.estimatedTime || "—"}
            </span>
            <div />
          </div>
        )
      })}
    </div>
  )
}

function StatusChip({ status }: { status: string }) {
  const cfg: Record<string, { label: string; color: string; dot: string }> = {
    pending: { label: "Pendente", color: "#4B5563", dot: "#9CA3AF" },
    progress: { label: "Em andamento", color: BRAND, dot: BRAND },
    review: { label: "Em revisão", color: "#7E22CE", dot: "#A855F7" },
    done: { label: "Concluído", color: "#065F46", dot: "#10B981" },
  }
  const c = cfg[status] ?? cfg.pending
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: c.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {c.label}
    </span>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// FocusModeCard — Pomodoro grande
// ════════════════════════════════════════════════════════════════════════════

function FocusModeCard({
  currentTask, running, minutes, seconds, onToggle, onReset,
}: {
  currentTask: Task | undefined
  running: boolean
  minutes: number
  seconds: number
  onToggle: () => void
  onReset: () => void
}) {
  return (
    <div
      className="rounded-xl p-5 border shadow-sm transition-colors relative overflow-hidden"
      style={{
        background: running ? `linear-gradient(135deg, ${BRAND}, ${BRAND_LIGHT})` : "#FFFFFF",
        color: running ? "#FFFFFF" : "#111827",
        borderColor: running ? "transparent" : "rgba(0,0,0,0.06)",
      }}
    >
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <span className="flex" style={{ color: running ? "#FFFFFF" : "#A855F7" }}>
            <IconTarget size={15} />
          </span>
          <span
            className="text-[13px] font-bold -tracking-[0.005em]"
            style={{ color: running ? "#FFFFFF" : "#111827" }}
          >
            Modo foco
          </span>
        </div>
        <span
          className={cn("text-[10px] font-bold uppercase tracking-[0.04em] px-2 py-0.5 rounded-full", mono)}
          style={{
            color: running ? "rgba(255,255,255,0.9)" : "#065F46",
            background: running ? "rgba(255,255,255,0.15)" : "#ECFDF5",
          }}
        >
          {running ? "FOCO ATIVO" : "PRONTO"}
        </span>
      </div>

      {/* Task selector */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-md mb-4"
        style={{
          background: running ? "rgba(255,255,255,0.12)" : "#F8FAFC",
          border: running ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(0,0,0,0.06)",
        }}
      >
        {currentTask ? (
          <>
            <PriorityDot priority={currentTask.priority} />
            <span
              className="text-[12.5px] font-medium flex-1 min-w-0 truncate -tracking-[0.005em]"
              style={{ color: running ? "#FFFFFF" : "#111827" }}
            >
              {currentTask.name}
            </span>
          </>
        ) : (
          <span className="text-[12.5px] text-gray-400 italic">Nenhuma tarefa pra focar</span>
        )}
      </div>

      {/* Timer */}
      <div className="flex items-center gap-4 mb-3">
        <div
          className={cn("text-[48px] font-bold -tracking-[0.04em] leading-none", mono)}
          style={{ color: running ? "#FFFFFF" : "#111827" }}
        >
          {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
        </div>
        <div className="flex flex-col gap-1.5 flex-1">
          <button
            onClick={onToggle}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-white text-[13px] font-semibold cursor-pointer transition-colors"
            style={{
              background: running ? "rgba(255,255,255,0.18)" : BRAND,
              boxShadow: running ? "none" : "0 1px 2px rgba(33,55,182,0.2)",
            }}
          >
            {running ? <IconPause size={13} /> : <IconPlay size={13} />}
            {running ? "Pausar" : "Iniciar"}
          </button>
          <button
            onClick={onReset}
            className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium cursor-pointer transition-colors"
            style={{
              background: "transparent",
              color: running ? "rgba(255,255,255,0.7)" : "#6B7280",
              border: running ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(0,0,0,0.06)",
            }}
          >
            <IconRefresh size={11} /> Reset
          </button>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1">
        {["25min", "Pausa 5m", "Longa 15m"].map((m, i) => (
          <span
            key={m}
            className={cn(
              "text-[11px] px-2.5 py-1 rounded-md border",
              i === 0
                ? running
                  ? "bg-white/20 text-white border-white/20"
                  : "bg-gray-900 text-white border-gray-900 font-semibold"
                : running
                  ? "bg-white/8 text-white/80 border-white/18"
                  : "bg-white text-gray-700 border-black/[0.06]",
            )}
          >
            {m}
          </span>
        ))}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// WeekChart — gráfico semanal de foco
// ════════════════════════════════════════════════════════════════════════════

function WeekChart({
  tasks, weeklyBars, maxBar,
}: {
  tasks: Task[]
  weeklyBars: Array<{ label: string; actual: number; estimated: number }>
  maxBar: number
}) {
  const todayIdx = new Date().getDay()
  const completed = tasks.filter(t => t.status === "done").length
  const real = Math.round(weeklyBars.reduce((s, b) => s + b.actual, 0) / 60 * 10) / 10
  const meta = Math.round(weeklyBars.reduce((s, b) => s + b.estimated, 0) / 60 * 10) / 10
  return (
    <Card>
      <CardHeader icon={<IconChart size={15} />} accent={BRAND} title="Gráfico semanal" />
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        {[
          { v: String(completed), l: "Concluídas", color: "#065F46" },
          { v: `${real}h`, l: "Foco real", color: "#111827" },
          { v: `${meta}h`, l: "Meta semana", color: "#111827" },
        ].map((s) => (
          <div key={s.l}>
            <div
              className={cn("text-[18px] font-bold -tracking-[0.02em] leading-none mb-1", mono)}
              style={{ color: s.color }}
            >
              {s.v}
            </div>
            <div className="text-[10px] text-gray-500 font-medium">{s.l}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5 items-end h-[70px]">
        {weeklyBars.map((b, i) => {
          const isToday = i === todayIdx
          return (
            <div
              key={i}
              className="flex flex-col items-center gap-1 h-full justify-end"
            >
              <div className="w-full flex-1 bg-gray-100 rounded flex items-end" style={{ minHeight: 4 }}>
                <div
                  className="w-full rounded transition-all"
                  style={{
                    height: `${(b.actual / maxBar) * 100}%`,
                    background: isToday
                      ? `linear-gradient(180deg, ${BRAND_LIGHT}, ${BRAND})`
                      : b.actual > 0
                        ? "#C7CDEF"
                        : "transparent",
                    minHeight: b.actual > 0 ? 4 : 0,
                  }}
                  title={`${b.label}: ${b.actual}h`}
                />
              </div>
              <span
                className={cn(
                  "text-[9px] uppercase",
                  isToday ? "text-brand-600 font-bold" : "text-gray-500 font-medium",
                )}
              >
                {b.label}
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// GoalsCard — Metas do trimestre
// ════════════════════════════════════════════════════════════════════════════

type Goal = {
  name: string
  current: string
  percentage: number
  color: string
}

function GoalsCard({
  goals, onAddGoal,
}: {
  goals: Goal[]
  onAddGoal: () => void
}) {
  const quarter = `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()}`
  return (
    <Card>
      <CardHeader
        icon={<IconTarget size={15} />}
        accent={BRAND}
        title="Metas do trimestre"
        action={
          <div className="flex items-center gap-2">
            <span className={cn("text-[10px] font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full tracking-[0.04em]", mono)}>
              {quarter}
            </span>
            <button
              onClick={onAddGoal}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white text-gray-700 border rounded-md text-[11.5px] font-medium cursor-pointer transition-colors hover:text-brand-600"
              style={{ borderColor: "rgba(0,0,0,0.06)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${BRAND}60`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(0,0,0,0.06)"
              }}
            >
              <IconPlus size={11} /> Meta
            </button>
          </div>
        }
      />
      {goals.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-[12px] text-gray-400 mb-2">Nenhuma meta definida</p>
          <button
            onClick={onAddGoal}
            className="text-[12px] font-medium text-brand-600 hover:underline bg-transparent border-none cursor-pointer"
          >
            + Adicionar meta
          </button>
        </div>
      ) : (
        <div className="flex flex-col">
          {goals.map((g, i) => (
            <div
              key={g.name}
              className="py-3"
              style={{
                borderBottom: i < goals.length - 1 ? "1px solid rgba(0,0,0,0.06)" : "none",
              }}
            >
              <div className="flex justify-between items-baseline mb-2">
                <div className="text-[12.5px] font-semibold text-gray-900 -tracking-[0.005em]">
                  {g.name}
                </div>
                <div className={cn("text-[11px] font-bold text-gray-900", mono)}>
                  {g.percentage}%
                </div>
              </div>
              {g.current && (
                <div className={cn("text-[10.5px] text-gray-500 mb-1.5", mono)}>{g.current}</div>
              )}
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${g.percentage}%`,
                    background: g.percentage >= 75 ? "#10B981" : g.percentage >= 50 ? BRAND : "#F59E0B",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// HabitsCard — Hábitos com streak grid
// ════════════════════════════════════════════════════════════════════════════

type Habit = {
  name: string
  streak: number
  days: number[]
}

function HabitsCard({
  habits, onAddHabit,
}: {
  habits: Habit[]
  onAddHabit: () => void
}) {
  const bestStreak = Math.max(0, ...habits.map((h) => h.streak))
  return (
    <Card>
      <CardHeader
        icon={<IconFire size={15} />}
        accent="#EA580C"
        title="Hábitos"
        action={
          <div className="flex items-center gap-2">
            {bestStreak > 0 && (
              <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold text-brand-600", mono)}>
                <IconTarget size={11} /> {bestStreak}d streak
              </span>
            )}
            <button
              onClick={onAddHabit}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white text-gray-700 border rounded-md text-[11.5px] font-medium cursor-pointer transition-colors hover:text-brand-600"
              style={{ borderColor: "rgba(0,0,0,0.06)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${BRAND}60`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(0,0,0,0.06)"
              }}
            >
              <IconPlus size={11} /> Hábito
            </button>
          </div>
        }
      />
      {habits.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-[12px] text-gray-400 mb-2">Nenhum hábito cadastrado</p>
          <button
            onClick={onAddHabit}
            className="text-[12px] font-medium text-brand-600 hover:underline bg-transparent border-none cursor-pointer"
          >
            + Adicionar hábito
          </button>
        </div>
      ) : (
        <div className="flex flex-col">
          {habits.map((h, i) => (
            <HabitRow key={h.name} habit={h} isLast={i === habits.length - 1} />
          ))}
        </div>
      )}
    </Card>
  )
}

function HabitRow({ habit, isLast }: { habit: Habit; isLast: boolean }) {
  const labels = ["S", "T", "Q", "Q", "S", "S", "D"]
  return (
    <div
      className="py-3"
      style={{ borderBottom: isLast ? "none" : "1px solid rgba(0,0,0,0.06)" }}
    >
      <div className="flex justify-between items-center mb-2.5">
        <span className="text-[12.5px] font-semibold text-gray-900 -tracking-[0.005em]">
          {habit.name}
        </span>
        {habit.streak > 0 ? (
          <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 bg-brand-50 px-2 py-1 rounded-full", mono)}>
            <IconTarget size={11} /> {habit.streak}d
          </span>
        ) : (
          <span className={cn("text-[10px] font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded-full", mono)}>
            sem streak
          </span>
        )}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {habit.days.map((d, i) => {
          const isToday = i === habit.days.length - 1
          return (
            <div
              key={i}
              className="aspect-square rounded flex items-center justify-center text-[9px] font-bold transition-colors"
              style={{
                background: d === 1
                  ? `linear-gradient(180deg, ${BRAND_LIGHT}, ${BRAND})`
                  : isToday ? "#E5E7EB" : "#F3F4F6",
                color: d === 1 ? "#FFFFFF" : "#9CA3AF",
                border: isToday && d !== 1 ? `1.5px dashed ${BRAND}80` : "none",
              }}
            >
              {d === 1 ? <IconCheck size={10} /> : labels[i]}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ClosingRitualCard — Ritual de encerramento (checklist colapsável)
// ════════════════════════════════════════════════════════════════════════════

function ClosingRitualCard({
  tasks, onReflect,
}: {
  tasks: Task[]
  onReflect: () => void
}) {
  const [open, setOpen] = useState(false)
  const [doneSteps, setDoneSteps] = useState<Record<number, boolean>>({})
  const steps = [
    { id: 1, label: "Revisar tarefas concluídas hoje", count: tasks.filter(t => t.status === "done").length },
    { id: 2, label: "Planejar os 3 MITs de amanhã" },
    { id: 3, label: "Limpar inbox até zero" },
    { id: 4, label: "Anotar 1 aprendizado do dia" },
  ]
  const completed = Object.values(doneSteps).filter(Boolean).length
  const allDone = completed === steps.length
  return (
    <div
      className="rounded-xl p-5 text-white overflow-hidden relative"
      style={{ background: "linear-gradient(135deg, #0F1729, #1F1147, #2137B6)" }}
    >
      <div className="absolute top-3 right-[60px] w-[3px] h-[3px] rounded-full bg-white/40" />
      <div className="absolute top-[30px] right-[90px] w-[2px] h-[2px] rounded-full bg-white/30" />
      <div className="absolute top-[18px] right-[130px] w-[2px] h-[2px] rounded-full bg-white/25" />

      <div
        onClick={() => setOpen(!open)}
        className="flex justify-between items-center gap-4 cursor-pointer relative"
      >
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-white/12 flex items-center justify-center text-white backdrop-blur-sm">
            <IconMoon size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[14px] font-bold text-white -tracking-[0.01em]">
                Ritual de encerramento
              </span>
              <span
                className={cn("text-[10.5px] font-bold text-white px-1.5 py-0.5 rounded-full", mono)}
                style={{ background: allDone ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.14)" }}
              >
                {completed}/{steps.length}
              </span>
            </div>
            <div className="text-[11.5px] text-white/70 leading-snug">
              Encerre o dia com intencionalidade · 4 passos rápidos
            </div>
          </div>
        </div>
        <span
          className={cn(
            "w-8 h-8 rounded-md bg-white/10 text-white flex items-center justify-center transition-transform",
            open && "rotate-180",
          )}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </div>

      {open && (
        <div className="mt-4 flex flex-col gap-1.5 relative">
          {steps.map((s) => (
            <div
              key={s.id}
              onClick={() => setDoneSteps({ ...doneSteps, [s.id]: !doneSteps[s.id] })}
              className="flex items-center gap-2.5 px-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-md cursor-pointer transition-colors hover:bg-white/10"
            >
              <div
                className="w-[18px] h-[18px] rounded-md flex items-center justify-center text-white shrink-0 transition-colors"
                style={{
                  background: doneSteps[s.id] ? "#10B981" : "transparent",
                  border: doneSteps[s.id] ? "1.5px solid #10B981" : "1.5px solid rgba(255,255,255,0.32)",
                }}
              >
                {doneSteps[s.id] && <IconCheck size={12} />}
              </div>
              <span
                className={cn(
                  "flex-1 text-[12.5px] text-white transition-opacity",
                  doneSteps[s.id] && "line-through opacity-50",
                )}
              >
                {s.label}
              </span>
              {s.count !== undefined && (
                <span className={cn("text-[10.5px] text-white/55", mono)}>{s.count}</span>
              )}
            </div>
          ))}
          <button
            onClick={onReflect}
            className="w-full mt-3 py-2.5 px-3.5 rounded-md text-[13px] font-semibold cursor-pointer transition-colors inline-flex items-center justify-center gap-1.5"
            style={{
              background: allDone ? "#FFFFFF" : "rgba(255,255,255,0.14)",
              color: allDone ? "#041366" : "#FFFFFF",
              boxShadow: allDone ? "0 4px 12px rgba(0,0,0,0.2)" : "none",
            }}
          >
            {allDone ? <IconCheck size={13} /> : <IconMoon size={13} />}
            {allDone ? "Encerrar o dia · Bom descanso" : "Reflexão do dia"}
          </button>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// HabitModal — criar hábito
// ════════════════════════════════════════════════════════════════════════════

const HABIT_TEMPLATES = [
  { label: "Foco profundo 4h+", icon: "🎯" },
  { label: "Revisar OKRs", icon: "📊" },
  { label: "Encerramento ritualizado", icon: "🌙" },
  { label: "Exercício físico", icon: "💪" },
  { label: "Leitura 30min", icon: "📖" },
  { label: "Meditação", icon: "🧘" },
]

function HabitModal({
  open, onClose, onSave,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: { title: string; frequency: string; reminder: string; note: string }) => void
}) {
  const [title, setTitle] = useState("")
  const [frequency, setFrequency] = useState("daily")
  const [reminder, setReminder] = useState("none")
  const [note, setNote] = useState("")

  useEffect(() => {
    if (!open) {
      setTitle(""); setFrequency("daily"); setReminder("none"); setNote("")
    }
  }, [open])

  if (!open) return null

  const handleSave = () => {
    if (!title.trim()) return
    onSave({ title, frequency, reminder, note })
  }

  return (
    <Modal
      title="Novo hábito"
      subtitle="Hábitos não-negociáveis constroem disciplina diária"
      icon={<IconTarget size={17} />}
      accent={BRAND}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-md border bg-white text-gray-700 text-[12.5px] font-medium cursor-pointer" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-white text-[12.5px] font-semibold",
              title.trim() ? "bg-brand-500 cursor-pointer hover:bg-brand-600" : "bg-gray-300 cursor-not-allowed",
            )}
          >
            <IconCheck size={12} /> Criar hábito
          </button>
        </>
      }
    >
      <Field label="Sugestões rápidas" hint="Clique pra preencher automaticamente">
        <div className="flex gap-1.5 flex-wrap">
          {HABIT_TEMPLATES.map(t => (
            <button
              key={t.label}
              onClick={() => setTitle(t.label)}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11.5px] font-medium border cursor-pointer transition-colors",
                title === t.label
                  ? "bg-brand-50 text-brand-700 border-brand-200"
                  : "bg-gray-50 text-gray-700 border-black/[0.06] hover:bg-gray-100",
              )}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Nome do hábito" required>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Foco profundo 4h+"
          className="w-full px-3 py-2 border rounded-md text-[13px] outline-none focus:border-brand-500"
          style={{ borderColor: "rgba(0,0,0,0.06)" }}
        />
      </Field>

      <Field label="Frequência" hint="Define quantos dias por semana você quer cumprir">
        <ToggleGroup
          value={frequency}
          onChange={setFrequency}
          options={[
            { value: "daily", label: "Diário" },
            { value: "workdays", label: "Dias úteis" },
            { value: "custom", label: "Personalizado" },
          ]}
        />
      </Field>

      <Field label="Lembrete" hint="Notificação no horário definido">
        <select
          value={reminder}
          onChange={(e) => setReminder(e.target.value)}
          className="w-full px-3 py-2 border rounded-md text-[13px] outline-none focus:border-brand-500 bg-white"
          style={{ borderColor: "rgba(0,0,0,0.06)" }}
        >
          <option value="none">Sem lembrete</option>
          <option value="morning">Manhã · 07:00</option>
          <option value="lunch">Almoço · 12:00</option>
          <option value="evening">Final do dia · 18:00</option>
          <option value="night">Antes de dormir · 22:00</option>
        </select>
      </Field>

      <Field label="Notas (opcional)" hint="Anote o porquê desse hábito — ajuda a manter consistência">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ex: 4h+ de foco profundo é o que move a Worder pra frente."
          rows={3}
          className="w-full px-3 py-2 border rounded-md text-[13px] outline-none focus:border-brand-500 resize-y min-h-[60px]"
          style={{ borderColor: "rgba(0,0,0,0.06)" }}
        />
      </Field>
    </Modal>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// GoalModal — criar meta do trimestre (OKR)
// ════════════════════════════════════════════════════════════════════════════

function GoalModal({
  open, onClose, onSave,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: { label: string; unit: string; current: number; target: number; quarter: string }) => void
}) {
  const [label, setLabel] = useState("")
  const [unit, setUnit] = useState("R$")
  const [current, setCurrent] = useState("")
  const [target, setTarget] = useState("")
  const [quarter, setQuarter] = useState(`Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()}`)

  useEffect(() => {
    if (!open) {
      setLabel(""); setCurrent(""); setTarget("")
    }
  }, [open])

  if (!open) return null

  const pct = target && parseFloat(target) > 0
    ? Math.min(Math.round((parseFloat(current || "0") / parseFloat(target)) * 100), 100)
    : 0

  const fmtPreview = (v: string) => {
    if (!v) return "—"
    const n = parseFloat(v)
    if (isNaN(n)) return "—"
    if (unit === "R$") return `R$ ${(n / 1000).toFixed(0)}k`
    if (unit === "%") return `${n}%`
    return String(n)
  }

  const valid = label.trim() && target

  const handleSave = () => {
    if (!valid) return
    onSave({
      label, unit,
      current: parseFloat(current || "0"),
      target: parseFloat(target),
      quarter,
    })
  }

  return (
    <Modal
      title="Nova meta do trimestre"
      subtitle="OKRs ambiciosos puxam o trimestre pra frente"
      icon={<IconTarget size={17} />}
      accent={BRAND}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-md border bg-white text-gray-700 text-[12.5px] font-medium cursor-pointer" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!valid}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-white text-[12.5px] font-semibold",
              valid ? "bg-brand-500 cursor-pointer hover:bg-brand-600" : "bg-gray-300 cursor-not-allowed",
            )}
          >
            <IconCheck size={12} /> Criar meta
          </button>
        </>
      }
    >
      <Field label="Nome da meta" required hint="Seja específico e mensurável">
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex: MRR Convertfy"
          className="w-full px-3 py-2 border rounded-md text-[13px] outline-none focus:border-brand-500"
          style={{ borderColor: "rgba(0,0,0,0.06)" }}
        />
      </Field>

      <Field label="Trimestre">
        <ToggleGroup
          value={quarter}
          onChange={setQuarter}
          options={[
            { value: `Q1 ${new Date().getFullYear()}`, label: `Q1 ${new Date().getFullYear()}` },
            { value: `Q2 ${new Date().getFullYear()}`, label: `Q2 ${new Date().getFullYear()}` },
            { value: `Q3 ${new Date().getFullYear()}`, label: `Q3 ${new Date().getFullYear()}` },
            { value: `Q4 ${new Date().getFullYear()}`, label: `Q4 ${new Date().getFullYear()}` },
          ]}
        />
      </Field>

      <Field label="Unidade">
        <ToggleGroup
          value={unit}
          onChange={setUnit}
          options={[
            { value: "R$", label: "R$ Moeda" },
            { value: "%", label: "% Percentual" },
            { value: "", label: "# Número" },
          ]}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor atual" hint="Onde você está hoje">
          <input
            type="number"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Ex: 142000"
            className="w-full px-3 py-2 border rounded-md text-[13px] outline-none focus:border-brand-500"
            style={{ borderColor: "rgba(0,0,0,0.06)" }}
          />
        </Field>
        <Field label="Meta" required hint="Onde quer chegar">
          <input
            type="number"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Ex: 200000"
            className="w-full px-3 py-2 border rounded-md text-[13px] outline-none focus:border-brand-500"
            style={{ borderColor: "rgba(0,0,0,0.06)" }}
          />
        </Field>
      </div>

      {target && (
        <div
          className="px-4 py-3.5 rounded-lg border mt-3"
          style={{ background: BRAND_50, borderColor: `${BRAND}20` }}
        >
          <div className="flex justify-between items-baseline mb-1.5">
            <span className="text-[11px] font-semibold text-brand-600 uppercase tracking-[0.06em]">
              Preview
            </span>
            <span className={cn("text-[11px] font-bold text-gray-900", mono)}>
              {fmtPreview(current)}<span className="text-gray-400 font-medium"> / {fmtPreview(target)}</span>
            </span>
          </div>
          <div className="h-1.5 bg-white rounded-full overflow-hidden mb-1.5">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                background: pct >= 75 ? "#10B981" : pct >= 50 ? BRAND : "#F59E0B",
              }}
            />
          </div>
          <div className={cn("text-[10px] font-semibold text-gray-600", mono)}>
            {pct}% concluído · {pct < 50 ? "vamos lá" : pct < 75 ? "no caminho" : "quase lá!"}
          </div>
        </div>
      )}
    </Modal>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Modal wrapper + form primitives
// ════════════════════════════════════════════════════════════════════════════

function Modal({
  title, subtitle, icon, accent, onClose, children, footer,
}: {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  accent?: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  // ESC fecha
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[80] bg-gray-900/30 backdrop-blur-[2px]" />
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] max-w-[calc(100vw-40px)] max-h-[calc(100vh-80px)] bg-white rounded-2xl shadow-2xl z-[81] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4 border-b"
          style={{ borderColor: "rgba(0,0,0,0.06)" }}
        >
          {icon && (
            <div
              className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
              style={{ background: `${accent || BRAND}15`, color: accent || BRAND }}
            >
              {icon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[14.5px] font-bold text-gray-900 -tracking-[0.015em] leading-tight">
              {title}
            </div>
            {subtitle && (
              <div className="text-[12px] text-gray-500 mt-0.5 leading-snug">{subtitle}</div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100"
          >
            <IconClose size={14} />
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 px-5 py-4 overflow-y-auto">{children}</div>
        {/* Footer */}
        {footer && (
          <div
            className="px-5 py-3.5 border-t bg-gray-50/40 flex items-center justify-end gap-2"
            style={{ borderColor: "rgba(0,0,0,0.06)" }}
          >
            {footer}
          </div>
        )}
      </div>
    </>
  )
}

function Field({
  label, hint, required, children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="mb-4">
      <label className="flex items-center gap-1 text-[11px] font-semibold text-gray-700 mb-1.5 -tracking-[0.005em]">
        {label}
        {required && <span className="text-red-500 font-bold">*</span>}
      </label>
      {children}
      {hint && (
        <div className="text-[10.5px] text-gray-500 mt-1.5 leading-snug">{hint}</div>
      )}
    </div>
  )
}

function ToggleGroup({
  value, onChange, options,
}: {
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-3.5 py-1.5 rounded-md text-[12px] cursor-pointer transition-colors inline-flex items-center gap-1.5",
              active
                ? "bg-brand-50 text-brand-700 border border-brand-300 font-semibold"
                : "bg-white text-gray-700 border border-black/[0.06] font-medium hover:border-black/[0.10]",
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
