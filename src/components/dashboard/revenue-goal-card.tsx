"use client"

import { useState, useEffect } from "react"
import { Target, TrendingUp, TrendingDown, Loader2, Settings } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface RevenueGoalCardProps {
  currentRevenue: number
  isLoading?: boolean
}

export function RevenueGoalCard({ currentRevenue, isLoading }: RevenueGoalCardProps) {
  const [goal, setGoal] = useState<number>(0)
  const [goalLoading, setGoalLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editGoal, setEditGoal] = useState("")

  useEffect(() => {
    loadGoal()
  }, [])

  async function loadGoal() {
    setGoalLoading(true)
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "revenue_goal")
        .maybeSingle()

      if (data?.value) {
        setGoal(Number(data.value))
      }
    } catch {
      // ignore
    } finally {
      setGoalLoading(false)
    }
  }

  async function saveGoal() {
    const value = parseFloat(editGoal.replace(/[^\d.,]/g, "").replace(",", "."))
    if (isNaN(value) || value <= 0) return
    try {
      const supabase = createClient()
      await supabase
        .from("settings")
        .upsert(
          { key: "revenue_goal", value: value, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        )
      setGoal(value)
      setSettingsOpen(false)
    } catch {
      // ignore
    }
  }

  const percentage = goal > 0 ? Math.min((currentRevenue / goal) * 100, 100) : 0
  const remaining = goal > 0 ? Math.max(goal - currentRevenue, 0) : 0
  const isAchieved = currentRevenue >= goal && goal > 0
  const isOverAchieved = goal > 0 && currentRevenue > goal

  if (goalLoading || isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (goal === 0) {
    return (
      <>
        <button
          onClick={() => { setEditGoal(""); setSettingsOpen(true) }}
          className="rounded-xl border border-dashed border-border bg-card p-5 hover:bg-accent/50 transition-colors w-full text-left"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Definir Meta de Resultado</p>
              <p className="text-xs text-muted-foreground">Clique para configurar sua meta mensal</p>
            </div>
          </div>
        </button>
        <GoalDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          editGoal={editGoal}
          setEditGoal={setEditGoal}
          onSave={saveGoal}
        />
      </>
    )
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center",
              isAchieved ? "bg-success/10" : "bg-primary/10"
            )}>
              <Target className={cn("h-5 w-5", isAchieved ? "text-success" : "text-primary")} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Meta de Resultado</h3>
              <p className="text-xs text-muted-foreground">
                Meta: {formatCurrency(goal)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn(
              "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold",
              isAchieved
                ? "bg-success/10 text-success"
                : percentage >= 70
                  ? "bg-warning/10 text-warning"
                  : "bg-muted text-muted-foreground"
            )}>
              {isAchieved ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {percentage.toFixed(1)}%
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => { setEditGoal(goal.toString()); setSettingsOpen(true) }}
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-1000 ease-out",
                isOverAchieved
                  ? "bg-gradient-to-r from-success to-emerald-400"
                  : percentage >= 70
                    ? "bg-gradient-to-r from-warning to-amber-400"
                    : "bg-gradient-to-r from-primary to-convertfy-blue"
              )}
              style={{ width: `${percentage}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground font-semibold">
              {formatCurrency(currentRevenue)}
            </span>
            {!isAchieved && (
              <span className="text-muted-foreground">
                Faltam {formatCurrency(remaining)}
              </span>
            )}
            {isAchieved && (
              <span className="text-success font-medium">
                Meta atingida! +{formatCurrency(currentRevenue - goal)} acima
              </span>
            )}
          </div>
        </div>
      </div>

      <GoalDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        editGoal={editGoal}
        setEditGoal={setEditGoal}
        onSave={saveGoal}
      />
    </>
  )
}

function GoalDialog({
  open,
  onOpenChange,
  editGoal,
  setEditGoal,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editGoal: string
  setEditGoal: (v: string) => void
  onSave: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Definir Meta Mensal
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="goal-value" className="text-sm">Valor da meta (R$)</Label>
            <Input
              id="goal-value"
              type="text"
              placeholder="Ex: 500000"
              value={editGoal}
              onChange={(e) => setEditGoal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSave()}
            />
          </div>
          <Button onClick={onSave} className="w-full">
            Salvar Meta
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
