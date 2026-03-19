"use client"

import Link from "next/link"
import { LayoutGrid, AlertTriangle, Ban, ArrowRight } from "lucide-react"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface BoardPreviewProps {
  tasks: Array<{ id: string; status: string; due_date: string | null }>
}

const COLUMNS = [
  { status: "pending", label: "Pendente", color: "bg-slate-500" },
  { status: "in_progress", label: "Andamento", color: "bg-blue-500" },
  { status: "blocked", label: "Bloqueado", color: "bg-red-500" },
  { status: "review", label: "Revisao", color: "bg-amber-500" },
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
    <div className="rounded-xl border border-border bg-card h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <LayoutGrid className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm font-semibold">Board</CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs font-medium">
            {totalActive} ativas
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 flex-1 flex flex-col">
        {/* Column counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {counts.map((col) => (
            <div key={col.status} className="text-center space-y-1.5 sm:space-y-2 p-2 sm:p-2.5 rounded-xl bg-muted/30">
              <p className="text-[11px] text-muted-foreground font-medium">{col.label}</p>
              <p className="text-xl sm:text-2xl font-bold text-foreground tabular-nums">{col.count}</p>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${col.color} transition-all duration-500`}
                  style={{ width: `${(col.count / maxCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Badges */}
        <div className="space-y-1.5">
          {overdue > 0 && (
            <div className="flex items-center gap-2 text-xs text-warning p-2 rounded-lg bg-warning/5">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{overdue} {overdue === 1 ? "tarefa vencida" : "tarefas vencidas"}</span>
            </div>
          )}
          {blocked > 0 && (
            <div className="flex items-center gap-2 text-xs text-destructive p-2 rounded-lg bg-destructive/5">
              <Ban className="h-3.5 w-3.5" />
              <span>{blocked} {blocked === 1 ? "tarefa bloqueada" : "tarefas bloqueadas"}</span>
            </div>
          )}
        </div>

        {/* Link */}
        <div className="mt-auto pt-2">
          <Button variant="ghost" size="sm" className="w-full text-xs text-primary group" asChild>
            <Link href="/admin/board">
              Ver Board
              <ArrowRight className="h-3.5 w-3.5 ml-1 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </div>
  )
}
