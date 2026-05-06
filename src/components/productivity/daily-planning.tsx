"use client"

import { useState, useCallback } from "react"
import { cn } from "@/lib/utils"
import { useProductivityStore } from "@/stores/productivity-store"
import {
  PriorityDot, Checkbox,
  IconClose, IconCheck, IconChevronRight, IconSun, IconFlag,
} from "./ds-atoms"

// ============================================================================
// Daily Planning — Overlay wizard de 3 passos
// ============================================================================

interface DailyPlanningProps {
  open: boolean
  onClose: () => void
}

export function DailyPlanning({ open, onClose }: DailyPlanningProps) {
  const [step, setStep] = useState(0)
  const { tasks, calendarEvents, setPlanningDone, apiAction } = useProductivityStore()

  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(
    new Set(tasks.filter((t) => t.status !== "done").map((t) => t.id))
  )
  const [objectives, setObjectives] = useState(["", "", ""])
  const [mood, setMood] = useState<string>("normal")

  const toggleTask = useCallback((id: string) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleFinish = useCallback(async () => {
    // Save daily plan to database
    await apiAction("save_daily_plan", {
      objectives: objectives.filter((o) => o.trim()),
      mood,
      tasks_planned: Array.from(selectedTasks),
    })
    setPlanningDone(true)
    onClose()
    setStep(0)
  }, [setPlanningDone, onClose, apiAction, objectives, mood, selectedTasks])

  if (!open) return null

  const steps = [
    { label: "Revisar tarefas", desc: "Selecione o que vai fazer hoje" },
    { label: "Definir objetivos", desc: "Max 3 objetivos para o dia" },
    { label: "Priorizar", desc: "Ordene por importancia" },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-[#1A1D27] rounded-[6px] w-full max-w-[640px] max-h-[85vh] flex flex-col border border-black/[0.06] dark:border-white/[0.08] shadow-[0_4px_12px_rgba(0,0,0,0.08)] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-brand-400 via-brand to-brand-800 px-6 py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2">
            <IconSun size={20} />
            <div>
              <div className="text-[16px] font-semibold">Planejamento do dia</div>
              <div className="text-[12px] opacity-70">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-sm flex items-center justify-center bg-white/20 text-white border-none cursor-pointer hover:bg-white/30 transition-colors duration-fast ease-out-expo"
          >
            <IconClose size={16} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 py-3 border-b border-[rgba(0,0,0,0.08)] flex gap-4 shrink-0">
          {steps.map((s, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-2 cursor-pointer transition-colors duration-fast ease-out-expo",
                i === step ? "text-brand-400" : i < step ? "text-positive-text" : "text-gray-400 dark:text-white/50"
              )}
              onClick={() => i <= step && setStep(i)}
            >
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0",
                i === step ? "bg-brand-400 text-white" :
                i < step ? "bg-positive-text text-white" :
                "bg-gray-100 dark:bg-[#242836] text-gray-400 dark:text-white/50"
              )}>
                {i < step ? <IconCheck size={12} /> : i + 1}
              </div>
              <div className="hidden sm:block">
                <div className="text-[12px] font-medium">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Step 1: Review tasks */}
          {step === 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-1">Como foi ontem?</h3>
              <p className="text-[12px] text-gray-400 dark:text-white/50 mb-4">Revise o que completou e o que ficou pendente.</p>

              {/* Mood selector */}
              <div className="flex gap-3 mb-5">
                {[
                  { id: "productive", label: "Produtivo", emoji: "😊" },
                  { id: "normal", label: "Normal", emoji: "😐" },
                  { id: "difficult", label: "Dificil", emoji: "😓" },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMood(m.id)}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-2 py-4 rounded-md border-2 cursor-pointer transition-all duration-fast ease-out-expo",
                      mood === m.id
                        ? "border-brand-400 bg-brand-50"
                        : "border-[rgba(0,0,0,0.08)] bg-white dark:bg-[#1A1D27] hover:bg-gray-50 dark:hover:bg-white/5 dark:bg-[#242836]"
                    )}
                  >
                    <span className="text-[24px]">{m.emoji}</span>
                    <span className={cn("text-[12px] font-medium", mood === m.id ? "text-brand-400" : "text-gray-600 dark:text-white/70")}>{m.label}</span>
                  </button>
                ))}
              </div>

              {/* Calendar preview */}
              <div className="mb-4 p-3 bg-gray-50 dark:bg-[#242836] rounded-md border border-gray-100 dark:border-white/10">
                <div className="text-[11px] font-semibold text-gray-400 dark:text-white/50 uppercase mb-2">Compromissos hoje</div>
                {calendarEvents.map((ev) => (
                  <div key={ev.id} className="flex items-center gap-2 py-[4px]">
                    <div className="w-[3px] h-5 rounded-[2px] shrink-0" style={{ background: ev.color }} />
                    <span className="text-[11px] font-semibold text-gray-500 dark:text-white/60 font-mono min-w-9">{ev.time}</span>
                    <span className="text-[12px] text-gray-600 dark:text-white/70">{ev.name}</span>
                  </div>
                ))}
              </div>

              {/* Task list */}
              <div className="text-[11px] font-semibold text-gray-400 dark:text-white/50 uppercase mb-2">Tarefas disponiveis</div>
              {tasks.filter((t) => t.status !== "done").map((t) => (
                <div
                  key={t.id}
                  onClick={() => toggleTask(t.id)}
                  className={cn(
                    "flex items-center gap-3 py-2 px-3 rounded-sm cursor-pointer border mb-1 transition-colors duration-fast ease-out-expo",
                    selectedTasks.has(t.id)
                      ? "bg-brand-50 border-brand-100"
                      : "bg-white dark:bg-[#1A1D27] border-gray-100 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 dark:bg-[#242836]"
                  )}
                >
                  <Checkbox checked={selectedTasks.has(t.id)} />
                  <PriorityDot priority={t.priority} />
                  <span className="flex-1 text-[13px] font-medium text-gray-800 dark:text-white">{t.name}</span>
                  <span className="text-[10px] text-gray-400 dark:text-white/50 font-mono">{t.estimatedTime}</span>
                </div>
              ))}
            </div>
          )}

          {/* Step 2: Define objectives */}
          {step === 1 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-1">{steps[1].label}</h3>
              <p className="text-[12px] text-gray-400 dark:text-white/50 mb-4">{steps[1].desc}</p>

              {objectives.map((obj, i) => (
                <div key={i} className="flex items-center gap-3 mb-3">
                  <div className="w-6 h-6 rounded-full border-2 border-brand-100 flex items-center justify-center text-[11px] font-semibold text-brand-400 shrink-0">
                    {i + 1}
                  </div>
                  <input
                    value={obj}
                    onChange={(e) => {
                      const next = [...objectives]
                      next[i] = e.target.value
                      setObjectives(next)
                    }}
                    placeholder={`Objetivo ${i + 1}`}
                    className="flex-1 h-9 px-3 rounded-sm border border-[rgba(0,0,0,0.08)] text-[13px] font-sans text-gray-700 dark:text-white/90 focus:outline-none focus:shadow-ring-brand"
                  />
                </div>
              ))}

              <div className="mt-4 p-3 bg-info-bg rounded-sm border border-info-border">
                <div className="text-[12px] text-info-text">
                  Defina ate 3 objetivos claros e alcancaveis. Cada objetivo deve poder ser concluido hoje.
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Prioritize */}
          {step === 2 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-1">{steps[2].label}</h3>
              <p className="text-[12px] text-gray-400 dark:text-white/50 mb-4">{steps[2].desc}</p>

              <div className="text-[11px] font-semibold text-gray-400 dark:text-white/50 uppercase mb-2">Resumo do dia</div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-gray-50 dark:bg-[#242836] rounded-sm p-3 text-center">
                  <div className="text-[20px] font-semibold text-gray-900 dark:text-white font-mono">{selectedTasks.size}</div>
                  <div className="text-[10px] text-gray-400 dark:text-white/50 mt-1">Tarefas</div>
                </div>
                <div className="bg-gray-50 dark:bg-[#242836] rounded-sm p-3 text-center">
                  <div className="text-[20px] font-semibold text-gray-900 dark:text-white font-mono">{calendarEvents.length}</div>
                  <div className="text-[10px] text-gray-400 dark:text-white/50 mt-1">Reunioes</div>
                </div>
                <div className="bg-gray-50 dark:bg-[#242836] rounded-sm p-3 text-center">
                  <div className="text-[20px] font-semibold text-gray-900 dark:text-white font-mono">
                    {objectives.filter((o) => o.trim()).length}
                  </div>
                  <div className="text-[10px] text-gray-400 dark:text-white/50 mt-1">Objetivos</div>
                </div>
              </div>

              {/* Selected tasks ordered */}
              <div className="text-[11px] font-semibold text-gray-400 dark:text-white/50 uppercase mb-2">Ordem de execucao</div>
              {tasks.filter((t) => selectedTasks.has(t.id)).map((t, i) => (
                <div key={t.id} className="flex items-center gap-3 py-2 px-3 bg-white dark:bg-[#1A1D27] border border-gray-100 dark:border-white/10 rounded-sm mb-1">
                  <span className="text-[11px] font-semibold text-gray-400 dark:text-white/50 font-mono w-4">{i + 1}</span>
                  <PriorityDot priority={t.priority} />
                  <span className="flex-1 text-[13px] font-medium text-gray-800 dark:text-white">{t.name}</span>
                  <span className="text-[10px] text-gray-400 dark:text-white/50 font-mono">{t.time !== "-" ? t.time : ""}</span>
                  <span className="text-[10px] text-gray-400 dark:text-white/50 font-mono bg-gray-50 dark:bg-[#242836] px-1 rounded-[3px]">{t.estimatedTime}</span>
                </div>
              ))}

              {/* Objectives */}
              {objectives.filter((o) => o.trim()).length > 0 && (
                <>
                  <div className="text-[11px] font-semibold text-gray-400 dark:text-white/50 uppercase mb-2 mt-4">Objetivos</div>
                  {objectives.filter((o) => o.trim()).map((obj, i) => (
                    <div key={i} className="flex items-center gap-2 py-1">
                      <IconFlag size={12} />
                      <span className="text-[13px] text-gray-700 dark:text-white/90">{obj}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[rgba(0,0,0,0.08)] flex justify-between shrink-0">
          <button
            onClick={() => step > 0 ? setStep(step - 1) : onClose()}
            className="h-9 px-4 rounded-sm border border-[rgba(0,0,0,0.08)] bg-white dark:bg-[#1A1D27] cursor-pointer text-[13px] font-medium text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/5 dark:bg-[#242836] transition-colors duration-fast ease-out-expo"
          >
            {step === 0 ? "Cancelar" : "Voltar"}
          </button>
          <button
            onClick={() => step < 2 ? setStep(step + 1) : handleFinish()}
            className="h-9 px-5 rounded-sm border-none cursor-pointer text-[13px] font-semibold bg-brand-400 text-white hover:bg-brand transition-colors duration-fast ease-out-expo flex items-center gap-1"
          >
            {step < 2 ? (
              <>Proximo <IconChevronRight size={14} /></>
            ) : (
              <>Concluir planejamento <IconCheck size={14} /></>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
