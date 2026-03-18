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
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LayoutGrid className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Board de Tarefas</h2>
            <p className="text-sm text-muted-foreground">{totalActive} tarefas ativas</p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/board">Gerenciar</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
        {counts.map((col) => (
          <div key={col.status} className="flex flex-col gap-1 p-4 rounded-xl border border-border bg-background">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{col.label}</span>
              <div className={`w-2 h-2 rounded-full ${col.color}`} />
            </div>
            <p className="text-3xl font-bold tracking-tight text-foreground">{col.count}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border/50 flex-wrap">
        {overdue > 0 && (
          <div className="flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full bg-warning/10 text-warning">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{overdue} {overdue === 1 ? "tarefa vencida" : "tarefas vencidas"}</span>
          </div>
        )}
        {blocked > 0 && (
          <div className="flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full bg-destructive/10 text-destructive">
            <Ban className="h-3.5 w-3.5" />
            <span>{blocked} {blocked === 1 ? "tarefa bloqueada" : "tarefas bloqueadas"}</span>
          </div>
        )}
        
        {overdue === 0 && blocked === 0 && (
          <div className="flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full bg-success/10 text-success">
            <div className="h-1.5 w-1.5 rounded-full bg-success" />
            <span>Tudo sob controle</span>
          </div>
        )}
      </div>
    </div>
  )
}
