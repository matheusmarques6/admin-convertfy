"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import {
  ListTodo,
  ChevronRight,
  ChevronDown,
  Circle,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Ban,
  ArrowRight,
  Loader2,
} from "lucide-react"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"

interface TaskItem {
  id: string
  title: string
  status: string
  priority: string
  type: string
  due_date: string | null
  assignee?: { profile?: { name: string } | null } | null
  client?: { name: string } | null
  store?: { store_name: string } | null
}

const STATUS_CONFIG = {
  pending: { label: "Pendente", icon: Circle, color: "text-slate-400", bg: "bg-slate-400" },
  in_progress: { label: "Em andamento", icon: Clock, color: "text-blue-500", bg: "bg-blue-500" },
  blocked: { label: "Bloqueado", icon: Ban, color: "text-red-500", bg: "bg-red-500" },
  review: { label: "Revisao", icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-500" },
  completed: { label: "Concluido", icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500" },
} as const

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-slate-400",
}

const STATUS_ORDER = ["in_progress", "blocked", "review", "pending"] as const

export function TaskListBoard() {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(["in_progress", "blocked", "review", "pending"])
  )

  useEffect(() => {
    loadTasks()
  }, [])

  async function loadTasks() {
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from("tasks")
        .select(`
          id, title, status, priority, type, due_date,
          assignee:org_members(profile:profiles(name)),
          client:clients(name),
          store:client_stores(store_name)
        `)
        .not("status", "in", '("completed","cancelled")')
        .order("priority", { ascending: true })
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(50)

      setTasks((data as unknown as TaskItem[]) || [])
    } catch {
      // ignore
    } finally {
      setIsLoading(false)
    }
  }

  const groupedTasks = useMemo(() => {
    const groups: Record<string, TaskItem[]> = {}
    STATUS_ORDER.forEach(s => { groups[s] = [] })

    tasks.forEach(task => {
      const status = STATUS_ORDER.includes(task.status as typeof STATUS_ORDER[number])
        ? task.status
        : "pending"
      if (!groups[status]) groups[status] = []
      groups[status].push(task)
    })

    return groups
  }, [tasks])

  const totalActive = tasks.length
  const now = new Date()

  function toggleGroup(status: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  function resolveRelation<T>(val: T | T[] | null | undefined): T | null {
    if (!val) return null
    return Array.isArray(val) ? val[0] || null : val
  }

  if (isLoading) {
    return (
      <div className="rounded-[8px] border border-border bg-card h-full flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <ListTodo className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm font-semibold">Tarefas</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </div>
    )
  }

  return (
    <div className="rounded-[8px] border border-border bg-card h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <ListTodo className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm font-semibold">Tarefas</CardTitle>
          </div>
          <Badge variant="neutral" className="text-xs font-medium">
            {totalActive} ativas
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0">
        <ScrollArea className="flex-1 max-h-[400px]">
          <div className="px-5 pb-4 space-y-1">
            {STATUS_ORDER.map(status => {
              const config = STATUS_CONFIG[status]
              const items = groupedTasks[status] || []
              const isExpanded = expandedGroups.has(status)

              if (items.length === 0) return null

              return (
                <div key={status}>
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(status)}
                    className="w-full flex items-center gap-2 py-2 px-1 hover:bg-accent/30 rounded-lg transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <div className={cn("h-2 w-2 rounded-full", config.bg)} />
                    <span className="text-xs font-semibold text-foreground">{config.label}</span>
                    <span className="text-[11px] text-muted-foreground ml-auto">{items.length}</span>
                  </button>

                  {/* Task items */}
                  {isExpanded && (
                    <div className="ml-3 border-l border-border/50 pl-3 space-y-0.5 mb-2">
                      {items.slice(0, 8).map(task => {
                        const isOverdue = task.due_date && new Date(task.due_date) < now
                        const assignee = resolveRelation(task.assignee)
                        const assigneeName = assignee
                          ? (resolveRelation((assignee as Record<string, unknown>).profile as { name: string } | { name: string }[] | null))?.name
                          : null

                        return (
                          <Link
                            key={task.id}
                            href="/admin/board"
                            className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-accent/50 transition-colors group"
                          >
                            {/* Priority dot */}
                            <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium)} />

                            {/* Title */}
                            <span className="text-xs text-foreground group-hover:text-primary transition-colors truncate flex-1">
                              {task.title}
                            </span>

                            {/* Due date */}
                            {task.due_date && (
                              <span className={cn(
                                "text-[10px] tabular-nums shrink-0",
                                isOverdue ? "text-destructive font-medium" : "text-muted-foreground"
                              )}>
                                {new Date(task.due_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                              </span>
                            )}

                            {/* Assignee initial */}
                            {assigneeName && (
                              <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0">
                                <span className="text-[9px] font-bold text-muted-foreground">
                                  {assigneeName.charAt(0).toUpperCase()}
                                </span>
                              </div>
                            )}
                          </Link>
                        )
                      })}
                      {items.length > 8 && (
                        <p className="text-[10px] text-muted-foreground px-2 py-1">
                          +{items.length - 8} {items.length - 8 === 1 ? "tarefa" : "tarefas"}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {totalActive === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center mb-2">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>
                <p className="text-xs text-muted-foreground">Nenhuma tarefa ativa</p>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="px-5 pb-4 pt-2 mt-auto">
          <Button variant="ghost" size="sm" className="w-full text-xs text-primary group" asChild>
            <Link href="/admin/board">
              Ver Board Completo
              <ArrowRight className="h-3.5 w-3.5 ml-1 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </div>
  )
}
