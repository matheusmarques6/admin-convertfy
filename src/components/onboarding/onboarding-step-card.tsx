"use client"

import {
  Clock,
  PlayCircle,
  Loader2,
  Eye,
  CheckCircle2,
  AlertCircle,
  SkipForward,
  Calendar,
  MoreHorizontal,
  ArrowRight,
  ExternalLink,
  Link2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn, getInitials } from "@/lib/utils"
import type { OnboardingStepStatus } from "@/types"

// =============================================
// Status visual config
// =============================================

const STEP_STATUS_CONFIG: Record<
  OnboardingStepStatus,
  {
    label: string
    icon: typeof Clock
    /** Status key to pass to StatusBadge */
    badgeStatus: string
  }
> = {
  waiting: { label: "Aguardando", icon: Clock, badgeStatus: "pending" },
  pending: { label: "Pendente", icon: PlayCircle, badgeStatus: "pending" },
  in_progress: { label: "Em andamento", icon: Loader2, badgeStatus: "in_progress" },
  review: { label: "Em revisao", icon: Eye, badgeStatus: "review" },
  completed: { label: "Concluido", icon: CheckCircle2, badgeStatus: "completed" },
  blocked: { label: "Bloqueado", icon: AlertCircle, badgeStatus: "critical" },
  skipped: { label: "Pulado", icon: SkipForward, badgeStatus: "closed" },
}

// =============================================
// Category labels
// =============================================

const CATEGORY_LABELS: Record<string, string> = {
  setup: "Configuracao",
  integration: "Integracao",
  training: "Treinamento",
  launch: "Lancamento",
}

// =============================================
// Status transition actions
// =============================================

function getAvailableActions(status: OnboardingStepStatus): { label: string; targetStatus: OnboardingStepStatus }[] {
  switch (status) {
    case "waiting":
      return []
    case "pending":
      return [
        { label: "Iniciar", targetStatus: "in_progress" },
        { label: "Bloquear", targetStatus: "blocked" },
        { label: "Pular", targetStatus: "skipped" },
      ]
    case "in_progress":
      return [
        { label: "Enviar para revisao", targetStatus: "review" },
        { label: "Marcar como concluido", targetStatus: "completed" },
        { label: "Bloquear", targetStatus: "blocked" },
      ]
    case "review":
      return [
        { label: "Marcar como concluido", targetStatus: "completed" },
        { label: "Voltar para andamento", targetStatus: "in_progress" },
        { label: "Bloquear", targetStatus: "blocked" },
      ]
    case "blocked":
      return [
        { label: "Desbloquear", targetStatus: "pending" },
        { label: "Pular", targetStatus: "skipped" },
      ]
    case "completed":
      return [
        { label: "Reabrir", targetStatus: "in_progress" },
      ]
    case "skipped":
      return [
        { label: "Reativar", targetStatus: "pending" },
      ]
    default:
      return []
  }
}

// =============================================
// Relative date formatting
// =============================================

function formatRelativeDate(dateStr: string): { text: string; isOverdue: boolean } {
  const target = new Date(dateStr)
  const now = new Date()
  // Reset time portion for day comparison
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffMs = targetDay.getTime() - today.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return { text: "Vence hoje", isOverdue: false }
  if (diffDays === 1) return { text: "Vence amanha", isOverdue: false }
  if (diffDays === -1) return { text: "Atrasado 1 dia", isOverdue: true }
  if (diffDays > 1) return { text: `Em ${diffDays} dias`, isOverdue: false }
  return { text: `Atrasado ${Math.abs(diffDays)} dias`, isOverdue: true }
}

// =============================================
// Component Props
// =============================================

export interface OnboardingStepCardProps {
  step: {
    id: string
    name: string
    description?: string
    category: string
    status: OnboardingStepStatus
    assigned_to?: string
    depends_on_step_ids?: string[]
    due_date?: string
    completed_at?: string
    completed_by?: string
    notes?: string
  }
  client?: { name: string; company?: string }
  store?: { store_name: string }
  assignee?: { name: string; avatar_url?: string }
  blockedByNames?: string[]

  context: "board" | "onboarding"

  onStatusChange?: (stepId: string, newStatus: OnboardingStepStatus) => void
  onComplete?: (stepId: string) => void
  onClick?: (stepId: string) => void

