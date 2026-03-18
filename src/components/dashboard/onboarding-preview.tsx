"use client"

import Link from "next/link"
import { Rocket, Clock, AlertTriangle } from "lucide-react"
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
  { id: "pending_approval", label: "Aguardando Aprovação", icon: "⏳" },
  { id: "generating_copies", label: "Gerando Copies", icon: "✍️" },
  { id: "design", label: "Design", icon: "🎨" },
  { id: "implementation", label: "Implementação", icon: "🔧" },
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
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm h-full flex flex-col relative group">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Rocket className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {isOverviewRole ? "Onboardings" : `Seus ${PHASES.find((p) => p.id === allowedPhases?.[0])?.label || "Onboardings"}`}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} ativos</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
            <Rocket className="h-8 w-8 mb-3 opacity-20" />
            <p className="text-sm font-medium">Nenhum onboarding ativo</p>
          </div>
        ) : (
          <div className="space-y-6 flex-1">
            {/* Phase counts (overview role) */}
            {isOverviewRole && (
              <div className="grid grid-cols-2 gap-3">
                {PHASES.map((phase) => {
                  const count = onboardings.filter((o) => {
                    if (o.current_phase) return o.current_phase === phase.id
                    if (phase.id === "pending_approval") return ["not_started", "in_progress", "paused"].includes(o.status)
                    return false
                  }).length
                  if (count === 0) return null
                  return (
                    <div key={phase.id} className="flex flex-col gap-1 p-3 rounded-xl bg-background border border-border">
                      <span className="text-xs text-muted-foreground font-medium truncate flex items-center gap-1.5">
                        <span className="text-sm">{phase.icon}</span> {phase.label}
                      </span>
                      <span className="text-2xl font-bold">{count}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Scoped role: list items */}
            {!isOverviewRole && (
              <div className="space-y-3">
                {filtered.slice(0, 4).map((o) => {
                  const store = resolveRelation(o.store)
                  return (
                    <div key={o.id} className="flex flex-col gap-2 p-3 rounded-xl border border-border bg-background hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground truncate pr-4">{store?.store_name || "Loja"}</span>
                        <span className="text-sm font-bold text-primary shrink-0">{o.progress_percent || 0}%</span>
                      </div>
                      <div className="w-full bg-muted/50 rounded-full h-1.5 overflow-hidden flex">
                        <div 
                          className="h-full bg-primary rounded-full" 
                          style={{ width: `${o.progress_percent || 0}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Average progress */}
            <div className="space-y-2 p-4 rounded-xl bg-primary/5 border border-primary/10">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="font-medium text-primary">Progresso Médio Geral</span>
                <span className="font-bold text-primary text-base">{avgProgress}%</span>
              </div>
              <div className="w-full bg-primary/20 rounded-full h-1.5 overflow-hidden flex">
                <div 
                  className="h-full bg-primary rounded-full" 
                  style={{ width: `${avgProgress}%` }}
                />
              </div>
            </div>

            {/* Near deadline */}
            {nearDeadline.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-warning">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Próximos a vencer</span>
                </div>
                <div className="space-y-2">
                  {nearDeadline.map((o) => {
                    const store = resolveRelation(o.store)
                    return (
                      <div key={o.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-warning/5 border border-warning/20">
                        <span className="text-sm font-medium truncate">{store?.store_name || "Loja"}</span>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-background px-2 py-1 rounded-md border border-border shrink-0">
                          <Clock className="h-3 w-3" />
                          {new Date(o.target_completion_date!).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <Button variant="outline" className="w-full mt-auto" asChild>
          <Link href="/onboarding">Ver Onboardings</Link>
        </Button>
      </div>
    </div>
  )
}
