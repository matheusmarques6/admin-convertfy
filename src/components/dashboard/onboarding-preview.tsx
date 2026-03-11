"use client"

import Link from "next/link"
import { Rocket, Clock, AlertTriangle, ArrowRight, Sparkles } from "lucide-react"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

interface OnboardingItem {
  id: string
  status: string
  current_phase: string | null
  progress_percent: number
  target_completion_date: string | null
  client?: { id: string; name: string } | { id: string; name: string }[] | null
  store?: { id: string; store_name: string } | { id: string; store_name: string }[] | null
}

interface OnboardingPreviewProps {
  onboardings: OnboardingItem[]
  userRole: string
}

const PHASES = [
  { id: "pending_approval", label: "Aguardando", icon: Clock, color: "text-slate-500 dark:text-slate-400", bg: "bg-slate-500/10 dark:bg-slate-500/20" },
  { id: "generating_copies", label: "Copies", icon: Sparkles, color: "text-purple-500 dark:text-purple-400", bg: "bg-purple-500/10 dark:bg-purple-500/20" },
  { id: "design", label: "Design", icon: Sparkles, color: "text-pink-500 dark:text-pink-400", bg: "bg-pink-500/10 dark:bg-pink-500/20" },
  { id: "implementation", label: "Dev", icon: Rocket, color: "text-blue-500 dark:text-blue-400", bg: "bg-blue-500/10 dark:bg-blue-500/20" },
] as const

const ROLE_PHASE_MAP: Record<string, string[]> = {
  copywriter: ["generating_copies"],
  designer: ["design"],
  developer: ["implementation"],
}

function resolveRelation<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null
  return Array.isArray(val) ? val[0] || null : val
}

export function OnboardingPreview({ onboardings, userRole }: OnboardingPreviewProps) {
  const allowedPhases = ROLE_PHASE_MAP[userRole]
  const isOverviewRole = !allowedPhases

  const filtered = allowedPhases
    ? onboardings.filter((o) => o.current_phase && allowedPhases.includes(o.current_phase))
    : onboardings

  const now = new Date()
  const avgProgress = filtered.length > 0
    ? Math.round(filtered.reduce((sum, o) => sum + (o.progress_percent || 0), 0) / filtered.length)
    : 0

  const nearDeadline = filtered
    .filter((o) => o.target_completion_date && new Date(o.target_completion_date) <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000))
    .sort((a, b) => new Date(a.target_completion_date!).getTime() - new Date(b.target_completion_date!).getTime())
    .slice(0, 3)

  return (
    <div className="rounded-xl border border-border bg-card dark:bg-[#0f1419] dark:border-white/[0.08] h-full transition-all duration-200 hover:shadow-lg dark:hover:border-white/[0.12]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 dark:bg-cyan-500/20">
              <Rocket className="h-4 w-4 text-cyan-500 dark:text-cyan-400" />
            </div>
            <CardTitle className="text-sm font-semibold">
              {isOverviewRole ? "Onboardings" : `Seus ${PHASES.find((p) => p.id === allowedPhases?.[0])?.label || "Onboardings"}`}
            </CardTitle>
          </div>
          <span className="text-xs text-muted-foreground px-2 py-1 rounded-full bg-muted/50 dark:bg-white/[0.05]">
            {filtered.length} ativos
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {filtered.length === 0 ? (
          <div className="py-6 text-center">
            <div className="p-3 rounded-full bg-muted/50 dark:bg-white/[0.05] w-fit mx-auto mb-3">
              <Rocket className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Nenhum onboarding ativo</p>
          </div>
        ) : (
          <>
            {/* Phase counts (overview role) */}
            {isOverviewRole && (
              <div className="grid grid-cols-4 gap-2">
                {PHASES.map((phase) => {
                  const Icon = phase.icon
                  const count = onboardings.filter((o) => {
                    if (o.current_phase) return o.current_phase === phase.id
                    if (phase.id === "pending_approval") return ["not_started", "in_progress", "paused"].includes(o.status)
                    return false
                  }).length
                  return (
                    <div
                      key={phase.id}
                      className="p-2.5 rounded-lg bg-muted/20 dark:bg-white/[0.03] text-center"
                    >
                      <div className={`w-fit mx-auto p-1.5 rounded-lg mb-1.5 ${phase.bg}`}>
                        <Icon className={`h-3.5 w-3.5 ${phase.color}`} />
                      </div>
                      <p className="text-lg font-bold text-foreground">{count}</p>
                      <p className="text-[10px] text-muted-foreground">{phase.label}</p>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Scoped role: list items */}
            {!isOverviewRole && filtered.slice(0, 4).map((o) => {
              const store = resolveRelation(o.store)
              return (
                <div key={o.id} className="p-3 rounded-lg bg-muted/20 dark:bg-white/[0.03] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate text-sm font-medium text-foreground">{store?.store_name || "Loja"}</span>
                    <span className="text-muted-foreground font-semibold">{o.progress_percent || 0}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted dark:bg-white/[0.1] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
                      style={{ width: `${o.progress_percent || 0}%` }}
                    />
                  </div>
                </div>
              )
            })}

            {/* Average progress */}
            <div className="p-3 rounded-lg bg-gradient-to-r from-cyan-500/5 to-blue-500/5 dark:from-cyan-500/10 dark:to-blue-500/10 border border-cyan-500/10 dark:border-cyan-500/20">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-muted-foreground font-medium">Progresso Medio</span>
                <span className="font-bold text-foreground text-lg">{avgProgress}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted dark:bg-white/[0.1] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
                  style={{ width: `${avgProgress}%` }}
                />
              </div>
            </div>

            {/* Near deadline */}
            {nearDeadline.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/10 dark:border-amber-500/20 space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="font-semibold">Proximos a vencer</span>
                </div>
                {nearDeadline.map((o) => {
                  const store = resolveRelation(o.store)
                  return (
                    <div key={o.id} className="flex items-center justify-between text-xs">
                      <span className="truncate text-foreground font-medium">{store?.store_name || "Loja"}</span>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{new Date(o.target_completion_date!).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
                        <span className="font-bold text-amber-600 dark:text-amber-400">{o.progress_percent || 0}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground hover:text-primary group"
          asChild
        >
          <Link href="/onboarding" className="flex items-center justify-center gap-1.5">
            Ver todos os Onboardings
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </CardContent>
    </div>
  )
}
