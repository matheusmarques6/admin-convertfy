"use client"

import { useState, useCallback, useEffect } from "react"
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd"
import {
  Clock,
  PlayCircle,
  Loader2,
  Eye,
  CheckCircle2,
  RefreshCw,
  Filter,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/lib/hooks/use-toast"
import { useRealtimeOnboarding } from "@/hooks/use-realtime-onboarding"
import { OnboardingStepCard } from "./onboarding-step-card"
import { cn } from "@/lib/utils"
import type { OnboardingStepStatus } from "@/types"

// =============================================
// Types
// =============================================

interface StepWithRelations {
  id: string
  onboarding_id: string
  name: string
  description?: string
  category: string
  status: OnboardingStepStatus
  position: number
  assigned_to?: string
  depends_on_step_ids?: string[]
  due_date?: string
  completed_at?: string
  completed_by?: string
  notes?: string
  phase?: string
  onboarding?: {
    id: string
    client?: { id: string; name: string; company?: string }
    store?: { id: string; store_name: string }
  }
  assignee?: {
    id: string
    role: string
    profile?: {
      id: string
      name: string
      email: string
      avatar_url?: string
    }
  }
}

interface OnboardingOption {
  id: string
  clientName: string
  storeName?: string
}

interface AssigneeOption {
  id: string
  name: string
  avatar_url?: string
}

// =============================================
// Column config
// =============================================

interface StepColumnConfig {
  id: OnboardingStepStatus
  title: string
  color: string
  icon: React.ReactNode
}

const STEP_COLUMNS: StepColumnConfig[] = [
  { id: "waiting", title: "Aguardando", color: "#6B7280", icon: <Clock className="h-4 w-4" /> },
  { id: "pending", title: "Pronto", color: "#3B82F6", icon: <PlayCircle className="h-4 w-4" /> },
  { id: "in_progress", title: "Em Andamento", color: "#F59E0B", icon: <Loader2 className="h-4 w-4" /> },
  { id: "review", title: "Em Revisao", color: "#8B5CF6", icon: <Eye className="h-4 w-4" /> },
  { id: "completed", title: "Concluido", color: "#22C55E", icon: <CheckCircle2 className="h-4 w-4" /> },
]

// =============================================
// Drag-and-drop valid transitions
// =============================================

const VALID_DRAG_TRANSITIONS: Record<string, string[]> = {
  waiting: [],
  pending: ["in_progress"],
  in_progress: ["review", "blocked", "completed"],
  review: ["completed", "in_progress"],
  blocked: ["pending", "in_progress"],
  completed: [],
}

// =============================================
// Component
// =============================================

export function OnboardingStepsKanban() {
  const [steps, setSteps] = useState<StepWithRelations[]>([])
  const [allSteps, setAllSteps] = useState<StepWithRelations[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [filterOnboardingId, setFilterOnboardingId] = useState<string>("all")
  const [filterAssigneeId, setFilterAssigneeId] = useState<string>("all")
  const [filterPhase, setFilterPhase] = useState<string>("all")

  // Derived filter options
  const [onboardingOptions, setOnboardingOptions] = useState<OnboardingOption[]>([])
  const [assigneeOptions, setAssigneeOptions] = useState<AssigneeOption[]>([])
  const [phaseOptions, setPhaseOptions] = useState<string[]>([])

  // Build a map of step id -> step name for blocked-by resolution
  const stepNameMap = new Map(allSteps.map((s) => [s.id, s.name]))

  const fetchSteps = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding/all-steps")
      const data = await res.json()
      if (data.steps) {
        setAllSteps(data.steps)
        buildFilterOptions(data.steps)
      }
    } catch (error) {
      console.error("Error fetching steps:", error)
      toast({
        variant: "destructive",
        title: "Erro ao carregar etapas",
        description: "Tente novamente.",
      })
    } finally {
      setLoading(false)
    }
  }, [])

  function buildFilterOptions(stepsData: StepWithRelations[]) {
    // Onboarding options
    const onbMap = new Map<string, OnboardingOption>()
    for (const s of stepsData) {
      if (s.onboarding_id && !onbMap.has(s.onboarding_id)) {
        onbMap.set(s.onboarding_id, {
          id: s.onboarding_id,
          clientName: s.onboarding?.client?.name || "Cliente",
          storeName: s.onboarding?.store?.store_name,
        })
      }
    }
    setOnboardingOptions(Array.from(onbMap.values()))

    // Assignee options
    const assigneeMap = new Map<string, AssigneeOption>()
    for (const s of stepsData) {
      if (s.assignee?.id && s.assignee.profile && !assigneeMap.has(s.assignee.id)) {
        assigneeMap.set(s.assignee.id, {
          id: s.assignee.id,
          name: s.assignee.profile.name,
          avatar_url: s.assignee.profile.avatar_url,
        })
      }
    }
    setAssigneeOptions(Array.from(assigneeMap.values()))

    // Phase options
    const phases = new Set<string>()
    for (const s of stepsData) {
      if (s.phase) phases.add(s.phase)
    }
    setPhaseOptions(Array.from(phases))
  }

  // Realtime
  const { realtimeConnected } = useRealtimeOnboarding({
    onDataUpdate: fetchSteps,
    enabled: !loading,
  })

  // Apply filters
  useEffect(() => {
    let filtered = allSteps

    if (filterOnboardingId !== "all") {
      filtered = filtered.filter((s) => s.onboarding_id === filterOnboardingId)
    }

    if (filterAssigneeId !== "all") {
      filtered = filtered.filter((s) => s.assignee?.id === filterAssigneeId)
    }

    if (filterPhase !== "all") {
      filtered = filtered.filter((s) => s.phase === filterPhase)
    }

    setSteps(filtered)
  }, [allSteps, filterOnboardingId, filterAssigneeId, filterPhase])

  useEffect(() => {
    fetchSteps()
  }, [fetchSteps])

  function getStepsForColumn(columnId: OnboardingStepStatus): StepWithRelations[] {
    return steps
      .filter((s) => s.status === columnId)
      .sort((a, b) => a.position - b.position)
  }

  function getBlockedByNames(step: StepWithRelations): string[] {
    if (!step.depends_on_step_ids || step.depends_on_step_ids.length === 0) return []

    return step.depends_on_step_ids
      .filter((depId) => {
        const depStep = allSteps.find((s) => s.id === depId)
        return depStep && depStep.status !== "completed" && depStep.status !== "skipped"
      })
      .map((depId) => stepNameMap.get(depId) || "Etapa desconhecida")
  }

  async function handleDragEnd(result: DropResult) {
    if (!result.destination) return

    const { draggableId, source, destination } = result
    const sourceStatus = source.droppableId as OnboardingStepStatus
    const destStatus = destination.droppableId as OnboardingStepStatus

    if (sourceStatus === destStatus) return

    // Validate transition
    const validTargets = VALID_DRAG_TRANSITIONS[sourceStatus] || []
    if (!validTargets.includes(destStatus)) {
      toast({
        variant: "destructive",
        title: "Movimento invalido",
        description: `Nao e possivel mover de "${getColumnTitle(sourceStatus)}" para "${getColumnTitle(destStatus)}".`,
      })
      return
    }

    const step = steps.find((s) => s.id === draggableId)
    if (!step) return

    // Optimistic update
    setAllSteps((prev) =>
      prev.map((s) =>
        s.id === draggableId ? { ...s, status: destStatus } : s
      )
    )

    try {
      const res = await fetch(`/api/onboarding/${step.onboarding_id}/steps`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step_id: step.id, status: destStatus }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      toast({
        title: "Etapa atualizada",
        description: `"${step.name}" movida para "${getColumnTitle(destStatus)}".`,
      })
    } catch {
      // Revert
      fetchSteps()
      toast({
        variant: "destructive",
        title: "Erro ao atualizar etapa",
        description: "Tente novamente.",
      })
    }
  }

  async function handleStatusChange(stepId: string, newStatus: OnboardingStepStatus) {
    const step = allSteps.find((s) => s.id === stepId)
    if (!step) return

    // Optimistic update
    setAllSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, status: newStatus } : s))
    )

    try {
      const res = await fetch(`/api/onboarding/${step.onboarding_id}/steps`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step_id: stepId, status: newStatus }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      toast({
        title: "Etapa atualizada",
        description: data.message || "Status atualizado.",
      })
    } catch {
      fetchSteps()
      toast({
        variant: "destructive",
        title: "Erro ao atualizar etapa",
        description: "Tente novamente.",
      })
    }
  }

  function getColumnTitle(status: OnboardingStepStatus): string {
    return STEP_COLUMNS.find((c) => c.id === status)?.title || status
  }

  const hasActiveFilters = filterOnboardingId !== "all" || filterAssigneeId !== "all" || filterPhase !== "all"

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          Filtros:
        </div>

        {/* Onboarding filter */}
        <Select value={filterOnboardingId} onValueChange={setFilterOnboardingId}>
          <SelectTrigger className="w-[200px] h-8 text-xs">
            <SelectValue placeholder="Todos os onboardings" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os onboardings</SelectItem>
            {onboardingOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.clientName}
                {opt.storeName && ` - ${opt.storeName}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Assignee filter */}
        <Select value={filterAssigneeId} onValueChange={setFilterAssigneeId}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="Todos os membros" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os membros</SelectItem>
            {assigneeOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Phase filter */}
        {phaseOptions.length > 0 && (
          <Select value={filterPhase} onValueChange={setFilterPhase}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="Todas as fases" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as fases</SelectItem>
              {phaseOptions.map((phase) => (
                <SelectItem key={phase} value={phase}>
                  {PHASE_LABELS[phase] || phase}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setFilterOnboardingId("all")
              setFilterAssigneeId("all")
              setFilterPhase("all")
            }}
          >
            Limpar filtros
          </Button>
        )}

        <div className="ml-auto">
          <Button variant="secondary" size="sm" className="h-8" onClick={fetchSteps}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Atualizar
            {realtimeConnected && (
              <span className="ml-1.5 h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </Button>
        </div>
      </div>

      {/* Kanban Board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-300px)]">
          {STEP_COLUMNS.map((column) => {
            const columnSteps = getStepsForColumn(column.id)

            return (
              <div
                key={column.id}
                className="flex flex-col w-[320px] flex-shrink-0 bg-card/50 rounded-lg border border-border"
              >
                {/* Column Header */}
                <div
                  className="p-4 border-b border-border rounded-t-lg"
                  style={{ borderTopColor: column.color, borderTopWidth: 3 }}
                >
                  <div className="flex items-center gap-2">
                    <span style={{ color: column.color }}>{column.icon}</span>
                    <h3 className="font-semibold text-sm">{column.title}</h3>
                    <Badge variant="neutral" className="ml-auto">
                      {columnSteps.length}
                    </Badge>
                  </div>
                </div>

                {/* Steps */}
                <Droppable droppableId={column.id}>
                  {(provided, snapshot) => (
                    <ScrollArea className="flex-1">
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                          "p-2 min-h-[200px] transition-colors",
                          snapshot.isDraggingOver && "bg-muted/50"
                        )}
                      >
                        {columnSteps.length === 0 && !snapshot.isDraggingOver && (
                          <div className="flex items-center justify-center h-24 text-muted-foreground text-xs">
                            Nenhuma etapa
                          </div>
                        )}
                        {columnSteps.map((step, index) => (
                          <Draggable
                            key={step.id}
                            draggableId={step.id}
                            index={index}
                            isDragDisabled={
                              (VALID_DRAG_TRANSITIONS[step.status] || []).length === 0
                            }
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className="mb-2"
                              >
                                <OnboardingStepCard
                                  step={step}
                                  client={step.onboarding?.client}
                                  store={step.onboarding?.store}
                                  assignee={
                                    step.assignee?.profile
                                      ? {
                                          name: step.assignee.profile.name,
                                          avatar_url: step.assignee.profile.avatar_url,
                                        }
                                      : undefined
                                  }
                                  blockedByNames={getBlockedByNames(step)}
                                  context="onboarding"
                                  onStatusChange={handleStatusChange}
                                  isDragging={snapshot.isDragging}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    </ScrollArea>
                  )}
                </Droppable>
              </div>
            )
          })}
        </div>
      </DragDropContext>
    </div>
  )
}

// =============================================
// Phase labels
// =============================================

const PHASE_LABELS: Record<string, string> = {
  pending_approval: "Aprovacao",
  generating_copies: "Gerando Copies",
  design: "Design",
  implementation: "Implementacao",
  completed: "Concluido",
}
