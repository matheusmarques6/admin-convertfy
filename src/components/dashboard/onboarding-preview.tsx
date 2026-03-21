"use client"

import Link from "next/link"
import { Rocket, Clock, AlertTriangle, ArrowRight } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
  { id: "pending_approval", label: "Aguardando Aprovacao", icon: "hourglass" },
  { id: "generating_copies", label: "Gerando Copies", icon: "pen" },
  { id: "design", label: "Design", icon: "palette" },
  { id: "implementation", label: "Implementacao", icon: "wrench" },
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
    <div className="rounded-xl border border-border bg-card h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Rocket className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm font-semibold">
              {isOverviewRole ? "Onboardings" : `Seus ${PHASES.find((p) => p.id === allowedPhases?.[0])?.label || "Onboardings"}`}
            </CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs font-medium">
            {filtered.length} ativos
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 flex-1 flex flex-col">
        {filtered.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground text-center py-4">
            Nenhum onboarding ativo
          </div>
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
                    <div key={phase.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/20">
                      <span className="text-muted-foreground">{phase.label}</span>
                      <span className="font-bold text-foreground">{count}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Scoped role: list items */}
            {!isOverviewRole && filtered.slice(0, 4).map((o) => {
              const store = resolveRelation(o.store)
              return (
                <div key={o.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate text-foreground font-medium">{store?.store_name || "Loja"}</span>
                    <span className="text-muted-foreground tabular-nums">{o.progress_percent || 0}%</span>
                  </div>
                  <Progress value={o.progress_percent || 0} className="h-1.5" />
                </div>
              )
            })}

            {/* Average progress */}
            <div className="space-y-1.5 p-3 rounded-xl bg-muted/20">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Progresso Medio</span>
                <span className="font-bold text-foreground">{avgProgress}%</span>
              </div>
              <Progress value={avgProgress} className="h-2" />
            </div>

            {/* Near deadline */}
            {nearDeadline.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="font-semibold">Proximos a vencer</span>
                </div>
                {nearDeadline.map((o) => {
                  const store = resolveRelation(o.store)
                  return (
                    <div key={o.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-warning/5">
                      <span className="truncate text-foreground">{store?.store_name || "Loja"}</span>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{new Date(o.target_completion_date!).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
                        <span className="font-semibold text-foreground">{o.progress_percent || 0}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        <div className="mt-auto pt-2">
          <Button variant="ghost" size="sm" className="w-full text-xs text-primary group" asChild>
            <Link href="/admin/onboarding">
              Ver Onboardings
              <ArrowRight className="h-3.5 w-3.5 ml-1 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </div>
  )
}
