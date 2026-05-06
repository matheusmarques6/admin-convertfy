"use client"

import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { useProductivityStore } from "@/stores/productivity-store"
import { DailyPlanning } from "./daily-planning"
import { NightlyReflection } from "./nightly-reflection"
import {
  PriorityDot, Avatar, Checkbox,
  Card, CardHeader, DSBadge, SectionLabel,
  IconFlag, IconCalendar, IconCheck, IconBolt, IconChart,
  IconTarget, IconFire, IconDoc, IconSun, IconMoon,
  IconPlay, IconPause, IconRefresh, IconExtLink, IconClock,
  IconChevronLeft, IconChevronRight,
} from "./ds-atoms"

// ============================================================================
// Início — Dashboard do dia (3 zonas)
// ============================================================================

export function ProductivityHome() {
  const {
    tasks, calendarEvents, planningDone, setPlanningDone,
    showShutdown, setShowShutdown, goals, habits,
    kanbanColumns, weeklyBars,
    focusRunning, focusTime,
    toggleFocus, resetFocus, tickFocus,
    isLoaded, fetchData, profile, apiAction,
  } = useProductivityStore()

  const [showDailyPlanning, setShowDailyPlanning] = useState(false)
  const [showAddGoal, setShowAddGoal] = useState(false)
  const [showAddHabit, setShowAddHabit] = useState(false)
  const [newGoalName, setNewGoalName] = useState("")
  const [newHabitName, setNewHabitName] = useState("")

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

  const fm = Math.floor(focusTime / 60)
  const fs = focusTime % 60

  // Compute workload from real tasks
  const plannedMinutes = tasks.filter(t => t.status !== "done").reduce((sum, t) => {
    const m = parseInt(t.estimatedTime) || 0
    return sum + m
  }, 0)
  const computedPlannedHours = Math.round(plannedMinutes / 60 * 10) / 10 || 0

  const capacityHours = 8
  const workloadPct = capacityHours > 0 ? Math.round((computedPlannedHours / capacityHours) * 100) : 0
  const workloadColor = workloadPct > 90 ? "text-negative-text" : workloadPct > 70 ? "text-warning-text" : "text-positive-text"
  const workloadBg = workloadPct > 90 ? "bg-negative-text" : workloadPct > 70 ? "bg-warning-text" : "bg-positive-text"

  const pendingCount = tasks.filter((t) => t.status !== "done").length
  const maxBar = Math.max(1, ...weeklyBars.map((b) => Math.max(b.actual, b.estimated)))

  // Derive daily objectives from daily plan (filled by Daily Planning wizard)
  const { dailyPlan } = useProductivityStore()
  const dayObjectives = ((dailyPlan?.objectives || []) as string[])
    .filter(Boolean)
    .map((text) => ({ text, done: false }))

  return (
    <div className="flex-1 overflow-auto">
      {/* Top bar */}
      <div className="bg-white dark:bg-[#1A1D27] border-b border-[rgba(0,0,0,0.08)] px-6 py-3 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-[18px] font-semibold text-gray-900 dark:text-white m-0 tracking-[-0.02em]">
              {new Date().getHours() < 12 ? "Bom dia" : new Date().getHours() < 18 ? "Boa tarde" : "Boa noite"}, {profile.name?.split(" ")[0] || "Usuario"}
            </h1>
            <div className="text-[12px] text-gray-400 dark:text-white/50 mt-[1px]">
              {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}
            </div>
          </div>
          {/* Workload pill */}
          <div className="flex items-center gap-3 py-[6px] px-4 bg-gray-50 dark:bg-[#242836] rounded-md border border-[rgba(0,0,0,0.08)]">
            <span className="text-gray-400 dark:text-white/50"><IconClock size={14} /></span>
            <span className="text-[12px] font-medium text-gray-600 dark:text-white/70">Carga</span>
            <div className="w-20 h-[6px] bg-gray-200 rounded-[3px] overflow-hidden">
              <div className={cn("h-full rounded-[3px]", workloadBg)} style={{ width: `${workloadPct}%` }} />
            </div>
            <span className={cn("text-[12px] font-semibold font-mono tabular-nums", workloadColor)}>
              {computedPlannedHours}h/{capacityHours}h
            </span>
          </div>
        </div>
        {/* Day navigation */}
        <div className="flex items-center gap-2">
          <button className="py-[5px] px-[10px] rounded-sm border border-[rgba(0,0,0,0.08)] bg-white dark:bg-[#1A1D27] cursor-pointer text-[12px] text-gray-500 dark:text-white/60 flex items-center gap-1 hover:bg-gray-50 dark:hover:bg-white/5 dark:bg-[#242836] transition-colors duration-fast ease-out-expo">
            <IconChevronLeft size={14} /> Ontem
          </button>
          <span className="text-[12px] font-semibold text-brand-400 py-[5px] px-3 bg-brand-50 rounded-sm">Hoje</span>
          <button className="py-[5px] px-[10px] rounded-sm border border-[rgba(0,0,0,0.08)] bg-white dark:bg-[#1A1D27] cursor-pointer text-[12px] text-gray-500 dark:text-white/60 flex items-center gap-1 hover:bg-gray-50 dark:hover:bg-white/5 dark:bg-[#242836] transition-colors duration-fast ease-out-expo">
            Amanha <IconChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="p-6 flex flex-col gap-6 max-w-[1100px]">
        {/* ══════════ Planning Banner ══════════ */}
        {!planningDone && (
          <div className="bg-gradient-to-r from-brand-400 via-brand to-brand-800 rounded-md px-6 py-4 text-white flex items-center justify-between relative overflow-hidden">
            <div className="absolute -top-[30px] -right-[30px] w-[100px] h-[100px] rounded-full bg-white/[0.06]" />
            <div className="relative z-[1]">
              <div className="flex items-center gap-2 mb-1">
                <IconSun size={18} />
                <span className="text-[15px] font-semibold">Ritual de planejamento matinal</span>
              </div>
              <p className="text-[13px] opacity-80 m-0">10 min de planejamento recuperam ate 2h do seu dia.</p>
            </div>
            <div className="flex gap-2 relative z-[1] shrink-0">
              <button
                onClick={() => setPlanningDone(true)}
                className="h-9 px-5 rounded-sm border-none cursor-pointer text-[13px] font-semibold bg-white/20 text-white hover:bg-white/30 transition-colors duration-fast ease-out-expo"
              >
                Ja planejei
              </button>
              <button
                onClick={() => setShowDailyPlanning(true)}
                className="h-9 px-5 rounded-sm border-2 border-white/40 cursor-pointer text-[13px] font-semibold bg-white dark:bg-[#1A1D27] text-brand-400 hover:bg-gray-50 dark:hover:bg-white/5 dark:bg-[#242836] transition-colors duration-fast ease-out-expo"
              >
                Iniciar ritual
              </button>
            </div>
          </div>
        )}

        {/* ══════════ ZONA 1: Visão do Dia ══════════ */}
        <div>
          <SectionLabel>Visao do dia</SectionLabel>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Objetivos do dia */}
            <Card>
              <CardHeader
                icon={<IconFlag />}
                title="Objetivos do dia"
                right={<span className="text-[11px] text-gray-400 dark:text-white/50">Max 3</span>}
              />
              {dayObjectives.length === 0 ? (
                <div className="py-4 text-center text-[12px] text-gray-400 dark:text-white/50">
                  Nenhum objetivo definido. Inicie o planejamento diario.
                </div>
              ) : null}
              {dayObjectives.map((o, i) => (
                <div key={i} className={cn("flex items-center gap-3 py-3", i < 2 && "border-b border-gray-100 dark:border-white/10")}>
                  <div className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center",
                    o.done ? "bg-positive-text" : "border-2 border-brand-100"
                  )}>
                    {o.done && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span className={cn(
                    "text-sm font-medium",
                    o.done ? "text-gray-400 dark:text-white/50 line-through" : "text-gray-800 dark:text-white"
                  )}>
                    {o.text}
                  </span>
                </div>
              ))}
            </Card>

            {/* Calendário */}
            <Card>
              <CardHeader
                icon={<IconCalendar />}
                title="Calendario"
                right={<DSBadge type="brand">Google Cal</DSBadge>}
              />
              {calendarEvents.map((ev, i) => (
                <div key={i} className={cn("flex items-center gap-2 py-[6px]", i < calendarEvents.length - 1 && "border-b border-gray-50")}>
                  <div className="w-[3px] h-6 rounded-[2px] shrink-0" style={{ background: ev.color }} />
                  <span className="font-semibold text-gray-500 dark:text-white/60 font-mono text-[11px] min-w-9">{ev.time}</span>
                  <span className="flex-1 text-[13px] text-gray-600 dark:text-white/70">{ev.name}</span>
                </div>
              ))}
            </Card>
          </div>

          {/* Tarefas do dia */}
          <Card>
            <CardHeader
              icon={<IconCheck />}
              title="Tarefas do dia"
              right={<DSBadge type="warning">{pendingCount} pendentes</DSBadge>}
            />
            {/* Table header */}
            <div className="grid grid-cols-[16px_16px_minmax(0,1fr)_70px_44px_28px_44px] gap-2 py-1 mb-[2px]">
              <span />
              <span />
              <span className="text-[10px] font-semibold text-gray-400 dark:text-white/50 uppercase">Tarefa</span>
              <span className="text-[10px] font-semibold text-gray-400 dark:text-white/50 uppercase text-center">Projeto</span>
              <span className="text-[10px] font-semibold text-gray-400 dark:text-white/50 uppercase text-center">Est.</span>
              <span className="text-[10px] font-semibold text-gray-400 dark:text-white/50 uppercase text-center">Resp</span>
              <span className="text-[10px] font-semibold text-gray-400 dark:text-white/50 uppercase text-right">Hora</span>
            </div>
            {tasks.length === 0 && (
              <div className="py-8 text-center">
                <p className="text-[12px] text-gray-400 dark:text-white/50 mb-2">Nenhuma tarefa para hoje</p>
                <a href="/admin/productivity/board" className="text-[12px] font-medium text-brand-400 hover:underline">
                  Criar tarefa no Board →
                </a>
              </div>
            )}
            {tasks.map((t) => {
              const isDone = t.status === "done"
              return (
                <div key={t.id}>
                  <div className="grid grid-cols-[16px_16px_minmax(0,1fr)_70px_44px_28px_44px] gap-2 py-[6px] border-t border-gray-100 dark:border-white/10 items-center">
                    <PriorityDot priority={t.priority} />
                    <Checkbox checked={isDone} />
                    <span className={cn(
                      "text-[13px] font-medium truncate",
                      isDone ? "text-gray-400 dark:text-white/50 line-through" : "text-gray-800 dark:text-white"
                    )}>
                      {t.name}
                    </span>
                    <span className="text-[10px] font-medium text-brand-400 text-center px-1 py-[2px] bg-brand-50 rounded-[3px] truncate">
                      {t.project}
                    </span>
                    <span className="text-[10px] font-medium text-gray-400 dark:text-white/50 font-mono text-center bg-gray-50 dark:bg-[#242836] rounded-[3px] px-1 py-[1px]">
                      {t.estimatedTime}
                    </span>
                    <div className="flex justify-center">
                      <Avatar initials={t.people[0]} size={20} />
                    </div>
                    <span className={cn(
                      "text-[11px] font-medium font-mono text-right",
                      isDone ? "text-positive-text" : "text-gray-400 dark:text-white/50"
                    )}>
                      {isDone ? "Feito" : t.time}
                    </span>
                  </div>
                  {/* Subtasks */}
                  {t.subtasks.map((sub) => (
                    <div key={sub.id} className="grid grid-cols-[16px_16px_minmax(0,1fr)_70px_44px_28px_44px] gap-2 py-1 pl-5">
                      <span />
                      <Checkbox checked={sub.done} />
                      <span className={cn("text-[12px]", sub.done ? "text-gray-400 dark:text-white/50 line-through" : "text-gray-600 dark:text-white/70")}>
                        {sub.name}
                      </span>
                      <span /><span /><span /><span />
                    </div>
                  ))}
                </div>
              )
            })}
          </Card>
        </div>

        {/* ══════════ ZONA 2: Produtividade ══════════ */}
        <div>
          <SectionLabel>Produtividade</SectionLabel>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Modo Foco (Timer) */}
            <Card>
              <CardHeader
                icon={<IconBolt />}
                title="Modo foco"
                right={<DSBadge type="positive">Pronto</DSBadge>}
              />
              {/* Current task */}
              {(() => {
                const firstPending = tasks.find((t) => t.status === "progress") || tasks.find((t) => t.status !== "done")
                if (!firstPending) return (
                  <div className="text-[12px] text-gray-400 dark:text-white/50 py-2 text-center">Nenhuma tarefa para focar</div>
                )
                return (
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-[#242836] rounded-sm mb-3 border border-gray-200 dark:border-white/10">
                    <PriorityDot priority={firstPending.priority} />
                    <span className="text-[12px] font-medium text-gray-700 dark:text-white/90 flex-1 truncate">{firstPending.name}</span>
                  </div>
                )
              })()}
              {/* Timer display */}
              <div className="flex items-center gap-6 mb-3">
                <div className="text-[44px] font-semibold font-mono text-gray-900 dark:text-white tracking-[-2px] leading-none tabular-nums">
                  {String(fm).padStart(2, "0")}:{String(fs).padStart(2, "0")}
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={toggleFocus}
                    className="flex items-center gap-[6px] h-8 px-4 rounded-sm border-none cursor-pointer text-[12px] font-semibold bg-brand-400 text-white hover:bg-brand transition-colors duration-fast ease-out-expo"
                  >
                    {focusRunning ? <IconPause size={13} /> : <IconPlay size={13} />}
                    {focusRunning ? "Pausar" : "Iniciar"}
                  </button>
                  <button
                    onClick={resetFocus}
                    className="h-[26px] rounded-sm border border-[rgba(0,0,0,0.08)] bg-white dark:bg-[#1A1D27] cursor-pointer text-[10px] text-gray-500 dark:text-white/60 flex items-center justify-center gap-1 hover:bg-gray-50 dark:hover:bg-white/5 dark:bg-[#242836] transition-colors duration-fast ease-out-expo"
                  >
                    <IconRefresh size={10} /> Reset
                  </button>
                </div>
              </div>
              {/* Timer presets */}
              <div className="flex gap-1">
                {["25 min", "Pausa 5m", "Longa 15m"].map((t, i) => (
                  <span
                    key={t}
                    className={cn(
                      "text-[10px] py-[2px] px-2 rounded-sm border",
                      i === 0
                        ? "border-brand-100 bg-brand-50 text-brand-400 font-medium"
                        : "border-[rgba(0,0,0,0.08)] bg-transparent text-gray-400 dark:text-white/50"
                    )}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </Card>

            {/* Gráfico Semanal */}
            <Card>
              <CardHeader
                icon={<IconChart />}
                title="Grafico semanal"
              />
              {/* Mini stats — computed from real data */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { v: String(tasks.filter((t) => t.status === "done").length), l: "Concluidas" },
                  { v: `${Math.round(weeklyBars.reduce((s, b) => s + b.actual, 0) / 60 * 10) / 10 || 0}h`, l: "Real" },
                  { v: `${Math.round(weeklyBars.reduce((s, b) => s + b.estimated, 0) / 60 * 10) / 10 || 0}h`, l: "Estimado" },
                ].map((m) => (
                  <div key={m.l} className="bg-gray-50 dark:bg-[#242836] rounded-sm p-2 text-center">
                    <div className="text-[20px] font-semibold text-gray-900 dark:text-white tabular-nums leading-none">{m.v}</div>
                    <div className="text-[10px] text-gray-400 dark:text-white/50 mt-[3px]">{m.l}</div>
                  </div>
                ))}
              </div>
              {/* Bar chart */}
              <div className="flex items-end gap-[6px] h-16">
                {weeklyBars.map((b) => (
                  <div key={b.label} className="flex-1 flex flex-col items-center gap-[3px]">
                    <div className="w-full flex gap-[2px] items-end justify-center h-[52px]">
                      <div
                        className="w-[40%] rounded-t-[3px] bg-gray-200"
                        style={{ height: `${(b.estimated / maxBar) * 48}px` }}
                      />
                      <div
                        className="w-[40%] rounded-t-[3px] opacity-80"
                        style={{
                          height: `${(b.actual / maxBar) * 48}px`,
                          background: b.actual > b.estimated ? "#065F46" : "#4E62D8",
                        }}
                      />
                    </div>
                    <span className="text-[9px] text-gray-400 dark:text-white/50">{b.label}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Board rápido */}
          <Card>
            <CardHeader
              icon={<IconDoc />}
              title="Board rapido"
              right={
                <span className="text-[12px] font-medium text-brand-400 cursor-pointer flex items-center gap-1 hover:underline">
                  Board <IconExtLink size={12} />
                </span>
              }
            />
            <div className="grid grid-cols-3 gap-3">
              {kanbanColumns.map((col) => (
                <div key={col.title} className="bg-gray-50 dark:bg-[#242836] rounded-md p-3">
                  <div className="flex justify-between mb-2">
                    <div className="flex items-center gap-[6px]">
                      <div className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                      <span className="text-[12px] font-semibold text-gray-700 dark:text-white/90">{col.title}</span>
                    </div>
                    <span className="text-[11px] font-semibold text-gray-400 dark:text-white/50 font-mono">{col.items.length}</span>
                  </div>
                  {col.items.map((item) => (
                    <div
                      key={item.text}
                      className={cn(
                        "bg-white dark:bg-[#1A1D27] border border-[rgba(0,0,0,0.08)] rounded-sm px-3 py-2 mb-1 flex justify-between",
                        col.title === "Concluidas" && "opacity-55"
                      )}
                    >
                      <div>
                        <div className="text-[12px] font-medium text-gray-700 dark:text-white/90">{item.text}</div>
                        <div className="text-[10px] text-gray-400 dark:text-white/50 mt-[2px]">{item.meta}</div>
                      </div>
                      <Avatar initials={item.avatar} size={18} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ══════════ ZONA 3: Crescimento ══════════ */}
        <div>
          <SectionLabel>Crescimento</SectionLabel>
          <div className="grid grid-cols-2 gap-4">
            {/* Metas do trimestre */}
            <Card>
              <CardHeader
                icon={<IconTarget />}
                title="Metas do trimestre"
                right={<DSBadge type="brand">Q{Math.ceil((new Date().getMonth() + 1) / 3)} {new Date().getFullYear()}</DSBadge>}
              />
              {goals.length === 0 && !showAddGoal && (
                <div className="py-6 text-center">
                  <p className="text-[12px] text-gray-400 dark:text-white/50 mb-2">Nenhuma meta definida</p>
                  <button onClick={() => setShowAddGoal(true)} className="text-[12px] font-medium text-brand-400 hover:underline bg-transparent border-none cursor-pointer">
                    + Adicionar meta
                  </button>
                </div>
              )}
              {showAddGoal && (
                <div className="py-3">
                  <input
                    value={newGoalName}
                    onChange={(e) => setNewGoalName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newGoalName.trim()) {
                        apiAction("create_goal" as string, { title: newGoalName.trim() })
                        setNewGoalName("")
                        setShowAddGoal(false)
                      }
                      if (e.key === "Escape") setShowAddGoal(false)
                    }}
                    placeholder="Nome da meta..."
                    className="w-full h-8 px-3 rounded-md border border-[rgba(0,0,0,0.08)] text-[12px] text-gray-700 dark:text-white/90 focus:outline-none focus:border-brand-400 mb-2"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (newGoalName.trim()) {
                          apiAction("create_goal" as string, { title: newGoalName.trim() })
                          setNewGoalName("")
                          setShowAddGoal(false)
                        }
                      }}
                      className="text-[10px] font-semibold bg-brand-400 text-white px-3 py-1 rounded-md border-none cursor-pointer"
                    >
                      Criar
                    </button>
                    <button onClick={() => setShowAddGoal(false)} className="text-[10px] text-gray-400 dark:text-white/50 bg-transparent border-none cursor-pointer">Cancelar</button>
                  </div>
                </div>
              )}
              {goals.map((g, i) => (
                <div key={g.name} className={cn("py-2", i < goals.length - 1 && "border-b border-gray-100 dark:border-white/10")}>
                  <div className="flex justify-between">
                    <span className="text-[13px] font-semibold text-gray-800 dark:text-white">{g.name}</span>
                    <span className="text-[12px] font-semibold font-mono" style={{ color: g.color }}>
                      {g.percentage}%
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400 dark:text-white/50 mt-[2px] mb-1">{g.current}</div>
                  <div className="h-[5px] bg-gray-100 dark:bg-[#242836] rounded-[3px] overflow-hidden">
                    <div className="h-full rounded-[3px]" style={{ width: `${g.percentage}%`, background: g.color }} />
                  </div>
                </div>
              ))}
            </Card>

            {/* Hábitos */}
            <Card>
              <CardHeader
                icon={<IconFire />}
                title="Habitos"
                right={habits.length > 0 ? <DSBadge type="positive">{Math.max(...habits.map(h => h.streak), 0)}d streak</DSBadge> : undefined}
              />
              {habits.length === 0 && !showAddHabit && (
                <div className="py-6 text-center">
                  <p className="text-[12px] text-gray-400 dark:text-white/50 mb-2">Nenhum habito cadastrado</p>
                  <button onClick={() => setShowAddHabit(true)} className="text-[12px] font-medium text-brand-400 hover:underline bg-transparent border-none cursor-pointer">
                    + Adicionar habito
                  </button>
                </div>
              )}
              {showAddHabit && (
                <div className="py-3">
                  <input
                    value={newHabitName}
                    onChange={(e) => setNewHabitName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newHabitName.trim()) {
                        apiAction("create_habit" as string, { name: newHabitName.trim() })
                        setNewHabitName("")
                        setShowAddHabit(false)
                      }
                      if (e.key === "Escape") setShowAddHabit(false)
                    }}
                    placeholder="Nome do habito..."
                    className="w-full h-8 px-3 rounded-md border border-[rgba(0,0,0,0.08)] text-[12px] text-gray-700 dark:text-white/90 focus:outline-none focus:border-brand-400 mb-2"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (newHabitName.trim()) {
                          apiAction("create_habit" as string, { name: newHabitName.trim() })
                          setNewHabitName("")
                          setShowAddHabit(false)
                        }
                      }}
                      className="text-[10px] font-semibold bg-brand-400 text-white px-3 py-1 rounded-md border-none cursor-pointer"
                    >
                      Criar
                    </button>
                    <button onClick={() => setShowAddHabit(false)} className="text-[10px] text-gray-400 dark:text-white/50 bg-transparent border-none cursor-pointer">Cancelar</button>
                  </div>
                </div>
              )}
              {habits.map((h, i) => (
                <div key={h.name} className={cn(i < habits.length - 1 && "mb-3")}>
                  <div className="flex justify-between mb-1">
                    <span className="text-[12px] font-medium text-gray-700 dark:text-white/90">{h.name}</span>
                    <span className="text-[11px] font-semibold text-positive-text font-mono">{h.streak}d</span>
                  </div>
                  <div className="grid grid-cols-7 gap-[3px]">
                    {h.days.map((d, di) => (
                      <div
                        key={di}
                        className={cn(
                          "aspect-square rounded-[3px]",
                          d === 1 ? "bg-positive-bg border border-positive-border" :
                          d === 2 ? "border-[1.5px] border-brand-400 bg-transparent" :
                          "bg-gray-100 dark:bg-[#242836]"
                        )}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </Card>
          </div>
        </div>

        {/* ══════════ Encerramento ══════════ */}
        <div className="bg-white dark:bg-[#1A1D27] rounded-md border border-[rgba(0,0,0,0.08)] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-gray-50 dark:bg-[#242836] flex items-center justify-center text-gray-400 dark:text-white/50">
              <IconMoon size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-800 dark:text-white">Ritual de encerramento</div>
              <div className="text-[12px] text-gray-400 dark:text-white/50">Revise, anote pendencias e planeje amanha.</div>
            </div>
          </div>
          <button
            onClick={() => setShowShutdown(true)}
            className="h-9 px-5 rounded-sm border border-indigo-200 dark:border-indigo-800/40 cursor-pointer text-[13px] font-medium bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors duration-fast ease-out-expo flex items-center gap-1.5"
          >
            <IconMoon size={14} />
            Reflexao do dia
          </button>
        </div>
      </div>

      {/* Daily Planning + Nightly Reflection modals */}
      <DailyPlanning open={showDailyPlanning} onClose={() => setShowDailyPlanning(false)} />
      <NightlyReflection open={showShutdown} onClose={() => setShowShutdown(false)} />
    </div>
  )
}
