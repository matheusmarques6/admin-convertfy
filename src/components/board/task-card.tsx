"use client"

import {
  Calendar,
  MoreHorizontal,
  MessageSquare,
  AlertCircle,
  Trash2,
  ArrowRight,
  Link2,
  ExternalLink,
} from "lucide-react"
import { Icon } from "@/components/ui/icon"
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
import { TASK_PRIORITY_CONFIG, TASK_TYPE_CONFIG, TASK_STATUS_OPTIONS } from "@/lib/constants/board"
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

const priorityConfig = TASK_PRIORITY_CONFIG
const typeConfig = TASK_TYPE_CONFIG
const statusOptions = TASK_STATUS_OPTIONS

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
        // Base — DS v3.0 Rule 2 + 19
        "group rounded-[8px] border p-3",
        "border-[rgba(0,0,0,0.08)] bg-white",
        "dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]",
        // Hover + drag — Rule 19
        "cursor-grab active:cursor-grabbing",
        "hover:shadow-sm",
        "active:shadow-md active:opacity-95 active:scale-[1.02]",
        "transition-all duration-150",
        // Overdue border
        isOverdue && "border-[#991B1B]/30 dark:border-[#FCA5A5]/20",
      )}
      onClick={onClick}
    >
      {/* Header: type badge + priority dot + actions */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={type.variant} className="text-[10px]">
            {type.label}
          </Badge>
          {task.source_type === "auto_onboarding_step" && (
            <Badge variant="neutral" className="text-[10px] gap-1">
              <Icon icon={Link2} customSize={10} />
              Etapa
            </Badge>
          )}
          <div
            className={cn("w-2 h-2 rounded-full shrink-0", priority.color)}
            title={priority.label}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Icon icon={MoreHorizontal} customSize={12} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuLabel>Ações</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Icon icon={ArrowRight} size={16} className="mr-2" />
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
              className="text-[#991B1B] dark:text-[#FCA5A5]"
              onClick={() => onDelete(task.id)}
            >
              <Icon icon={Trash2} size={16} className="mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] line-clamp-2 mb-1">
        {task.title}
      </h4>

      {/* Context: store/client */}
      {(task.client || task.store) && (
        <p className="text-xs text-gray-500 dark:text-[#8B92A5] truncate mb-2">
          {task.store?.store_name || task.client?.name}
        </p>
      )}

      {/* Footer: due date + comments + assignee */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[rgba(0,0,0,0.05)] dark:border-[rgba(255,255,255,0.05)]">
        <div className="flex items-center gap-2">
          {/* Due Date */}
          {task.due_date && (
            <span
              className={cn(
                "flex items-center gap-1 text-[11px] font-mono tabular-nums",
                isOverdue
                  ? "text-[#991B1B] dark:text-[#FCA5A5] font-semibold"
                  : "text-gray-400 dark:text-[#5C6378]",
              )}
            >
              {isOverdue ? (
                <Icon icon={AlertCircle} customSize={12} />
              ) : (
                <Icon icon={Calendar} customSize={12} />
              )}
              {formatDueDate(task.due_date)}
            </span>
          )}

          {/* Comments count */}
          {task.comments_count && task.comments_count > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-[#5C6378]">
              <Icon icon={MessageSquare} customSize={12} />
              {task.comments_count}
            </span>
          )}

          {/* Onboarding pipeline link */}
          {task.source_type === "auto_onboarding_step" && (
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-[11px] text-[#4E62D8] dark:text-[#7B8CEA] hover:underline"
              aria-label="Ver pipeline de onboarding"
            >
              <Icon icon={ExternalLink} customSize={12} />
              Pipeline
            </button>
          )}
        </div>

        {/* Assignee */}
        {task.assignee?.profile && (
          <Avatar className="h-6 w-6">
            <AvatarImage src={task.assignee.profile.avatar_url} />
            <AvatarFallback className="text-[10px] bg-[#EEF0FB] text-[#4E62D8] dark:bg-[#141C3D] dark:text-[#7B8CEA]">
              {getInitials(task.assignee.profile.name)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  )
}
