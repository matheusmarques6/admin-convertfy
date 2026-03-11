"use client"

import Link from "next/link"
import { LayoutGrid, AlertTriangle, Ban, ArrowRight } from "lucide-react"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface BoardPreviewProps {
  tasks: Array<{ id: string; status: string; due_date: string | null }>
}

const COLUMNS = [
  { status: "pending", label: "Pendente", color: "bg-slate-400 dark:bg-slate-500", darkBg: "dark:bg-slate-500/20" },
  { status: "in_progress", label: "Andamento", color: "bg-blue-500", darkBg: "dark:bg-blue-500/20" },
  { status: "blocked", label: "Bloqueado", color: "bg-red-500", darkBg: "dark:bg-red-500/20" },
  { status: "review", label: "Revisao", color: "bg-amber-500", darkBg: "dark:bg-amber-500/20" },
] as const

export function BoardPreview({ tasks }: BoardPreviewProps) {
  const now = new Date()

  const counts = COLUMNS.map((col) => ({
    ...col,
    count: tasks.filter((t) => t.status === col.status).length,
  }))

  const totalActive = counts.reduce((sum, c) => sum + c.count, 0)
  const overdue = tasks.filter(
    (t) => t.due_date && new Date(t.due_date) < now && t.status !== "completed" && t.status !== "cancelled"
  ).length
  const blocked = counts.find((c) => c.status === "blocked")?.count || 0

  const maxCount = Math.max(...counts.map((c) => c.count), 1)

  return (
    <div className="rounded-xl border border-border bg-card dark:bg-[#0f1419] dark:border-white/[0.08] h-full transition-all duration-200 hover:shadow-lg dark:hover:border-white/[0.12]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10 dark:bg-white/[0.08]">
              <LayoutGrid className="h-4 w-4 text-primary dark:text-white/70" />
            </div>
            <CardTitle className="text-sm font-semibold">Board</CardTitle>
          </div>
          <span className="text-xs text-muted-foreground px-2 py-1 rounded-full bg-muted/50 dark:bg-white/[0.05]">
            {totalActive} ativas
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Column counters */}
        <div className="grid grid-cols-4 gap-2">
          {counts.map((col) => (
            <div
              key={col.status}
              className={`text-center p-3 rounded-lg bg-muted/30 dark:bg-white/[0.03] transition-colors hover:bg-muted/50 dark:hover:bg-white/[0.06]`}
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{col.label}</p>
              <p className="text-2xl font-bold text-foreground">{col.count}</p>
              <div className="h-1 rounded-full bg-muted dark:bg-white/[0.1] overflow-hidden mt-2">
                <div
                  className={`h-full rounded-full ${col.color} transition-all duration-500`}
                  style={{ width: `${Math.max((col.count / maxCount) * 100, 8)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Alerts section */}
        {(overdue > 0 || blocked > 0) && (
          <div className="p-3 rounded-lg bg-muted/30 dark:bg-white/[0.03] space-y-2">
            {overdue > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <div className="p-1 rounded bg-warning/10">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                </div>
                <span className="text-warning font-medium">{overdue} {overdue === 1 ? "tarefa vencida" : "tarefas vencidas"}</span>
              </div>
            )}
            {blocked > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <div className="p-1 rounded bg-destructive/10">
                  <Ban className="h-3.5 w-3.5 text-destructive" />
                </div>
                <span className="text-destructive font-medium">{blocked} {blocked === 1 ? "tarefa bloqueada" : "tarefas bloqueadas"}</span>
              </div>
            )}
          </div>
        )}

        {/* Link */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground hover:text-primary group"
          asChild
        >
          <Link href="/board" className="flex items-center justify-center gap-1.5">
            Ver Board completo
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </CardContent>
    </div>
  )
}
