"use client"

import Link from "next/link"
import { LayoutGrid, AlertTriangle, Ban } from "lucide-react"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface BoardPreviewProps {
  tasks: Array<{ id: string; status: string; due_date: string | null }>
}

const COLUMNS = [
  { status: "pending", label: "Pendente", color: "bg-slate-500" },
  { status: "in_progress", label: "Andamento", color: "bg-blue-500" },
  { status: "blocked", label: "Bloqueado", color: "bg-red-500" },
  { status: "review", label: "Revisão", color: "bg-amber-500" },
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
    <div className="rounded-xl border border-border bg-card h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Board</CardTitle>
          </div>
          <span className="text-xs text-muted-foreground">{totalActive} tarefas ativas</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Column counters */}
        <div className="grid grid-cols-4 gap-3">
          {counts.map((col) => (
            <div key={col.status} className="text-center space-y-1.5">
              <p className="text-xs text-muted-foreground truncate">{col.label}</p>
              <p className="text-xl font-bold text-foreground">{col.count}</p>
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
            <div className="flex items-center gap-2 text-xs text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{overdue} {overdue === 1 ? "tarefa vencida" : "tarefas vencidas"}</span>
            </div>
          )}
          {blocked > 0 && (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <Ban className="h-3.5 w-3.5" />
              <span>{blocked} {blocked === 1 ? "tarefa bloqueada" : "tarefas bloqueadas"}</span>
            </div>
          )}
        </div>

        {/* Link */}
        <Button variant="ghost" size="sm" className="w-full text-xs text-primary" asChild>
          <Link href="/board">Ver Board</Link>
        </Button>
      </CardContent>
    </div>
  )
}
