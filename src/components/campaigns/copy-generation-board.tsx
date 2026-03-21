"use client"

import { useState, useEffect, useCallback } from "react"
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Paintbrush,
  Play,
  Rocket,
  SkipForward,
  User,
  ChevronDown,
  ChevronRight,
  FileText,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { usePermissions } from "@/lib/hooks/use-permissions"
import { toast } from "@/lib/hooks/use-toast"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskAssignee {
  id: string
  profile_id: string
  profile: { name: string; avatar_url: string | null } | null
}

interface GenerationClient {
  id: string
  name: string
  company: string | null
}

interface Generation {
  id: string
  name: string
  status: string
  reference_doc_url: string | null
  drive_folder_url: string | null
  client_id: string
  client: GenerationClient | null
}

interface CampaignTask {
  id: string
  generation_id: string
  org_id: string
  role: string
  assignee_id: string | null
  status: string
  started_at: string | null
  completed_at: string | null
  completed_by: string | null
  notes: string | null
  created_at: string
  updated_at: string
  generation: Generation | null
  assignee: TaskAssignee | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_CONFIG: Record<string, { label: string; icon: typeof Paintbrush; color: string }> = {
  designer: { label: "Designer", icon: Paintbrush, color: "text-blue-500" },
  techlead: { label: "Tech Lead", icon: Rocket, color: "text-purple-500" },
  sdr: { label: "SDR", icon: User, color: "text-orange-500" },
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
  in_progress: { label: "Em andamento", color: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400" },
  completed: { label: "Concluida", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" },
  skipped: { label: "Pulada", color: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400" },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CopyGenerationBoard() {
  const [tasks, setTasks] = useState<CampaignTask[]>([])
  const [loading, setLoading] = useState(true)
  const [actionTask, setActionTask] = useState<CampaignTask | null>(null)
  const [actionType, setActionType] = useState<"start" | "complete" | "skip">("complete")
  const [actionNotes, setActionNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)

  const { permissions } = usePermissions()
  const isManager =
    permissions?.isAdmin ||
    permissions?.isOrgOwner ||
    permissions?.orgRole === "manager" ||
    permissions?.orgRole === "coo"

  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch("/api/campaigns/tasks")
      if (!res.ok) throw new Error()
      const json = await res.json()
      setTasks(json.tasks || [])
    } catch {
      toast({ variant: "destructive", title: "Erro ao carregar tarefas" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Group tasks by generation
  const tasksByGeneration = tasks.reduce(
    (acc, task) => {
      const genId = task.generation_id
      if (!acc[genId]) acc[genId] = []
      acc[genId].push(task)
      return acc
    },
    {} as Record<string, CampaignTask[]>,
  )

  // Handle approve generation
  const handleApprove = async (generationId: string) => {
    setApprovingId(generationId)
    try {
      const res = await fetch(`/api/campaigns/generations/${generationId}/approve`, {
        method: "POST",
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Erro ao aprovar")
      }
      toast({ title: "Geracao aprovada! Tarefas criadas." })
      fetchAll()
    } catch (err) {
      toast({
        variant: "destructive",
        title: err instanceof Error ? err.message : "Erro ao aprovar",
      })
    } finally {
      setApprovingId(null)
    }
  }

  // Handle task status change
  const handleTaskAction = async () => {
    if (!actionTask) return
    setSubmitting(true)

    const statusMap = {
      start: "in_progress",
      complete: "completed",
      skip: "skipped",
    }

    try {
      const res = await fetch(`/api/campaigns/tasks/${actionTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: statusMap[actionType],
          notes: actionNotes || undefined,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Erro ao atualizar")
      }

      toast({ title: `Tarefa ${actionType === "start" ? "iniciada" : actionType === "complete" ? "concluida" : "pulada"}` })
      setActionTask(null)
      setActionNotes("")
      fetchAll()
    } catch (err) {
      toast({
        variant: "destructive",
        title: err instanceof Error ? err.message : "Erro ao atualizar",
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <FileText className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">Nenhuma tarefa de campanha</h3>
        <p className="text-muted-foreground mt-1 max-w-md">
          As tarefas serao criadas automaticamente quando uma geracao de copy for aprovada.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        {Object.entries(tasksByGeneration).map(([genId, genTasks]) => {
          const generation = genTasks[0]?.generation
          if (!generation) return null

          return (
            <GenerationCard
              key={genId}
              generation={generation}
              tasks={genTasks}
              isManager={isManager || false}
              onApprove={() => handleApprove(genId)}
              approving={approvingId === genId}
              onTaskAction={(task, type) => {
                setActionTask(task)
                setActionType(type)
                setActionNotes("")
              }}
            />
          )
        })}
      </div>

      {/* Task Action Dialog */}
      <Dialog open={!!actionTask} onOpenChange={() => setActionTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "start" && "Iniciar Tarefa"}
              {actionType === "complete" && "Concluir Tarefa"}
              {actionType === "skip" && "Pular Tarefa"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Role:</span>
              <Badge variant="neutral" showDot={false}>
                {ROLE_CONFIG[actionTask?.role || ""]?.label || actionTask?.role}
              </Badge>
            </div>
            <Textarea
              placeholder="Notas (opcional)"
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              rows={3}
              maxLength={5000}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionTask(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleTaskAction}
              disabled={submitting}
              variant={actionType === "skip" ? "secondary" : "default"}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {actionType === "start" && "Iniciar"}
              {actionType === "complete" && "Concluir"}
              {actionType === "skip" && "Pular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Generation Card
// ---------------------------------------------------------------------------

function GenerationCard({
  generation,
  tasks,
  isManager,
  onApprove,
  approving,
  onTaskAction,
}: {
  generation: Generation
  tasks: CampaignTask[]
  isManager: boolean
  onApprove: () => void
  approving: boolean
  onTaskAction: (task: CampaignTask, type: "start" | "complete" | "skip") => void
}) {
  const [expanded, setExpanded] = useState(true)
  const completedCount = tasks.filter(
    (t) => t.status === "completed" || t.status === "skipped",
  ).length
  const allDone = completedCount === tasks.length
  const clientName =
    generation.client && !Array.isArray(generation.client)
      ? generation.client.name
      : "Cliente"

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Recolher" : "Expandir"} ${generation.name}`}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            {expanded ? (
              <ChevronDown className="h-5 w-5" />
            ) : (
              <ChevronRight className="h-5 w-5" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate">
              {generation.name}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {clientName}
            </p>
          </div>

          {/* Progress badge */}
          <Badge
            variant="outline"
            className={allDone ? "border-emerald-500 text-emerald-600" : ""}
          >
            {completedCount}/{tasks.length}
          </Badge>

          {/* Generation status */}
          <Badge className={`border-transparent ${
            generation.status === "completed"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
              : generation.status === "approved"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
                : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
          }`}>
            {generation.status === "completed" ? "Concluida" :
             generation.status === "approved" ? "Em progresso" : generation.status}
          </Badge>

          {/* Drive link */}
          {generation.drive_folder_url && (
            <a
              href={generation.drive_folder_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 shrink-0"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Drive
            </a>
          )}

          {/* Approve button (for generations with status 'done') */}
          {isManager && generation.status === "done" && (
            <Button
              size="sm"
              onClick={onApprove}
              disabled={approving}
            >
              {approving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1" />
              )}
              Aprovar
            </Button>
          )}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <div className="grid gap-2 sm:grid-cols-3">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onAction={(type) => onTaskAction(task, type)}
              />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Task Card
// ---------------------------------------------------------------------------

function TaskCard({
  task,
  onAction,
}: {
  task: CampaignTask
  onAction: (type: "start" | "complete" | "skip") => void
}) {
  const roleConfig = ROLE_CONFIG[task.role] || {
    label: task.role,
    icon: User,
    color: "text-muted-foreground",
  }
  const statusConfig = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending
  const Icon = roleConfig.icon
  const assigneeName =
    task.assignee && !Array.isArray(task.assignee)
      ? (task.assignee.profile && !Array.isArray(task.assignee.profile)
          ? task.assignee.profile.name
          : null)
      : null
  const isDone = task.status === "completed" || task.status === "skipped"

  return (
    <div
      className={`rounded-lg border p-3 space-y-2 ${
        isDone ? "opacity-60" : ""
      }`}
    >
      {/* Role header */}
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${roleConfig.color}`} />
        <span className="text-sm font-medium">{roleConfig.label}</span>
        <Badge className={`ml-auto text-[10px] border-transparent ${statusConfig.color}`}>
          {statusConfig.label}
        </Badge>
      </div>

      {/* Assignee */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <User className="h-3 w-3" />
        {assigneeName || "Nao atribuido"}
      </div>

      {/* Notes */}
      {task.notes && (
        <p className="text-xs text-muted-foreground truncate">{task.notes}</p>
      )}

      {/* Action buttons */}
      {!isDone && (
        <div className="flex gap-1 pt-1">
          {task.status === "pending" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={() => onAction("start")}
            >
              <Play className="h-3 w-3 mr-1" />
              Iniciar
            </Button>
          )}
          {task.status === "in_progress" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={() => onAction("complete")}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Concluir
            </Button>
          )}
          {(task.status === "pending" || task.status === "in_progress") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => onAction("skip")}
            >
              <SkipForward className="h-3 w-3 mr-1" />
              Pular
            </Button>
          )}
        </div>
      )}

      {/* Completed info */}
      {task.completed_at && (
        <p className="text-[10px] text-muted-foreground">
          {task.status === "completed" ? "Concluida" : "Pulada"} em{" "}
          {new Date(task.completed_at).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}
    </div>
  )
}
