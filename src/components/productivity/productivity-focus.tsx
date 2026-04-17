"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { useProductivityStore } from "@/stores/productivity-store"
import {
  IconPlay, IconPause, IconRefresh, IconTarget,
} from "./ds-atoms"

// ── Timer Ring SVG ──
function TimerRing({ percentage, size = 280, isBreak = false }: { percentage: number; size?: number; isBreak?: boolean }) {
  const r = (size - 12) / 2
  const c = 2 * Math.PI * r
  const offset = c - (Math.min(percentage, 100) / 100) * c
  const color = isBreak ? "#065F46" : "#4E62D8"
  const trackColor = isBreak ? "rgba(6,95,70,0.12)" : "rgba(78,98,216,0.12)"

  return (
    <svg width={size} height={size} className="shrink-0">
      {/* Track */}
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth="6" />
      {/* Progress */}
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={c} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-all duration-1000 ease-linear"
      />
      {/* Active dot */}
      {percentage > 0 && percentage < 100 && (
        <circle
          cx={size / 2 + r * Math.cos(((percentage / 100) * 360 - 90) * Math.PI / 180)}
          cy={size / 2 + r * Math.sin(((percentage / 100) * 360 - 90) * Math.PI / 180)}
          r="5" fill={color}
        />
      )}
    </svg>
  )
}