  isDragging?: boolean
  className?: string
}

// =============================================
// Component
// =============================================

export function OnboardingStepCard({
  step,
  client,
  store,
  assignee,
  blockedByNames,
  context,
  onStatusChange,
  onComplete,
  onClick,
  isDragging,
  className,
}: OnboardingStepCardProps) {
  const statusConfig = STEP_STATUS_CONFIG[step.status]
  const _StatusIcon = statusConfig.icon
  const categoryLabel = CATEGORY_LABELS[step.category] ?? step.category
  const actions = getAvailableActions(step.status)
  const isBlockedOrWaiting = step.status === "waiting" || step.status === "blocked"
  const isCompleted = step.status === "completed"
  const isSkipped = step.status === "skipped"

  const dueInfo = step.due_date && !isCompleted && !isSkipped
    ? formatRelativeDate(step.due_date)
    : null

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Etapa: ${step.name}, Status: ${statusConfig.label}`}
      onClick={() => onClick?.(step.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick?.(step.id)
        }
      }}
      className={cn(
        "group bg-card border rounded-lg p-3 cursor-pointer hover:shadow-md transition-all",
        isDragging && "shadow-lg scale-[1.02] opacity-90",
        dueInfo?.isOverdue && "border-red-500/50",
        isSkipped && "opacity-60",
        className,
      )}
    >
      {/* Header: badges + actions */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Status badge */}
          <StatusBadge
            status={statusConfig.badgeStatus}
            label={statusConfig.label}
            showDot={false}
            className="text-[10px]"
          />
          {/* Category badge */}
          <Badge variant="neutral" showDot={false} className="text-[10px]">
            {categoryLabel}
          </Badge>
          {/* Board context: "Onboarding" origin badge */}
          {context === "board" && (
            <Badge variant="neutral" className="text-[10px] gap-1">
              <Link2 className="h-3 w-3" />
              Onboarding
            </Badge>
          )}
        </div>

        {/* Actions dropdown */}
        {actions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Acoes da etapa"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuLabel>Acoes</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {actions.map((action) => (
                <DropdownMenuItem
                  key={action.targetStatus}
                  onClick={() => {
                    if (action.targetStatus === "completed") {
                      onComplete?.(step.id)
                    }
                    onStatusChange?.(step.id, action.targetStatus)
                  }}
                >
                  <ArrowRight className="mr-2 h-4 w-4" />
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Title */}
      <h4 className={cn(
        "font-medium text-sm mb-1 line-clamp-2",
        isSkipped && "line-through text-muted-foreground",
      )}>
        {step.name}
      </h4>

      {/* Client / Store context (board context shows this prominently) */}
      {context === "board" && (client || store) && (
        <p className="text-xs text-muted-foreground mb-1 truncate">
          {store?.store_name}{client ? ` — ${client.name}` : ""}
        </p>
      )}

      {/* Blocked-by indicator */}
      {isBlockedOrWaiting && blockedByNames && blockedByNames.length > 0 && (
        <div className="flex items-start gap-1.5 mt-1 mb-1">
          <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />
          <span className="text-xs text-red-600 dark:text-red-400">
            Bloqueado por: {blockedByNames.join(", ")}
          </span>
        </div>
      )}

      {/* Footer: due date + assignee + pipeline link */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t">
        <div className="flex items-center gap-2">
          {/* Due date */}
          {dueInfo && (
            <div
              className={cn(
                "flex items-center gap-1 text-xs",
                dueInfo.isOverdue ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {dueInfo.isOverdue ? (
                <AlertCircle className="h-3 w-3" />
              ) : (
                <Calendar className="h-3 w-3" />
              )}
              {dueInfo.text}
            </div>
          )}

          {/* Board context: link to pipeline */}
          {context === "board" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                // Navigate to onboarding pipeline — consumers can override via onClick
              }}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
              aria-label="Ver pipeline de onboarding"
            >
              <ExternalLink className="h-3 w-3" />
              Ver pipeline
            </button>
          )}
        </div>

        {/* Assignee avatar */}
        {assignee && (
          <Avatar className="h-6 w-6">
            <AvatarImage src={assignee.avatar_url} />
            <AvatarFallback className="text-xs">
              {getInitials(assignee.name)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  )
}
