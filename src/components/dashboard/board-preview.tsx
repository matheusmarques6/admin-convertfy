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
    <div className="rounded-[24px] border border-border/60 bg-card h-full flex flex-col group relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
      
      <CardHeader className="pb-4 sm:pb-6 relative z-10 px-6 sm:px-8 pt-6 sm:pt-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 border border-primary/20 group-hover:bg-primary group-hover:text-primary-foreground text-primary transition-colors">
              <LayoutGrid className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold tracking-tight">Board de Tarefas</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">{totalActive} tarefas ativas</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="hidden sm:flex text-xs rounded-xl border-border hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all font-medium" asChild>
            <Link href="/board">Gerenciar</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 sm:space-y-8 flex-1 px-6 sm:px-8 pb-6 sm:pb-8 flex flex-col relative z-10">
        {/* Column counters - 8 column dominance */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
          {counts.map((col, idx) => (
            <div key={col.status} className="flex flex-col gap-2 p-4 rounded-[16px] bg-background border border-border/40 hover:border-border transition-colors">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground truncate">{col.label}</p>
                <div className={`w-2 h-2 rounded-full ${col.color}`} />
              </div>
              <p className="text-4xl sm:text-5xl font-black tracking-tighter text-foreground mt-1">{col.count}</p>
            </div>
          ))}
        </div>

        {/* Badges / Alerts */}
        <div className="flex items-center gap-3 mt-auto flex-wrap">
          {overdue > 0 && (
            <div className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-warning/10 text-warning border border-warning/20">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{overdue} {overdue === 1 ? "tarefa vencida" : "tarefas vencidas"}</span>
            </div>
          )}
          {blocked > 0 && (
            <div className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
              <Ban className="h-3.5 w-3.5" />
              <span>{blocked} {blocked === 1 ? "tarefa bloqueada" : "tarefas bloqueadas"}</span>
            </div>
          )}
          
          {overdue === 0 && blocked === 0 && (
            <div className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-success/10 text-success border border-success/20">
              <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span>Sem bloqueios graves</span>
            </div>
          )}
        </div>

        {/* Link for mobile */}
        <Button variant="outline" size="sm" className="w-full sm:hidden text-xs rounded-xl" asChild>
          <Link href="/board">Gerenciar Board</Link>
        </Button>
      </CardContent>
    </div>
  )
}