export function ProductivityFocus() {
  const {
    tasks, focusRunning, focusTime, focusBreak, focusSessionCount,
    toggleFocus, resetFocus, tickFocus, isLoaded, fetchData,
  } = useProductivityStore()

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showTaskPicker, setShowTaskPicker] = useState(false)
  const [category, setCategory] = useState<"productivity" | "studies" | "creative">("productivity")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isLoaded) fetchData()
  }, [isLoaded, fetchData])

  // Timer tick
  useEffect(() => {
    if (focusRunning && focusTime > 0) {
      timerRef.current = setInterval(tickFocus, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [focusRunning, focusTime, tickFocus])

  const totalSeconds = focusBreak ? 300 : 1500
  const percentage = ((totalSeconds - focusTime) / totalSeconds) * 100
  const minutes = Math.floor(focusTime / 60)
  const seconds = focusTime % 60

  const selectedTask = tasks.find((t) => t.id === selectedTaskId)
  const pendingTasks = tasks.filter((t) => t.status !== "done")

  const CATEGORIES = [
    { id: "productivity" as const, label: "Produtividade" },
    { id: "studies" as const, label: "Estudos" },
    { id: "creative" as const, label: "Criativo" },
  ]

  const PRESETS = [
    { label: "25 min", seconds: 1500 },
    { label: "Pausa 5m", seconds: 300 },
    { label: "Longa 15m", seconds: 900 },
  ]

  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const toggleFullscreen = () => {
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen()
      setIsFullscreen(true)
    } else if (document.fullscreenElement) {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [])

  return (
    <div ref={containerRef} className="flex-1 flex flex-col items-center justify-center bg-gray-900 min-h-screen relative overflow-hidden">
      {/* Fullscreen toggle */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-4 right-4 z-20 px-3 py-1.5 rounded-md border border-gray-700 bg-transparent text-gray-400 dark:text-white/50 text-[11px] font-medium cursor-pointer hover:bg-gray-800 hover:text-gray-300 transition-colors flex items-center gap-1.5"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {isFullscreen ? (
            <><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></>
          ) : (
            <><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></>
          )}
        </svg>
        {isFullscreen ? "Sair tela cheia" : "Tela cheia"}
      </button>

      {/* Subtle radial gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(78,98,216,0.08)_0%,transparent_70%)]" />

      <div className="relative z-10 flex flex-col items-center gap-8 max-w-[400px] w-full px-6">
        {/* Label */}
        <div className="text-center">
          <div className="text-[11px] font-semibold text-gray-400 dark:text-white/50 uppercase tracking-wider mb-1">
            {focusBreak ? "Pausa" : "Modo Foco"}
          </div>
          <div className="text-[12px] text-gray-500 dark:text-white/60">
            Sessao {focusSessionCount + 1}
          </div>
        </div>

        {/* Timer Ring */}
        <div className="relative">
          <TimerRing percentage={percentage} size={280} isBreak={focusBreak} />
          {/* Timer text overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-[64px] font-semibold text-white font-mono tracking-[-4px] leading-none tabular-nums">
              {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4">
          <button
            onClick={resetFocus}
            className="w-12 h-12 rounded-full border border-gray-700 bg-transparent text-gray-400 dark:text-white/50 flex items-center justify-center cursor-pointer hover:bg-gray-800 transition-colors"
          >
            <IconRefresh size={18} />
          </button>
          <button
            onClick={toggleFocus}
            className={cn(
              "w-[72px] h-[72px] rounded-full border-none flex items-center justify-center cursor-pointer transition-all",
              focusRunning
                ? "bg-gray-700 text-white hover:bg-gray-600"
                : "bg-[#4E62D8] text-white hover:bg-[#2137B6] shadow-[0_0_24px_rgba(78,98,216,0.4)]"
            )}
          >
            {focusRunning ? <IconPause size={28} /> : <IconPlay size={28} />}
          </button>
          <button
            onClick={() => setShowTaskPicker(!showTaskPicker)}
            className="w-12 h-12 rounded-full border border-gray-700 bg-transparent text-gray-400 dark:text-white/50 flex items-center justify-center cursor-pointer hover:bg-gray-800 transition-colors"
          >
            <IconTarget size={18} />
          </button>
        </div>

        {/* Category pills */}
        <div className="flex gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={cn(
                "text-[11px] py-[4px] px-3 rounded-full border cursor-pointer transition-colors",
                category === cat.id
                  ? "border-[#4E62D8] bg-[#4E62D8]/20 text-[#7B8CEA] font-medium"
                  : "border-gray-700 bg-transparent text-gray-500 dark:text-white/60 hover:border-gray-600"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Selected task / Select task prompt */}
        {selectedTask ? (
          <div className="w-full px-4 py-3 bg-gray-800 rounded-lg border border-gray-700 flex items-center gap-3">
            <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: "#4E62D8" }} />
            <span className="text-[12px] text-gray-300 flex-1 truncate">{selectedTask.name}</span>
            <button
              onClick={() => setShowTaskPicker(true)}
              className="text-[10px] text-[#7B8CEA] font-medium cursor-pointer bg-transparent border-none hover:underline"
            >
              Trocar
            </button>
            <button
              onClick={() => setSelectedTaskId(null)}
              className="text-[10px] text-gray-500 dark:text-white/60 cursor-pointer bg-transparent border-none hover:underline"
            >
              Remover
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowTaskPicker(!showTaskPicker)}
            className="w-full px-4 py-3 bg-gray-800 rounded-lg border border-dashed border-gray-600 text-[12px] text-gray-400 dark:text-white/50 cursor-pointer hover:bg-gray-750 hover:border-gray-500 transition-colors flex items-center justify-center gap-2"
          >
            <IconTarget size={14} /> Selecionar uma tarefa para focar
          </button>
        )}

        {/* Task picker dropdown */}
        {showTaskPicker && (
          <div className="w-full bg-gray-800 rounded-lg border border-gray-700 max-h-[200px] overflow-auto">
            <div className="p-2 text-[10px] font-semibold text-gray-500 dark:text-white/60 uppercase">Vincular tarefa</div>
            {pendingTasks.length === 0 ? (
              <div className="p-4 text-center text-[12px] text-gray-500 dark:text-white/60">Nenhuma tarefa pendente</div>
            ) : (
              pendingTasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setSelectedTaskId(t.id); setShowTaskPicker(false) }}
                  className="w-full text-left px-3 py-2 text-[12px] text-gray-300 hover:bg-gray-700 cursor-pointer bg-transparent border-none flex items-center gap-2 transition-colors"
                >
                  <span className="w-[5px] h-[5px] rounded-[2px] shrink-0" style={{ background: "#4E62D8" }} />
                  {t.name}
                </button>
              ))
            )}
          </div>
        )}

        {/* Presets */}
        <div className="flex gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                if (!focusRunning) {
                  useProductivityStore.setState({ focusTime: p.seconds, focusBreak: p.seconds < 1500 })
                }
              }}
              className={cn(
                "text-[10px] py-[3px] px-3 rounded-md border cursor-pointer transition-colors",
                focusTime === p.seconds
                  ? "border-[#4E62D8] bg-[#4E62D8]/20 text-[#7B8CEA] font-medium"
                  : "border-gray-700 bg-transparent text-gray-500 dark:text-white/60 hover:border-gray-600"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Session stats */}
        <div className="w-full grid grid-cols-3 gap-3 mt-4">
          {[
            { label: "Sessoes hoje", value: String(focusSessionCount) },
            { label: "Tempo total", value: `${Math.round(focusSessionCount * 25)}m` },
            { label: "Categoria", value: CATEGORIES.find(c => c.id === category)?.label || "" },
          ].map((s) => (
            <div key={s.label} className="bg-gray-800 rounded-lg p-3 text-center border border-gray-700/50">
              <div className="text-[16px] font-semibold text-white font-mono tabular-nums">{s.value}</div>
              <div className="text-[9px] text-gray-500 dark:text-white/60 mt-1 uppercase">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
