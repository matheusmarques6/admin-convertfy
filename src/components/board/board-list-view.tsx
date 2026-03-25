"use client"

import { MoreHorizontal, Eye, Trash2 } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { cn, getInitials } from "@/lib/utils"
import { TASK_PRIORITY_CONFIG, TASK_TYPE_CONFIG, TASK_STATUS_OPTIONS } from "@/lib/constants/board"
import type { Task, TaskStatus } from "@/types"

// ─── Types ────────────────────────────────────────────────

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
}

interface BoardListViewProps {
  tasks: TaskWithRelations[]
  onTaskClick: (task: TaskWithRelations) => void
  onStatusChange: (taskId: string, status: TaskStatus) => void
  onDeleteTask: (taskId: string) => void
}

// ─── BoardListView ────────────────────────────────────────

export function BoardListView({
  tasks,
  onTaskClick,
  onStatusChange,
  onDeleteTask,
}: BoardListViewProps) {
  const priorityConfig = TASK_PRIORITY_CONFIG
  const typeConfig = TASK_TYPE_CONFIG

  const columns: ColumnDef<TaskWithRelations>[] = [
    {
      accessorKey: "title",
      header: "Tarefa",
      type: "text",
      mobilePriority: "title",
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
            {row.title}
          </p>
          {(row.client || row.store) && (
            <p className="text-xs text-gray-400 dark:text-[#5C6378] truncate mt-0.5">
              {row.store?.store_name || row.client?.name}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      type: "badge",
      mobilePriority: "badge",
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      accessorKey: "type",
      header: "Tipo",
      type: "badge",
      mobilePriority: "hidden",
      hideOnTablet: true,
      cell: (row) => {
        const type = typeConfig[row.type]
        return (
          <Badge variant={type.variant} className="text-[10px]">
            {type.label}
          </Badge>
        )
      },
    },
    {
      accessorKey: "assignee",
      header: "Responsável",
      type: "custom",
      mobilePriority: "detail",
      cell: (row) =>
        row.assignee?.profile ? (
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarImage src={row.assignee.profile.avatar_url} />
              <AvatarFallback className="text-[10px] bg-[#EEF0FB] text-[#4E62D8] dark:bg-[#141C3D] dark:text-[#7B8CEA]">
                {getInitials(row.assignee.profile.name)}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-gray-600 dark:text-[#8B92A5] truncate">
              {row.assignee.profile.name}
            </span>
          </div>
        ) : (
          <span className="text-sm text-gray-400 dark:text-[#5C6378]">—</span>
        ),
    },
    {
      accessorKey: "due_date",
      header: "Vencimento",
      type: "custom",
      mobilePriority: "detail",
      sortable: true,
      cell: (row) => {
        if (!row.due_date) {
          return <span className="text-sm text-gray-400 dark:text-[#5C6378]">—</span>
        }
        const isOverdue = new Date(row.due_date) < new Date()
        return (
          <span className={cn(
            "text-sm font-mono tabular-nums",
            isOverdue
              ? "text-[#991B1B] dark:text-[#FCA5A5] font-semibold"
              : "text-gray-600 dark:text-[#8B92A5]",
          )}>
            {new Date(row.due_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
            {isOverdue && " ⚠"}
          </span>
        )
      },
    },
    {
      accessorKey: "priority",
      header: "Prioridade",
      type: "custom",
      mobilePriority: "detail",
      cell: (row) => {
        const p = priorityConfig[row.priority]
        return (
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full shrink-0", p.color)} />
            <span className="text-sm text-gray-600 dark:text-[#8B92A5]">
              {p.label}
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: "id",
      header: "",
      type: "custom",
      mobilePriority: "hidden",
      width: "48px",
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Icon icon={MoreHorizontal} size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onTaskClick(row)}>
              <Icon icon={Eye} size={16} className="mr-2" />
              Detalhes
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] font-medium text-gray-400 dark:text-[#5C6378] uppercase tracking-[0.04em]">
              Mover para
            </DropdownMenuLabel>
            {TASK_STATUS_OPTIONS
              .filter((s) => s.value !== row.status)
              .map((status) => (
                <DropdownMenuItem
                  key={status.value}
                  onClick={() => onStatusChange(row.id, status.value)}
                >
                  {status.label}
                </DropdownMenuItem>
              ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-[#991B1B] dark:text-[#FCA5A5]"
              onClick={() => onDeleteTask(row.id)}
            >
              <Icon icon={Trash2} size={16} className="mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className="mt-4">
      <DataTable
        columns={columns}
        data={tasks}
        onRowClick={onTaskClick}
        emptyMessage="Nenhuma tarefa encontrada"
        rowKey="id"
      />
    </div>
  )
}
