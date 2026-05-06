"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { cn } from "@/lib/utils"
import { useProductivityStore } from "@/stores/productivity-store"
import {
  IconPlay, IconPause, IconRefresh, IconTarget,
} from "./ds-atoms"

// ============================================================================
// Modo Foco — Pomodoro fullscreen com som ambiente + ciclos automaticos
// ============================================================================
//
// Pomodoro classico: 25min foco / 5min pausa curta / 4 ciclos / 15min pausa longa
//
// Features:
//   - Fullscreen (F ou botao)
//   - Som ambiente loopado (lo-fi/rain/cafe) opcional
//   - Notificacao audio + browser notification ao final do ciclo
//   - Ciclos auto-avancam (config opcional)
//   - Persiste sessao no DB via apiAction("start_focus") + apiAction("end_focus")
//   - Mantem contagem mesmo se aba ficar em background

const PRESETS = {
  focus: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
} as const

const AMBIENT_SOUNDS = [
  { id: "off", label: "Sem som", url: null },
  { id: "rain", label: "Chuva", url: "https://cdn.pixabay.com/audio/2022/03/24/audio_5d0d4c6c69.mp3" },
  { id: "lofi", label: "Lo-Fi", url: "https://cdn.pixabay.com/audio/2024/04/06/audio_3d6116ab47.mp3" },
  { id: "cafe", label: "Cafeteria", url: "https://cdn.pixabay.com/audio/2022/10/30/audio_e74cc16ed3.mp3" },
] as const

// ── Timer Ring SVG ──
function TimerRing({ percentage, size = 280, color = "#4E62D8" }: { percentage: number; size?: number; color?: string }) {
  const r = (size - 12) / 2
  const c = 2 * Math.PI * r
  const offset = c - (Math.min(percentage, 100) / 100) * c
  const trackColor = `${color}1F` // 12% alpha

  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth="6" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={c} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-all duration-1000 ease-linear"
      />
    </svg>
  )
}

// ── Beep sintetizado pra notificar fim de ciclo ──
function playBeep() {
  try {
    type AudioContextCtor = typeof AudioContext
    const w = window as unknown as Window & { webkitAudioContext?: AudioContextCtor }
    const Ctx = w.AudioContext || w.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
  } catch { /* sem audio context — ignora */ }
}

