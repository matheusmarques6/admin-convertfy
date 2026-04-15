"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { useProductivityStore } from "@/stores/productivity-store"
import {
  Card, CardHeader, DSBadge,
  IconFire, IconPlus, IconCheck,
} from "./ds-atoms"

// ── Contribution grid cell ──
function GridCell({ level, color, isToday }: { level: number; color: string; isToday?: boolean }) {
  return (
    <div
      className={cn(
        "w-3 h-3 rounded-[3px] transition-transform hover:scale-125",
        level === 0 && !isToday && "bg-gray-100",
        isToday && level === 0 && "border-[1.5px] border-brand-400 bg-transparent",
      )}
      style={level > 0 ? { background: color, opacity: level === 1 ? 0.55 : 1 } : undefined}
    />
  )
}

export function ProductivityHabits() {
  const { habits, isLoaded, fetchData, checkedHabits, toggleHabitCheck } = useProductivityStore()
  const [showNewHabit, setShowNewHabit] = useState(false)
  const [newHabitName, setNewHabitName] = useState("")
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoaded) fetchData()
  }, [isLoaded, fetchData])

  const selectedHabit = habits.find((h) => h.id === selectedHabitId) || null

  // Calculate max streak across all habits
  const maxStreak = habits.reduce((max, h) => Math.max(max, h.streak), 0)

  return (
    <div className="flex-1 overflow-auto flex">
      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <header className="bg-white border-b border-[rgba(0,0,0,0.08)]">
          <div className="flex justify-between items-center px-6 py-4">
            <div className="flex items-center gap-3">
              <h1 className="text-[22px] font-semibold text-gray-900 m-0 tracking-[-0.02em]">Habitos</h1>
              <span className="bg-gray-100 text-gray-600 text-[11px] font-semibold px-[7px] py-[1px] rounded-full font-mono">{habits.length}</span>
            </div>
            <div className="flex items-center gap-2">
              {maxStreak > 0 && <DSBadge type="positive">{maxStreak}d streak</DSBadge>}
              <button
                onClick={() => setShowNewHabit(true)}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-md border-none cursor-pointer text-[13px] font-medium bg-brand-400 text-white hover:bg-brand transition-colors"
              >
                <IconPlus size={14} /> Novo habito
              </button>
            </div>
          </div>
        </header>

        <div className="p-6 max-w-[800px]">
          {/* New habit form */}
          {showNewHabit && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-[rgba(0,0,0,0.08)]">
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="text-[10px] font-semibold text-gray-400 uppercase block mb-1">Nome do habito</label>
                  <input
                    value={newHabitName}
                    onChange={(e) => setNewHabitName(e.target.value)}
                    placeholder="Ex: 30 min leitura"
                    className="w-full h-9 px-3 rounded-md border border-[rgba(0,0,0,0.08)] text-[13px] text-gray-700 focus:outline-none focus:border-brand-400 bg-white"
                    autoFocus
                  />
                </div>
                <button onClick={() => { setShowNewHabit(false); setNewHabitName("") }}
                  className="h-9 px-4 rounded-md border border-[rgba(0,0,0,0.08)] bg-white cursor-pointer text-[12px] text-gray-600 hover:bg-gray-50">
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    if (!newHabitName.trim()) return
                    setShowNewHabit(false)
                    setNewHabitName("")
                  }}
                  className="h-9 px-4 rounded-md border-none cursor-pointer text-[12px] font-semibold bg-brand-400 text-white hover:bg-brand">
                  Criar
                </button>
              </div>
            </div>
          )}

          {/* Today's checklist */}
          <Card className="mb-6">
            <CardHeader icon={<IconCheck />} title="Hoje" right={<DSBadge type="brand">{new Date().toLocaleDateString("pt-BR", { weekday: "long" })}</DSBadge>} />

            {habits.length === 0 ? (
              <div className="text-center py-8 text-[12px] text-gray-400">
                Nenhum habito cadastrado. Crie seu primeiro habito.
              </div>
            ) : (
              <div className="space-y-1">
                {habits.map((h) => {
                  const isChecked = checkedHabits.has(h.id)
                  return (
                    <div
                      key={h.id}
                      onClick={() => {
                        toggleHabitCheck(h.id)
                        setSelectedHabitId(h.id)
                      }}
                      className={cn(
                        "flex items-center gap-3 py-3 px-3 rounded-md cursor-pointer transition-all duration-fast",
                        isChecked ? "bg-[#ECFDF5]" : "hover:bg-gray-50"
                      )}
                    >
                      {/* Checkbox */}
                      <div className={cn(
                        "w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors",
                        isChecked ? "bg-[#065F46]" : "border-[1.5px] border-gray-300"
                      )}>
                        {isChecked && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>

                      {/* Color dot */}
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: h.color }} />

                      {/* Name */}
                      <span className={cn(
                        "flex-1 text-[13px] font-medium",
                        isChecked ? "text-gray-400 line-through" : "text-gray-800"
                      )}>
                        {h.name}
                      </span>

                      {/* Streak badge */}
                      {h.streak > 0 && (
                        <span className="text-[10px] font-semibold text-[#065F46] font-mono flex items-center gap-1">
                          <IconFire size={10} /> {h.streak}d
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Contribution grids (GitHub-style) */}
          {habits.map((h) => (
            <Card key={h.id} className="mb-4" onClick={() => setSelectedHabitId(h.id)}>
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: h.color }} />
                  <span className="text-[13px] font-semibold text-gray-800">{h.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-gray-400">Streak: <strong className="text-[#065F46] font-mono">{h.streak}d</strong></span>
                </div>
              </div>

              {/* 7-day grid */}
              <div className="flex gap-[3px]">
                {h.days.map((d, i) => (
                  <div key={i} className="flex-1">
                    <GridCell
                      level={d === 1 ? 2 : d === 2 ? 0 : 0}
                      color={h.color}
                      isToday={d === 2}
                    />
                    <div className="text-[8px] text-gray-400 text-center mt-1">
                      {["D", "S", "T", "Q", "Q", "S", "S"][i]}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {selectedHabit && (
        <div className="w-[340px] border-l border-[rgba(0,0,0,0.08)] bg-white p-6 overflow-auto shrink-0">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-[14px] font-semibold text-gray-800">{selectedHabit.name}</h3>
            <button onClick={() => setSelectedHabitId(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer bg-transparent border-none">
              ✕
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {[
              { label: "Streak atual", value: `${selectedHabit.streak}d` },
              { label: "Melhor streak", value: "—" },
              { label: "Total feitos", value: "—" },
              { label: "Taxa 7d", value: `${Math.round((selectedHabit.days.filter(d => d === 1).length / 7) * 100)}%` },
            ].map((s) => (
              <div key={s.label} className="bg-gray-50 rounded-md p-3 text-center">
                <div className="text-[18px] font-semibold text-gray-900 font-mono tabular-nums">{s.value}</div>
                <div className="text-[10px] text-gray-400 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Weekly distribution */}
          <div className="text-[11px] font-semibold text-gray-400 uppercase mb-2">Distribuicao semanal</div>
          <div className="flex items-end gap-1 h-16 mb-4">
            {["D", "S", "T", "Q", "Q", "S", "S"].map((day, i) => {
              const val = selectedHabit.days[i] === 1 ? 1 : 0
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-[3px]"
                    style={{
                      height: `${val * 48}px`,
                      background: val ? selectedHabit.color : "#F3F4F6",
                      minHeight: 4,
                    }}
                  />
                  <span className="text-[9px] text-gray-400">{day}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
