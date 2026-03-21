"use client"

import { useState, useEffect, useCallback } from "react"
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd"
import {
  Plus,
  MoreHorizontal,
  User,
  CheckCircle2,
  Building2,
  Loader2,
  RefreshCw,
  Store,
  Calendar,
  AlertCircle,
  FileText,
  Clock,
  Sparkles,
  Palette,
  Code2,
  Layers,
  ListChecks,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { toast } from "@/lib/hooks/use-toast"
import { useRealtimeOnboarding } from "@/hooks/use-realtime-onboarding"
import { cn, getInitials } from "@/lib/utils"
import type { OnboardingStatus, Client } from "@/types"
import { OnboardingStepsKanban } from "./onboarding-steps-kanban"

interface OnboardingWithRelations {
  id: string
  client_id: string
  store_id?: string
  template_id?: string
  status: OnboardingStatus
  current_phase?: string
  progress_percent: number
  assigned_to?: string
  started_at?: string
  submitted_at?: string
  target_completion_date?: string
  completed_at?: string
  notes?: string
  created_at: string
  updated_at: string
  form_complete?: boolean
  client?: {
    id: string
    name: string
    company?: string
    email?: string
  }
  store?: {
    id: string
    store_name: string
    platform?: string
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

interface StepWithAssignee {
  id: string
  onboarding_id: string
  name: string
  description?: string
  category: string
  position: number
  status: "pending" | "in_progress" | "completed" | "blocked" | "skipped"
  started_at?: string
  completed_at?: string
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

interface OrgMember {
  id: string
  role: string
  profile?: {
    id: string
    name: string
    email: string
    avatar_url?: string
  }
}

interface StageConfig {
  id: OnboardingStatus
  name: string
  color: string
  icon: React.ReactNode
}

// New phase-based stages
const STAGES: StageConfig[] = [
  { id: "pending_approval", name: "Aguardando Aprovação", color: "#F97316", icon: <Clock className="h-4 w-4" /> },
  { id: "generating_copies", name: "Gerando Copies", color: "#06B6D4", icon: <Sparkles className="h-4 w-4" /> },
  { id: "design", name: "Design", color: "#EC4899", icon: <Palette className="h-4 w-4" /> },
  { id: "implementation", name: "Implementação", color: "#3B82F6", icon: <Code2 className="h-4 w-4" /> },
  { id: "completed", name: "Concluído", color: "#22C55E", icon: <CheckCircle2 className="h-4 w-4" /> },
]

// Legacy stages for backward compatibility
const LEGACY_STAGES: OnboardingStatus[] = ["not_started", "in_progress", "paused"]

const STEP_CATEGORIES: Record<string, { label: string; color: string }> = {
  preparacao: { label: "Preparação", color: "#6366F1" },
  integracao: { label: "Integração", color: "var(--primary)" },
  configuracao: { label: "Configuração", color: "#EC4899" },
  lancamento: { label: "Lançamento", color: "#10B981" },
}

export function OnboardingKanban() {
  const [viewMode, setViewMode] = useState<"pipeline" | "steps">("pipeline")
  const [onboardings, setOnboardings] = useState<OnboardingWithRelations[]>([])
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)

  // Dialog states
  const [selectedOnboarding, setSelectedOnboarding] = useState<OnboardingWithRelations | null>(null)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [showNewOnboardingDialog, setShowNewOnboardingDialog] = useState(false)
  const [showAssignDialog, setShowAssignDialog] = useState(false)

  // Steps state
  const [steps, setSteps] = useState<StepWithAssignee[]>([])
  const [loadingSteps, setLoadingSteps] = useState(false)

  // New onboarding form
  const [newOnboardingClientId, setNewOnboardingClientId] = useState("")

  // Realtime subscription: auto-refresh when onboardings change in DB
  const { realtimeConnected } = useRealtimeOnboarding({
    onDataUpdate: useCallback(() => {
      fetch("/api/onboarding")
        .then((res) => res.json())
        .then((data) => {
          if (data.onboardings) {
            setOnboardings((prev) => {
              // Preserve form_complete from previous state
              const formMap = new Map(prev.map((o) => [o.id, o.form_complete]))
              return data.onboardings.map((o: OnboardingWithRelations) => ({
                ...o,
                form_complete: formMap.get(o.id),
              }))
            })
          }
        })
        .catch((err) => console.warn("[RealtimeOnboarding] Background refresh failed:", err))
    }, []),
    enabled: !loading,
  })

  const fetchOnboardings = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding")
      const data = await res.json()
      if (data.onboardings) {
        const onboardingsWithForm = data.onboardings.map(
          (o: OnboardingWithRelations) => ({ ...o, form_complete: undefined as boolean | undefined })
        )
        setOnboardings(onboardingsWithForm)

        // Fetch form status for each onboarding with a store
        for (const o of onboardingsWithForm) {
          if (o.store_id) {
            fetch(`/api/onboarding/store-data?store_id=${o.store_id}`)
              .then((r) => r.json())
              .then((d) => {
                setOnboardings((prev) =>
                  prev.map((item) =>
                    item.id === o.id
                      ? { ...item, form_complete: d.onboarding_data?.is_complete || false }
                      : item
                  )
                )
              })
              .catch(() => {})
          }
        }
      }
    } catch (error) {
      console.error("Error fetching onboardings:", error)
      toast({
        variant: "destructive",
        title: "Erro ao carregar onboardings",
        description: "Tente novamente.",
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchOrgMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/org-members")
      const data = await res.json()
      if (data.members) {
        setOrgMembers(data.members)
      }
    } catch (error) {
      console.error("Error fetching org members:", error)
    }
  }, [])

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch("/api/clients?status=lead,active")
      const data = await res.json()
      if (data.clients) {
        // Filter clients that don't have an active onboarding
        const clientsWithoutOnboarding = data.clients.filter(
          (client: Client) => !onboardings.some(
            (o) => o.client_id === client.id && o.status !== "completed"
          )
        )
        setClients(clientsWithoutOnboarding)
      }
    } catch (error) {
      console.error("Error fetching clients:", error)
    }
  }, [onboardings])

  const fetchSteps = useCallback(async (onboardingId: string) => {
    setLoadingSteps(true)
    try {
      const res = await fetch(`/api/onboarding/${onboardingId}/steps`)
      const data = await res.json()
      if (data.steps) {
        setSteps(data.steps)
      }
    } catch (error) {
      console.error("Error fetching steps:", error)
      toast({
        variant: "destructive",
        title: "Erro ao carregar etapas",
        description: "Tente novamente.",
      })
    } finally {
      setLoadingSteps(false)
    }
  }, [])

  useEffect(() => {
    fetchOnboardings()
    fetchOrgMembers()
  }, [fetchOnboardings, fetchOrgMembers])

  useEffect(() => {
    if (showNewOnboardingDialog) {
      fetchClients()
    }
  }, [showNewOnboardingDialog, fetchClients])

  useEffect(() => {
    if (selectedOnboarding && showDetailsDialog) {
      fetchSteps(selectedOnboarding.id)
    }
  }, [selectedOnboarding, showDetailsDialog, fetchSteps])

  async function handleDragEnd(result: DropResult) {
    if (!result.destination) return

    const { draggableId, destination } = result
    const newStatus = destination.droppableId as OnboardingStatus

    // Optimistic update
    setOnboardings((prev) =>
      prev.map((onboarding) =>
        onboarding.id === draggableId ? { ...onboarding, status: newStatus } : onboarding
      )
    )

    try {
      const res = await fetch(`/api/onboarding/${draggableId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const stageName = STAGES.find((s) => s.id === newStatus)?.name || newStatus

      toast({
        title: "Status atualizado",
        description: `Onboarding movido para "${stageName}".`,
      })
    } catch {
      // Revert on error
      fetchOnboardings()
      toast({
        variant: "destructive",
        title: "Erro ao atualizar status",
        description: "Tente novamente.",
      })
    }
  }

  async function handleAssignOnboarding(onboardingId: string, memberId: string | null) {
    try {
      const res = await fetch(`/api/onboarding/${onboardingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_to: memberId }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const member = orgMembers.find((m) => m.id === memberId)

      setOnboardings((prev) =>
        prev.map((onboarding) =>
          onboarding.id === onboardingId
            ? {
                ...onboarding,
                assigned_to: memberId || undefined,
                assignee: member,
              }
            : onboarding
        )
      )

      toast({
        title: "Responsável atribuído",
        description: memberId ? "Responsável atualizado com sucesso." : "Responsável removido.",
      })

      setShowAssignDialog(false)
    } catch {
      toast({
        variant: "destructive",
        title: "Erro ao atribuir responsável",
        description: "Tente novamente.",
      })
    }
  }

  async function handleCreateOnboarding() {
    if (!newOnboardingClientId) return

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: newOnboardingClientId }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      toast({
        title: "Onboarding iniciado",
        description: "Novo onboarding criado com sucesso.",
      })

      setShowNewOnboardingDialog(false)
      setNewOnboardingClientId("")
      fetchOnboardings()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tente novamente."
      toast({
        variant: "destructive",
        title: "Erro ao criar onboarding",
        description: message,
      })
    }
  }

  async function handleToggleStep(stepId: string, currentStatus: string) {
    if (!selectedOnboarding) return

    const newStatus = currentStatus === "completed" ? "pending" : "completed"

    // Optimistic update
    setSteps((prev) =>
      prev.map((step) =>
        step.id === stepId ? { ...step, status: newStatus as "pending" | "in_progress" | "completed" | "blocked" | "skipped" } : step
      )
    )

    try {
      const res = await fetch(`/api/onboarding/${selectedOnboarding.id}/steps`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step_id: stepId, status: newStatus }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // Update onboarding progress
      setOnboardings((prev) =>
        prev.map((o) =>
          o.id === selectedOnboarding.id
            ? { ...o, progress_percent: data.onboarding_progress, status: data.onboarding_status }
            : o
        )
      )

      // Update selected onboarding
      setSelectedOnboarding((prev) =>
        prev
          ? { ...prev, progress_percent: data.onboarding_progress, status: data.onboarding_status }
          : prev
      )

      toast({
        title: newStatus === "completed" ? "Etapa concluída" : "Etapa reaberta",
        description: data.message,
      })
    } catch {
      // Revert on error
      if (selectedOnboarding) {
        fetchSteps(selectedOnboarding.id)
      }
      toast({
        variant: "destructive",
        title: "Erro ao atualizar etapa",
        description: "Tente novamente.",
      })
    }
  }

  function getOnboardingsForStage(stageId: OnboardingStatus) {
    return onboardings.filter((o) => {
      const phase = o.current_phase || o.status
      // Map legacy statuses to the first phase column
      if (stageId === "pending_approval" && LEGACY_STAGES.includes(phase as OnboardingStatus)) {
        return true
      }
      return phase === stageId
    })
  }

  function formatDate(dateString: string | undefined) {
    if (!dateString) return null
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
    })
  }

  function isOverdue(targetDate: string | undefined) {
    if (!targetDate) return false
    return new Date(targetDate) < new Date()
  }

  // Group steps by category
  const groupedSteps = steps.reduce((acc, step) => {
    if (!acc[step.category]) {
      acc[step.category] = []
    }
    acc[step.category].push(step)
    return acc
  }, {} as Record<string, StepWithAssignee[]>)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Onboarding de Clientes</h2>
          <p className="text-muted-foreground">
            {onboardings.filter((o) => o.status !== "completed").length} clientes em onboarding
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex bg-muted/50 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("pipeline")}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs h-8 px-3 rounded-md font-medium transition-all",
                viewMode === "pipeline"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              Pipeline
            </button>
            <button
              type="button"
              onClick={() => setViewMode("steps")}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs h-8 px-3 rounded-md font-medium transition-all",
                viewMode === "steps"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ListChecks className="h-3.5 w-3.5" />
              Etapas
            </button>
          </div>

          {viewMode === "pipeline" && (
            <Button variant="outline" size="sm" onClick={fetchOnboardings} title={realtimeConnected ? "Atualização automática ativa" : "Clique para atualizar"}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
              {realtimeConnected && (
                <span className="ml-1.5 h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </Button>
          )}
          <Button onClick={() => setShowNewOnboardingDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Onboarding
          </Button>
        </div>
      </div>

      {/* Steps View */}
      {viewMode === "steps" && <OnboardingStepsKanban />}

      {/* Pipeline Kanban Board */}
      {viewMode === "pipeline" && (
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-220px)]">
          {STAGES.map((stage) => {
            const stageOnboardings = getOnboardingsForStage(stage.id)

            return (
              <div
                key={stage.id}
                className="flex flex-col w-[320px] flex-shrink-0 bg-card/50 rounded-lg border border-border"
              >
                {/* Stage Header */}
                <div
                  className="p-4 border-b border-border rounded-t-lg"
                  style={{ borderTopColor: stage.color, borderTopWidth: 3 }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span style={{ color: stage.color }}>{stage.icon}</span>
                      <h3 className="font-semibold">{stage.name}</h3>
                      <Badge variant="secondary" className="rounded-full">
                        {stageOnboardings.length}
                      </Badge>
                    </div>
                    {stage.id === "pending_approval" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setShowNewOnboardingDialog(true)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Onboardings */}
                <Droppable droppableId={stage.id}>
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
                        {stageOnboardings.map((onboarding, index) => (
                          <Draggable
                            key={onboarding.id}
                            draggableId={onboarding.id}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <Card
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={cn(
                                  "mb-2 cursor-grab active:cursor-grabbing transition-shadow bg-card border-border hover:border-border",
                                  snapshot.isDragging && "shadow-lg shadow-black/50",
                                  isOverdue(onboarding.target_completion_date) &&
                                    onboarding.status !== "completed" &&
                                    "border-destructive/50"
                                )}
                              >
                                <CardContent className="p-3">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium truncate">
                                        {onboarding.client?.name || "Cliente"}
                                      </p>
                                      {onboarding.client?.company &&
                                        onboarding.client.company !== onboarding.client.name && (
                                          <p className="text-sm text-muted-foreground truncate">
                                            {onboarding.client.company}
                                          </p>
                                        )}
                                    </div>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 flex-shrink-0"
                                        >
                                          <MoreHorizontal className="h-3 w-3" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                          onClick={() => {
                                            setSelectedOnboarding(onboarding)
                                            setShowDetailsDialog(true)
                                          }}
                                        >
                                          <CheckCircle2 className="mr-2 h-4 w-4" />
                                          Ver Etapas
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => {
                                            setSelectedOnboarding(onboarding)
                                            setShowAssignDialog(true)
                                          }}
                                        >
                                          <User className="mr-2 h-4 w-4" />
                                          Atribuir Responsável
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        {onboarding.store_id && (
                                          <DropdownMenuItem asChild>
                                            <a href={`/admin/stores/${onboarding.store_id}`}>
                                              <Store className="mr-2 h-4 w-4" />
                                              Ver Loja
                                            </a>
                                          </DropdownMenuItem>
                                        )}
                                        <DropdownMenuItem asChild>
                                          <a href={`/admin/clients/${onboarding.client_id}`}>
                                            <Building2 className="mr-2 h-4 w-4" />
                                            Ver Cliente
                                          </a>
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>

                                  {/* Store info */}
                                  {onboarding.store && (
                                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                                      <Store className="h-3 w-3" />
                                      <span className="truncate">{onboarding.store.store_name}</span>
                                      {onboarding.store.platform && (
                                        <Badge variant="outline" className="text-[10px] ml-1">
                                          {onboarding.store.platform}
                                        </Badge>
                                      )}
                                    </div>
                                  )}

                                  {/* Form status badge */}
                                  {onboarding.form_complete !== undefined && (
                                    <div className="mt-2">
                                      {onboarding.form_complete ? (
                                        <Badge variant="success" className="text-[10px]">
                                          <CheckCircle2 className="h-3 w-3 mr-1" />
                                          Formulário preenchido
                                        </Badge>
                                      ) : (
                                        <Badge variant="warning" className="text-[10px]">
                                          <FileText className="h-3 w-3 mr-1" />
                                          Formulário pendente
                                        </Badge>
                                      )}
                                    </div>
                                  )}

                                  {/* Progress bar */}
                                  <div className="mt-3">
                                    <div className="flex items-center justify-between text-xs mb-1">
                                      <span className="text-muted-foreground">Progresso</span>
                                      <span className="font-medium">{onboarding.progress_percent}%</span>
                                    </div>
                                    <Progress value={onboarding.progress_percent} className="h-1.5" />
                                  </div>

                                  {/* Footer */}
                                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
                                    {onboarding.assignee?.profile ? (
                                      <div className="flex items-center gap-1.5">
                                        <Avatar className="h-5 w-5">
                                          <AvatarImage src={onboarding.assignee.profile.avatar_url} />
                                          <AvatarFallback className="text-[10px]">
                                            {getInitials(onboarding.assignee.profile.name)}
                                          </AvatarFallback>
                                        </Avatar>
                                        <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                                          {onboarding.assignee.profile.name}
                                        </span>
                                      </div>
                                    ) : (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-xs text-muted-foreground"
                                        onClick={() => {
                                          setSelectedOnboarding(onboarding)
                                          setShowAssignDialog(true)
                                        }}
                                      >
                                        <User className="h-3 w-3 mr-1" />
                                        Atribuir
                                      </Button>
                                    )}

                                    {onboarding.target_completion_date && (
                                      <div
                                        className={cn(
                                          "flex items-center gap-1 text-xs",
                                          isOverdue(onboarding.target_completion_date) &&
                                            onboarding.status !== "completed"
                                            ? "text-destructive"
                                            : "text-muted-foreground"
                                        )}
                                      >
                                        {isOverdue(onboarding.target_completion_date) &&
                                        onboarding.status !== "completed" ? (
                                          <AlertCircle className="h-3 w-3" />
                                        ) : (
                                          <Calendar className="h-3 w-3" />
                                        )}
                                        {formatDate(onboarding.target_completion_date)}
                                      </div>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
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
      )}

      {/* New Onboarding Dialog */}
      <Dialog open={showNewOnboardingDialog} onOpenChange={setShowNewOnboardingDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Onboarding</DialogTitle>
            <DialogDescription>
              Selecione um cliente para iniciar o processo de onboarding.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select value={newOnboardingClientId} onValueChange={setNewOnboardingClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                      Nenhum cliente disponível
                    </div>
                  ) : (
                    clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                        {client.company && client.company !== client.name && (
                          <span className="text-muted-foreground ml-1">({client.company})</span>
                        )}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewOnboardingDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateOnboarding} disabled={!newOnboardingClientId}>
              Iniciar Onboarding
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Atribuir Responsável</DialogTitle>
            <DialogDescription>
              Selecione quem será responsável pelo onboarding de{" "}
              {selectedOnboarding?.client?.name}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>Responsável</Label>
            <Select
              value={selectedOnboarding?.assigned_to || "none"}
              onValueChange={(v) =>
                handleAssignOnboarding(selectedOnboarding?.id || "", v === "none" ? null : v)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {orgMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.profile?.name || member.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogContent>
      </Dialog>

      {/* Steps Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {selectedOnboarding?.client?.name}
            </DialogTitle>
            <DialogDescription>
              Acompanhe o progresso das etapas do onboarding.
            </DialogDescription>
          </DialogHeader>

          {selectedOnboarding && (
            <div className="space-y-4">
              {/* Progress Summary */}
              <div className="flex items-center gap-4 p-4 bg-card rounded-lg border border-border">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Progresso Geral</span>
                    <span className="text-lg font-bold">
                      {selectedOnboarding.progress_percent}%
                    </span>
                  </div>
                  <Progress value={selectedOnboarding.progress_percent} className="h-2" />
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge
                    style={{
                      backgroundColor:
                        STAGES.find((s) => s.id === selectedOnboarding.status)?.color + "20",
                      color: STAGES.find((s) => s.id === selectedOnboarding.status)?.color,
                    }}
                  >
                    {STAGES.find((s) => s.id === selectedOnboarding.status)?.name}
                  </Badge>
                </div>
              </div>

              {/* Steps List */}
              <ScrollArea className="h-[400px] pr-4">
                {loadingSteps ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : Object.keys(groupedSteps).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhuma etapa encontrada.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(groupedSteps).map(([category, categorySteps]) => {
                      const categoryConfig = STEP_CATEGORIES[category] || {
                        label: category,
                        color: "#6B7280",
                      }
                      const completedCount = categorySteps.filter(
                        (s) => s.status === "completed"
                      ).length

                      return (
                        <div key={category}>
                          <div className="flex items-center gap-2 mb-3">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: categoryConfig.color }}
                            />
                            <h4 className="font-medium">{categoryConfig.label}</h4>
                            <span className="text-xs text-muted-foreground">
                              {completedCount}/{categorySteps.length}
                            </span>
                          </div>

                          <div className="space-y-2 ml-4">
                            {categorySteps.map((step) => (
                              <div
                                key={step.id}
                                className={cn(
                                  "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                                  step.status === "completed"
                                    ? "bg-card/50 border-border"
                                    : "bg-card border-border hover:border-border"
                                )}
                              >
                                <Checkbox
                                  checked={step.status === "completed"}
                                  onCheckedChange={() => handleToggleStep(step.id, step.status)}
                                  className="mt-0.5"
                                />
                                <div className="flex-1 min-w-0">
                                  <p
                                    className={cn(
                                      "font-medium text-sm",
                                      step.status === "completed" && "line-through text-muted-foreground"
                                    )}
                                  >
                                    {step.name}
                                  </p>
                                  {step.description && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {step.description}
                                    </p>
                                  )}
                                  {step.completed_at && (
                                    <p className="text-xs text-success mt-1">
                                      Concluído em{" "}
                                      {new Date(step.completed_at).toLocaleDateString("pt-BR")}
                                    </p>
                                  )}
                                </div>
                                {step.status === "blocked" && (
                                  <Badge variant="destructive" className="text-xs">
                                    Bloqueado
                                  </Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