export function ProductivityFocus() {
  const {
    tasks, isLoaded, fetchData, apiAction,
  } = useProductivityStore()

  // Estado local do timer (nao usa o store global pra ter controle granular)
  const [phase, setPhase] = useState<"focus" | "shortBreak" | "longBreak">("focus")
  const [secondsLeft, setSecondsLeft] = useState(PRESETS.focus)
  const [running, setRunning] = useState(false)
  const [completedCycles, setCompletedCycles] = useState(0)
  const [autoStart, setAutoStart] = useState(true)

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showTaskPicker, setShowTaskPicker] = useState(false)
  const [category, setCategory] = useState<"productivity" | "studies" | "creative">("productivity")

  // Sessao no DB (id retornado pelo start_focus pra usar no end_focus)
  const sessionStartRef = useRef<{ id: string | null; startedAt: number; minutes: number } | null>(null)

  // Ambient sound
  const [ambientId, setAmbientId] = useState<typeof AMBIENT_SOUNDS[number]["id"]>("off")
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Fullscreen
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    if (!isLoaded) fetchData()
  }, [isLoaded, fetchData])

  // Timer tick — usa requestAnimationFrame com timestamp pra ser preciso
  // mesmo com tab em background (setInterval e throttled em background tabs).
  useEffect(() => {
    if (!running) return
    let rafId: number
    let lastTick = Date.now()
    const tick = () => {
      const now = Date.now()
      const elapsed = Math.floor((now - lastTick) / 1000)
      if (elapsed >= 1) {
        lastTick = now
        setSecondsLeft((s) => Math.max(0, s - elapsed))
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [running])

  // Quando o tempo zera, transiciona pra proxima fase
  useEffect(() => {
    if (secondsLeft > 0 || !running) return

    setRunning(false)
    playBeep()

    // Notificacao do browser (se permissao concedida)
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      const title = phase === "focus" ? "Foco concluido — hora da pausa" : "Pausa concluida — voltar ao foco"
      new Notification("Modo Foco", { body: title, silent: true })
    }

    // Persiste fim da sessao se for foco
    if (phase === "focus" && sessionStartRef.current) {
      const elapsedMin = Math.round((Date.now() - sessionStartRef.current.startedAt) / 60_000)
      apiAction("end_focus", {
        session_id: sessionStartRef.current.id,
        actual_minutes: elapsedMin,
      })
      sessionStartRef.current = null
    }

    // Decide proxima fase
    if (phase === "focus") {
      const next = completedCycles + 1
      setCompletedCycles(next)
      const isLong = next % 4 === 0
      const nextPhase = isLong ? "longBreak" : "shortBreak"
      setPhase(nextPhase)
      setSecondsLeft(PRESETS[nextPhase])
      if (autoStart) setTimeout(() => setRunning(true), 800)
    } else {
      setPhase("focus")
      setSecondsLeft(PRESETS.focus)
      if (autoStart) setTimeout(() => setRunning(true), 800)
    }
  }, [secondsLeft, running, phase, completedCycles, autoStart, apiAction])

  // Toca/pausa ambient sound conforme estado de running
  useEffect(() => {
    if (!audioRef.current) return
    if (running && ambientId !== "off") {
      audioRef.current.play().catch(() => {})
    } else {
      audioRef.current.pause()
    }
  }, [running, ambientId])

  // Pede permissao de notificacao na primeira interacao
  const requestNotifPermission = useCallback(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission()
    }
  }, [])

  // Acoes
  const handleToggle = useCallback(() => {
    requestNotifPermission()
    const newRunning = !running
    setRunning(newRunning)

    // Inicia sessao no DB se for o primeiro start de uma fase de foco
    if (newRunning && phase === "focus" && !sessionStartRef.current) {
      const minutes = Math.ceil(secondsLeft / 60)
      sessionStartRef.current = { id: null, startedAt: Date.now(), minutes }
      apiAction("start_focus", {
        task_id: selectedTaskId,
        duration_minutes: minutes,
        category,
      })
    }
  }, [running, phase, secondsLeft, selectedTaskId, category, apiAction, requestNotifPermission])

  const handleReset = useCallback(() => {
    setRunning(false)
    setSecondsLeft(PRESETS[phase])
    sessionStartRef.current = null
  }, [phase])

  const handleSkip = useCallback(() => {
    setSecondsLeft(0)
  }, [])

  const handleFullscreenToggle = useCallback(() => {
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen().catch(() => {})
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [])

  // Atalho F pra fullscreen, Espaco pra play/pause
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === " ") { e.preventDefault(); handleToggle() }
      if (e.key === "f" || e.key === "F") handleFullscreenToggle()
      if (e.key === "r" || e.key === "R") handleReset()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [handleToggle, handleFullscreenToggle, handleReset])

  // Computed
  const totalSeconds = PRESETS[phase]
  const percentage = ((totalSeconds - secondsLeft) / totalSeconds) * 100
  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60

  const phaseColor = phase === "focus" ? "#4E62D8" : phase === "shortBreak" ? "#10B981" : "#A855F7"
  const phaseLabel = phase === "focus" ? "Foco" : phase === "shortBreak" ? "Pausa Curta" : "Pausa Longa"
  const cycleInPhase = (completedCycles % 4) + 1

  const selectedTask = tasks.find((t) => t.id === selectedTaskId)
  const pendingTasks = tasks.filter((t) => t.status !== "done")

  const ambient = AMBIENT_SOUNDS.find((s) => s.id === ambientId)!

  return (
    <div ref={containerRef} className="flex-1 flex flex-col items-center justify-center bg-gray-900 min-h-screen relative overflow-hidden">
      {/* Audio element pra ambient sound */}
      {ambient.url && (
        <audio ref={audioRef} src={ambient.url} loop preload="none" />
      )}

      {/* Top controls */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        {/* Ambient picker */}
        <select
          value={ambientId}
          onChange={(e) => setAmbientId(e.target.value as typeof ambientId)}
          className="px-3 py-1.5 rounded-md border border-gray-700 bg-gray-800 text-gray-300 text-[11px] font-medium cursor-pointer hover:bg-gray-700 transition-colors"
          title="Som ambiente"
        >
          {AMBIENT_SOUNDS.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>

        {/* Auto-start toggle */}
        <button
          onClick={() => setAutoStart(!autoStart)}
          className={cn(
            "px-3 py-1.5 rounded-md border text-[11px] font-medium cursor-pointer transition-colors",
            autoStart
              ? "border-emerald-700 bg-emerald-900/30 text-emerald-300"
              : "border-gray-700 bg-transparent text-gray-400"
          )}
          title="Avanca automaticamente entre foco/pausa"
        >
          Auto {autoStart ? "ON" : "OFF"}
        </button>

        {/* Fullscreen */}
        <button
          onClick={handleFullscreenToggle}
          className="px-3 py-1.5 rounded-md border border-gray-700 bg-transparent text-gray-400 dark:text-white/50 text-[11px] font-medium cursor-pointer hover:bg-gray-800 transition-colors flex items-center gap-1.5"
          title="Atalho: F"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {isFullscreen ? (
              <><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></>
            ) : (
              <><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></>
            )}
          </svg>
          {isFullscreen ? "Sair" : "Tela cheia"}
        </button>
      </div>

      {/* Subtle radial gradient muda de cor por fase */}
      <div
        className="absolute inset-0 transition-colors duration-1000"
        style={{ background: `radial-gradient(ellipse at center, ${phaseColor}14 0%, transparent 70%)` }}
      />

      <div className="relative z-10 flex flex-col items-center gap-8 max-w-[440px] w-full px-6">
        {/* Phase label + cycle counter */}
        <div className="text-center">
          <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: `${phaseColor}` }}>
            {phaseLabel}
          </div>
          <div className="text-[12px] text-gray-500 dark:text-white/60">
            Ciclo {cycleInPhase}/4 · {completedCycles} sessoes hoje
          </div>
        </div>

        {/* Timer Ring */}
        <div className="relative">
          <TimerRing percentage={percentage} size={280} color={phaseColor} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-[64px] font-semibold text-white font-mono tracking-[-4px] leading-none tabular-nums">
              {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
            </div>
            {selectedTask && phase === "focus" && (
              <div className="text-[11px] text-gray-400 dark:text-white/50 mt-2 max-w-[220px] truncate text-center">
                {selectedTask.name}
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleReset}
            className="w-12 h-12 rounded-full border border-gray-700 bg-transparent text-gray-400 dark:text-white/50 flex items-center justify-center cursor-pointer hover:bg-gray-800 transition-colors"
            title="Reset (R)"
          >
            <IconRefresh size={18} />
          </button>
          <button
            onClick={handleToggle}
            style={{ backgroundColor: running ? "#374151" : phaseColor, boxShadow: running ? "none" : `0 0 24px ${phaseColor}66` }}
            className="w-[72px] h-[72px] rounded-full border-none flex items-center justify-center cursor-pointer transition-all text-white"
            title="Play/Pause (Espaco)"
          >
            {running ? <IconPause size={28} /> : <IconPlay size={28} />}
          </button>
          <button
            onClick={handleSkip}
            className="w-12 h-12 rounded-full border border-gray-700 bg-transparent text-gray-400 dark:text-white/50 flex items-center justify-center cursor-pointer hover:bg-gray-800 transition-colors text-[10px] font-medium"
            title="Pular fase"
          >
            Skip
          </button>
        </div>

        {/* Category pills */}
        <div className="flex gap-2">
          {[
            { id: "productivity" as const, label: "Produtividade" },
            { id: "studies" as const, label: "Estudos" },
            { id: "creative" as const, label: "Criativo" },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={cn(
                "text-[11px] py-[4px] px-3 rounded-full border cursor-pointer transition-colors",
                category === cat.id
                  ? "border-indigo-500 bg-indigo-500/20 text-indigo-300 font-medium"
                  : "border-gray-700 bg-transparent text-gray-500 dark:text-white/60 hover:border-gray-600"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Task picker */}
        {selectedTask ? (
          <div className="w-full px-4 py-3 bg-gray-800 rounded-lg border border-gray-700 flex items-center gap-3">
            <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: phaseColor }} />
            <span className="text-[12px] text-gray-300 flex-1 truncate">{selectedTask.name}</span>
            <button
              onClick={() => setShowTaskPicker(true)}
              className="text-[10px] text-indigo-300 font-medium cursor-pointer bg-transparent border-none hover:underline"
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
                  <span className="w-[5px] h-[5px] rounded-[2px] shrink-0" style={{ background: phaseColor }} />
                  {t.name}
                </button>
              ))
            )}
          </div>
        )}

        {/* Atalhos keyboard */}
        <div className="text-[10px] text-gray-500/60 dark:text-white/30 text-center space-y-0.5">
          <div><kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-400">Espaco</kbd> play/pause · <kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-400">R</kbd> reset · <kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-400">F</kbd> tela cheia</div>
        </div>
      </div>
    </div>
  )
}
