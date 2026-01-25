"use client"

import {
  Calendar,
  MoreHorizontal,
  MessageSquare,
  CheckSquare,
  AlertCircle,
  Clock,
  Trash2,
  ArrowRight,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn, getInitials } from "@/lib/utils"
import type { Task, TaskStatus } from "@/types"

interface UserProfile {
  id: string
  name: string
  email: string
  avatar_url?: string
}

interface MemberWithProfile {
  id: string
  role: string
  profile?: UserProfile
}

interface ClientInfo {
  id: string
  name: string
  company?: string
}

interface StoreWithClient {
  id: string
  store_name: string
  platform?: string
  client?: { id: string; name: string }
}

interface TaskWithRelations extends Omit<Task, "assignee" | "client" | "store" | "creator"> {
  assignee?: MemberWithProfile
  creator?: UserProfile
  client?: ClientInfo
  store?: StoreWithClient
  comments_count?: number
}

interface TaskCardProps {
  task: TaskWithRelations
  onClick: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onStatusChange: (taskId: string, status: TaskStatus) => void
  onDelete: (taskId: string) => void
}

const priorityConfig = {
  low: { label: "Baixa", color: "bg-slate-500" },
  medium: { label: "Média", color: "bg-blue-500" },
  high: { label: "Alta", color: "bg-orange-500" },
  urgent: { label: "Urgente", color: "bg-red-500" },
}

const typeConfig = {
  onboarding: { label: "Onboarding", variant: "secondary" as const },
  campaign: { label: "Campanha", variant: "default" as const },
  request: { label: "Solicitação", variant: "outline" as const },
  general: { label: "Geral", variant: "secondary" as const },
  meeting: { label: "Reunião", variant: "warning" as const },
  deadline: { label: "Prazo", variant: "destructive" as const },
}

const statusOptions: { value: TaskStatus; label: string }[] = [
  { value: "pending", label: "Pendente" },
  { value: "in_progress", label: "Em Andamento" },
  { value: "blocked", label: "Bloqueado" },
  { value: "review", label: "Em Revisão" },
  { value: "completed", label: "Concluído" },
]

export function TaskCard({
  task,
  onClick,
  onDragStart,
  onDragEnd,
  onStatusChange,
  onDelete,
}: TaskCardProps) {
  const priority = priorityConfig[task.priority]
  const type = typeConfig[task.type]
  const isOverdue = task.due_date && new Date(task.due_date) < new Date()

  const formatDueDate = (date: string) => {
    const d = new Date(date)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (d.toDateString() === today.toDateString()) return "Hoje"
    if (d.toDateString() === tomorrow.toDateString()) return "Amanhã"

    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group bg-card border rounded-lg p-3 cursor-pointer hover:shadow-md transition-all",
        "active:cursor-grabbing active:shadow-lg active:scale-[1.02]",
        isOverdue && "border-red-500/50"
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={type.variant} className="text-xs">
            {type.label}
          </Badge>
          <div className={cn("w-2 h-2 rounded-full", priority.color)} title={priority.label} />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuLabel>Ações</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ArrowRight className="mr-2 h-4 w-4" />
                Mover para
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {statusOptions.map((status) => (
                  <DropdownMenuItem
                    key={status.value}
                    disabled={status.value === task.status}
                    onClick={() => onStatusChange(task.id, status.value)}
                  >
                    {status.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(task.id)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Title */}
      <h4 className="font-medium text-sm mb-2 line-clamp-2">{task.title}</h4>

      {/* Context */}
      {(task.client || task.store) && (
        <p className="text-xs text-muted-foreground mb-2 truncate">
          {task.store?.store_name || task.client?.name}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t">
        <div className="flex items-center gap-2">
          {/* Due Date */}
          {task.due_date && (
            <div
              className={cn(
                "flex items-center gap-1 text-xs",
                isOverdue ? "text-red-500" : "text-muted-foreground"
              )}
            >
              {isOverdue ? (
                <AlertCircle className="h-3 w-3" />
              ) : (
                <Calendar className="h-3 w-3" />
              )}
              {formatDueDate(task.due_date)}
            </div>
          )}

          {/* Comments count */}
          {task.comments_count && task.comments_count > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MessageSquare className="h-3 w-3" />
              {task.comments_count}
            </div>
          )}
        </div>

        {/* Assignee */}
        {task.assignee?.profile && (
          <Avatar className="h-6 w-6">
            <AvatarImage src={task.assignee.profile.avatar_url} />
            <AvatarFallback className="text-xs">
              {getInitials(task.assignee.profile.name)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  )
}
