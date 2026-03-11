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
    <div className="rounded-xl border border-border bg-card h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">
              {isOverviewRole ? "Onboardings" : `Seus ${PHASES.find((p) => p.id === allowedPhases?.[0])?.label || "Onboardings"}`}
            </CardTitle>
          </div>
          <span className="text-xs text-muted-foreground">{filtered.length} ativos</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Nenhum onboarding ativo</p>
        ) : (
          <>
            {/* Phase counts (overview role) */}
            {isOverviewRole && (
              <div className="space-y-1.5">
                {PHASES.map((phase) => {
                  const count = onboardings.filter((o) => {
                    if (o.current_phase) return o.current_phase === phase.id
                    if (phase.id === "pending_approval") return ["not_started", "in_progress", "paused"].includes(o.status)
                    return false
                  }).length
                  if (count === 0) return null
                  return (
                    <div key={phase.id} className="flex items-center justify-between text-xs">
                      <span>
                        <span className="mr-1.5">{phase.icon}</span>
                        {phase.label}
                      </span>
                      <span className="font-semibold text-foreground">{count}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Scoped role: list items */}
            {!isOverviewRole && filtered.slice(0, 4).map((o) => {
              const store = resolveRelation(o.store)
              return (
                <div key={o.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate text-foreground">{store?.store_name || "Loja"}</span>
                    <span className="text-muted-foreground">{o.progress_percent || 0}%</span>
                  </div>
                  <Progress value={o.progress_percent || 0} className="h-1.5" />
                </div>
              )
            })}

            {/* Average progress */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Progresso Médio</span>
                <span className="font-semibold text-foreground">{avgProgress}%</span>
              </div>
              <Progress value={avgProgress} className="h-1.5" />
            </div>

            {/* Near deadline */}
            {nearDeadline.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-warning">
                  <AlertTriangle className="h-3 w-3" />
                  <span className="font-medium">Próximos a vencer</span>
                </div>
                {nearDeadline.map((o) => {
                  const store = resolveRelation(o.store)
                  return (
                    <div key={o.id} className="flex items-center justify-between text-xs">
                      <span className="truncate text-foreground">{store?.store_name || "Loja"}</span>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{new Date(o.target_completion_date!).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
                        <span className="font-medium text-foreground">{o.progress_percent || 0}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        <Button variant="ghost" size="sm" className="w-full text-xs text-primary" asChild>
          <Link href="/onboarding">Ver Onboardings</Link>
        </Button>
      </CardContent>
    </div>
  )
}
