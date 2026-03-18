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
    <div className="rounded-[24px] border border-border/60 bg-card h-full flex flex-col overflow-hidden relative group">
      <div className="absolute inset-0 bg-gradient-to-t from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
      
      <CardHeader className="pb-4 sm:pb-6 relative z-10 px-6 sm:px-8 pt-6 sm:pt-8 bg-background/50 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 border border-primary/20 group-hover:bg-primary group-hover:text-primary-foreground text-primary transition-colors">
              <Rocket className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold tracking-tight">
                {isOverviewRole ? "Onboardings" : `Seus ${PHASES.find((p) => p.id === allowedPhases?.[0])?.label || "Onboardings"}`}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} ativos</p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 px-6 sm:px-8 py-6 sm:py-8 relative z-10 flex-1 flex flex-col">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 opacity-50">
            <Rocket className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Nenhum onboarding ativo</p>
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
                    <div key={phase.id} className="flex flex-col gap-1 p-3 rounded-[16px] bg-background border border-border/50">
                      <span className="text-xs text-muted-foreground font-medium truncate flex items-center gap-1.5">
                        <span className="text-sm">{phase.icon}</span> {phase.label}
                      </span>
                      <span className="text-2xl font-black">{count}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Scoped role: list items */}
            {!isOverviewRole && (
              <div className="space-y-4">
                {filtered.slice(0, 4).map((o) => {
                  const store = resolveRelation(o.store)
                  return (
                    <div key={o.id} className="space-y-2 p-3 rounded-[16px] bg-background border border-border/40 hover:border-primary/30 transition-colors">
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate text-foreground font-semibold">{store?.store_name || "Loja"}</span>
                        <span className="text-primary font-bold">{o.progress_percent || 0}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all duration-1000 ease-out" style={{ width: `${o.progress_percent || 0}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Average progress */}
            <div className="space-y-2 p-4 rounded-[16px] bg-primary/5 border border-primary/10">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="font-semibold text-primary">Progresso Médio Geral</span>
                <span className="font-black text-primary text-lg">{avgProgress}%</span>
              </div>
              <div className="h-2 rounded-full bg-primary/20 overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all duration-1000 ease-out" style={{ width: `${avgProgress}%` }} />
              </div>
            </div>

            {/* Near deadline */}
            {nearDeadline.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-border/40">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-warning">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Próximos a vencer</span>
                </div>
                <div className="space-y-2">
                  {nearDeadline.map((o) => {
                    const store = resolveRelation(o.store)
                    return (
                      <div key={o.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-sm p-2 rounded-[12px] bg-warning/5 border border-warning/20">
                        <span className="truncate font-semibold">{store?.store_name || "Loja"}</span>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="flex items-center gap-1 text-muted-foreground bg-background px-2 py-0.5 rounded-md border border-border/50">
                            <Clock className="h-3 w-3" />
                            {new Date(o.target_completion_date!).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <Button variant="outline" size="sm" className="w-full text-xs rounded-xl border-border hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all font-medium mt-auto" asChild>
          <Link href="/onboarding">Ver Onboardings</Link>
        </Button>
      </CardContent>
    </div>
  )
}
