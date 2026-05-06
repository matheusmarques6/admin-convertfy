"use client"

import { useState, useCallback } from "react"
import { cn } from "@/lib/utils"
import { useProductivityStore } from "@/stores/productivity-store"
import {
  IconClose, IconCheck, IconChevronRight, IconMoon, IconFlag, IconTarget,
} from "./ds-atoms"

// ============================================================================
// Nightly Reflection — Wizard de fim de dia (Modo Caverna shutdown ritual)
// ============================================================================
//
// 4 steps:
//   1. Wins do dia (3 conquistas)
//   2. Aprendizados (lessons learned)
//   3. Gratidao (3 coisas que sou grato)
//   4. Plano amanha (3 prioridades)
//
// Salva via apiAction("shutdown_day", { tomorrow_priorities, ... })
// — backend ja existe em /api/productivity (action shutdown_day).

interface NightlyReflectionProps {
  open: boolean
  onClose: () => void
}

export function NightlyReflection({ open, onClose }: NightlyReflectionProps) {
  const [step, setStep] = useState(0)
  const { tasks, dailyPlan, apiAction, setShowShutdown } = useProductivityStore()

  const [wins, setWins] = useState<string[]>(["", "", ""])
  const [lessons, setLessons] = useState("")
  const [gratitude, setGratitude] = useState<string[]>(["", "", ""])
  const [tomorrowPriorities, setTomorrowPriorities] = useState<string[]>(["", "", ""])
  const [energy, setEnergy] = useState<"high" | "medium" | "low">("medium")
  const [saving, setSaving] = useState(false)

  // Stats do dia computadas das tasks
  const completedToday = tasks.filter((t) => t.status === "done").length
  const pendingToday = tasks.filter((t) => t.status !== "done").length
  const objectivesPlanned = (dailyPlan?.objectives || []).length

  const handleFinish = useCallback(async () => {
    setSaving(true)
    try {
      // Backend espera tomorrow_priorities como array — concatenamos com
      // o resto da reflexao no campo (estrutura simples por enquanto).
      const reflection = {
        wins: wins.filter(Boolean),
        lessons: lessons.trim(),
        gratitude: gratitude.filter(Boolean),
        tomorrow_priorities: tomorrowPriorities.filter(Boolean),
        energy,
        completed_count: completedToday,
        pending_count: pendingToday,
      }
      await apiAction("shutdown_day", {
        tomorrow_priorities: tomorrowPriorities.filter(Boolean).join("\n"),
        // Backend ainda nao persiste os campos extras, mas mandamos pra
        // log/auditoria. Migration futura pra coluna jsonb.
        reflection,
      })
      setShowShutdown(false)
      onClose()
      setStep(0)
    } finally {
      setSaving(false)
    }
  }, [
    apiAction, setShowShutdown, onClose,
    wins, lessons, gratitude, tomorrowPriorities, energy,
    completedToday, pendingToday,
  ])

  if (!open) return null

  const steps = [
    { label: "Wins", desc: "O que voce conquistou hoje" },
    { label: "Aprendizados", desc: "O que aprendeu" },
    { label: "Gratidao", desc: "Pelo que e grato hoje" },
    { label: "Amanha", desc: "Top 3 prioridades" },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative bg-white dark:bg-[#1A1D27] rounded-lg w-full max-w-[640px] max-h-[85vh] flex flex-col shadow-lg overflow-hidden">
        {/* Header — gradiente noturno (azul escuro pra roxo) */}
        <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 px-6 py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2">
            <IconMoon size={20} />
            <div>
              <div className="text-[16px] font-semibold">Reflexao do dia</div>
              <div className="text-[12px] opacity-70">
                {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" })}
                {" · "}
                {completedToday} concluidas · {pendingToday} pendentes
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-sm flex items-center justify-center bg-white/20 text-white border-none cursor-pointer hover:bg-white/30 transition-colors"
          >
            <IconClose size={16} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 py-3 border-b border-[rgba(0,0,0,0.08)] flex gap-3 shrink-0 overflow-x-auto">
          {steps.map((s, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-2 cursor-pointer shrink-0 transition-colors",
                i === step ? "text-indigo-500" : i < step ? "text-positive-text" : "text-gray-400 dark:text-white/50"
              )}
              onClick={() => i <= step && setStep(i)}
            >
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0",
                i === step ? "bg-indigo-500 text-white" :
                i < step ? "bg-positive-text text-white" :
                "bg-gray-100 dark:bg-[#242836] text-gray-400 dark:text-white/50"
              )}>
                {i < step ? <IconCheck size={12} /> : i + 1}
              </div>
              <span className="text-[12px] font-medium hidden sm:block">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Step 1: Wins */}
          {step === 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-1">3 conquistas de hoje</h3>
              <p className="text-[12px] text-gray-400 dark:text-white/50 mb-4">
                Liste o que voce realizou — grandes ou pequenos.
                {objectivesPlanned > 0 && ` Voce planejou ${objectivesPlanned} objetivo${objectivesPlanned > 1 ? 's' : ''}.`}
              </p>

              {wins.map((win, i) => (
                <div key={i} className="flex items-center gap-3 mb-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-700/40 flex items-center justify-center text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                    {i + 1}
                  </div>
                  <input
                    value={win}
                    onChange={(e) => {
                      const next = [...wins]
                      next[i] = e.target.value
                      setWins(next)
                    }}
                    placeholder={`Conquista ${i + 1}`}
                    className="flex-1 h-9 px-3 rounded-sm border border-[rgba(0,0,0,0.08)] bg-white dark:bg-[#242836] dark:border-white/10 text-[13px] text-gray-700 dark:text-white/90 focus:outline-none focus:border-emerald-400"
                  />
                </div>
              ))}

              {/* Energy mood */}
              <div className="mt-5">
                <div className="text-[11px] font-semibold text-gray-400 dark:text-white/50 uppercase mb-2">Como esta sua energia agora?</div>
                <div className="flex gap-3">
                  {[
                    { id: "high" as const, label: "Energizado", emoji: "⚡" },
                    { id: "medium" as const, label: "OK", emoji: "🌤️" },
                    { id: "low" as const, label: "Cansado", emoji: "😴" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setEnergy(m.id)}
                      className={cn(
                        "flex-1 flex flex-col items-center gap-2 py-3 rounded-md border-2 cursor-pointer transition-all",
                        energy === m.id
                          ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20"
                          : "border-[rgba(0,0,0,0.08)] dark:border-white/10 bg-white dark:bg-[#242836] hover:bg-gray-50 dark:hover:bg-white/5"
                      )}
                    >
                      <span className="text-[20px]">{m.emoji}</span>
                      <span className={cn("text-[11px] font-medium", energy === m.id ? "text-indigo-500" : "text-gray-600 dark:text-white/70")}>
                        {m.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Lessons */}
          {step === 1 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-1">O que voce aprendeu hoje?</h3>
              <p className="text-[12px] text-gray-400 dark:text-white/50 mb-4">
                Insights, descobertas, erros que viraram aprendizado. Texto livre.
              </p>

              <textarea
                value={lessons}
                onChange={(e) => setLessons(e.target.value)}
                placeholder="Hoje aprendi que..."
                rows={8}
                className="w-full px-3 py-2 rounded-sm border border-[rgba(0,0,0,0.08)] bg-white dark:bg-[#242836] dark:border-white/10 text-[13px] text-gray-700 dark:text-white/90 focus:outline-none focus:border-indigo-400 resize-none font-sans"
              />

              <div className="mt-4 p-3 bg-info-bg rounded-sm border border-info-border">
                <div className="text-[12px] text-info-text">
                  Reflexoes diarias acumulam — releia depois de 30/60/90 dias pra ver padroes.
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Gratitude */}
          {step === 2 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-1">3 coisas pelas quais voce e grato hoje</h3>
              <p className="text-[12px] text-gray-400 dark:text-white/50 mb-4">
                Pessoas, momentos, oportunidades. Pratica simples que muda o foco.
              </p>

              {gratitude.map((g, i) => (
                <div key={i} className="flex items-center gap-3 mb-3">
                  <div className="w-7 h-7 rounded-full bg-amber-50 border border-amber-200 dark:bg-amber-900/30 dark:border-amber-700/40 flex items-center justify-center text-[14px] shrink-0">
                    🙏
                  </div>
                  <input
                    value={g}
                    onChange={(e) => {
                      const next = [...gratitude]
                      next[i] = e.target.value
                      setGratitude(next)
                    }}
                    placeholder={`Sou grato por...`}
                    className="flex-1 h-9 px-3 rounded-sm border border-[rgba(0,0,0,0.08)] bg-white dark:bg-[#242836] dark:border-white/10 text-[13px] text-gray-700 dark:text-white/90 focus:outline-none focus:border-amber-400"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Step 4: Tomorrow */}
          {step === 3 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-1">Top 3 prioridades de amanha</h3>
              <p className="text-[12px] text-gray-400 dark:text-white/50 mb-4">
                Decida agora pra abrir o dia ja sabendo o que fazer.
              </p>

              {tomorrowPriorities.map((p, i) => (
                <div key={i} className="flex items-center gap-3 mb-3">
                  <div className="w-7 h-7 rounded-full bg-indigo-50 border border-indigo-200 dark:bg-indigo-900/30 dark:border-indigo-700/40 flex items-center justify-center text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
                    {i + 1}
                  </div>
                  <input
                    value={p}
                    onChange={(e) => {
                      const next = [...tomorrowPriorities]
                      next[i] = e.target.value
                      setTomorrowPriorities(next)
                    }}
                    placeholder={`Prioridade ${i + 1}`}
                    className="flex-1 h-9 px-3 rounded-sm border border-[rgba(0,0,0,0.08)] bg-white dark:bg-[#242836] dark:border-white/10 text-[13px] text-gray-700 dark:text-white/90 focus:outline-none focus:border-indigo-400"
                  />
                </div>
              ))}

              {/* Resumo */}
              <div className="mt-5 grid grid-cols-3 gap-3">
                <div className="bg-gray-50 dark:bg-[#242836] rounded-sm p-3 text-center">
                  <div className="text-[20px] font-semibold text-emerald-500 font-mono">
                    {wins.filter(Boolean).length}
                  </div>
                  <div className="text-[10px] text-gray-400 dark:text-white/50 mt-1 uppercase">Wins</div>
                </div>
                <div className="bg-gray-50 dark:bg-[#242836] rounded-sm p-3 text-center">
                  <div className="text-[20px] font-semibold text-amber-500 font-mono">
                    {gratitude.filter(Boolean).length}
                  </div>
                  <div className="text-[10px] text-gray-400 dark:text-white/50 mt-1 uppercase">Gratidao</div>
                </div>
                <div className="bg-gray-50 dark:bg-[#242836] rounded-sm p-3 text-center">
                  <div className="text-[20px] font-semibold text-indigo-500 font-mono">
                    {tomorrowPriorities.filter(Boolean).length}
                  </div>
                  <div className="text-[10px] text-gray-400 dark:text-white/50 mt-1 uppercase">Amanha</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[rgba(0,0,0,0.08)] flex justify-between shrink-0">
          <button
            onClick={() => step > 0 ? setStep(step - 1) : onClose()}
            disabled={saving}
            className="h-9 px-4 rounded-sm border border-[rgba(0,0,0,0.08)] dark:border-white/10 bg-white dark:bg-[#1A1D27] cursor-pointer text-[13px] font-medium text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            {step === 0 ? "Cancelar" : "Voltar"}
          </button>
          <button
            onClick={() => step < 3 ? setStep(step + 1) : handleFinish()}
            disabled={saving}
            className="h-9 px-5 rounded-sm border-none cursor-pointer text-[13px] font-semibold bg-indigo-500 text-white hover:bg-indigo-600 transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            {step < 3 ? (
              <>Proximo <IconChevronRight size={14} /></>
            ) : saving ? (
              <>Salvando...</>
            ) : (
              <>Encerrar dia <IconCheck size={14} /></>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
