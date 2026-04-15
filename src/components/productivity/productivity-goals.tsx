"use client"

import { useEffect, useState } from "react"
import { useProductivityStore } from "@/stores/productivity-store"
import {
  Card, DSBadge, ProgressBar,
  IconTarget, IconPlus, IconChevronRight,
} from "./ds-atoms"

// ── Progress Circle SVG ──
function ProgressCircle({ percentage, size = 48, color = "#4E62D8" }: { percentage: number; size?: number; color?: string }) {
  const r = (size - 6) / 2
  const c = 2 * Math.PI * r
  const offset = c - (Math.min(percentage, 100) / 100) * c

  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3F4F6" strokeWidth="4" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={c} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-all duration-500"
      />
      <text x={size / 2} y={size / 2} textAnchor="middle" dy="0.35em"
        className="text-[11px] font-semibold font-mono fill-gray-700" style={{ fontFamily: "'Geist Mono', monospace" }}>
        {percentage}%
      </text>
    </svg>
  )
}

export function ProductivityGoals() {
  const { goals, isLoaded, fetchData } = useProductivityStore()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showNewGoal, setShowNewGoal] = useState(false)
  const [newGoalTitle, setNewGoalTitle] = useState("")

  useEffect(() => {
    if (!isLoaded) fetchData()
  }, [isLoaded, fetchData])

  // Get current quarter
  const now = new Date()
  const quarter = `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`

  // Summary KPIs
  const totalGoals = goals.length
  const avgProgress = totalGoals > 0 ? Math.round(goals.reduce((s, g) => s + g.percentage, 0) / totalGoals) : 0

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <header className="bg-white border-b border-[rgba(0,0,0,0.08)]">
        <div className="flex justify-between items-center px-6 py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-semibold text-gray-900 m-0 tracking-[-0.02em]">Metas & OKRs</h1>
            <span className="bg-gray-100 text-gray-600 text-[11px] font-semibold px-[7px] py-[1px] rounded-full font-mono">{totalGoals}</span>
          </div>
          <div className="flex items-center gap-2">
            <DSBadge type="brand">{quarter}</DSBadge>
            <button
              onClick={() => setShowNewGoal(true)}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-md border-none cursor-pointer text-[13px] font-medium bg-brand-400 text-white hover:bg-brand transition-colors"
            >
              <IconPlus size={14} /> Nova meta
            </button>
          </div>
        </div>
      </header>

      <div className="p-6 max-w-[900px]">
        {/* KPI Summary */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: "Progresso geral", value: `${avgProgress}%`, color: avgProgress >= 70 ? "#065F46" : avgProgress >= 40 ? "#92400E" : "#991B1B" },
            { label: "Objetivos", value: String(totalGoals), color: "#4E62D8" },
            { label: "Key Results", value: "—", color: "#4E62D8" },
            { label: "Dias restantes", value: String(Math.max(0, 90 - (now.getMonth() % 3) * 30 - now.getDate())), color: "#9CA3AF" },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] p-4 text-center">
              <div className="text-[24px] font-semibold font-mono tabular-nums" style={{ color: kpi.color }}>{kpi.value}</div>
              <div className="text-[11px] text-gray-400 mt-1">{kpi.label}</div>
            </div>
          ))}
        </div>

        {/* New goal form */}
        {showNewGoal && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-[rgba(0,0,0,0.08)]">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase block mb-1">Titulo da meta</label>
                <input
                  value={newGoalTitle}
                  onChange={(e) => setNewGoalTitle(e.target.value)}
                  placeholder="Ex: Faturar R$150k MRR"
                  className="w-full h-9 px-3 rounded-md border border-[rgba(0,0,0,0.08)] text-[13px] text-gray-700 focus:outline-none focus:border-brand-400 bg-white"
                  autoFocus
                />
              </div>
              <button
                onClick={() => { setShowNewGoal(false); setNewGoalTitle("") }}
                className="h-9 px-4 rounded-md border border-[rgba(0,0,0,0.08)] bg-white cursor-pointer text-[12px] text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (!newGoalTitle.trim()) return
                  // Would call apiAction to create goal
                  setShowNewGoal(false)
                  setNewGoalTitle("")
                }}
                className="h-9 px-4 rounded-md border-none cursor-pointer text-[12px] font-semibold bg-brand-400 text-white hover:bg-brand"
              >
                Criar
              </button>
            </div>
          </div>
        )}

        {/* Goals list */}
        {goals.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center mx-auto mb-3 text-gray-400">
              <IconTarget size={24} />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">Nenhuma meta definida</p>
            <p className="text-[12px] text-gray-400">Crie metas e key results para acompanhar o progresso do trimestre.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {goals.map((goal) => (
              <Card key={goal.name} className="cursor-pointer" onClick={() => setExpandedId(expandedId === goal.name ? null : goal.name)}>
                <div className="flex items-center gap-4">
                  <ProgressCircle percentage={goal.percentage} color={goal.color} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[14px] font-semibold text-gray-800 truncate">{goal.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[12px] text-gray-400">{goal.current}</span>
                      <div className="flex-1 max-w-[200px]">
                        <ProgressBar percentage={goal.percentage} color={goal.color} height={5} />
                      </div>
                      <span className="text-[12px] font-semibold font-mono tabular-nums" style={{ color: goal.color }}>
                        {goal.percentage}%
                      </span>
                    </div>
                  </div>
                  <IconChevronRight size={16} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
