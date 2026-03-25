"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd"
import { Plus, MoreHorizontal, Trash2, Edit } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DealDialog } from "./deal-dialog"
import { formatCurrency, getInitials } from "@/lib/utils"
import { toast } from "@/lib/hooks/use-toast"
import { cn } from "@/lib/utils"
import type { PipelineStage, DealWithRelations, PipelineMemberRole } from "@/types"

// ─── Types ────────────────────────────────────────────────

interface PipelineBoardProps {
  stages: PipelineStage[]
  deals: DealWithRelations[]
  pipelineId?: string
  currentUserRole: PipelineMemberRole | null
}

// ─── DealCard ─────────────────────────────────────────────

interface DealCardProps {
  deal: DealWithRelations
  canEdit: boolean
  onEdit: (deal: DealWithRelations) => void
  onDelete: (deal: DealWithRelations) => void
}

function DealCard({ deal, canEdit, onEdit, onDelete }: DealCardProps) {
  return (
    <div className="flex flex-col gap-2">
      {/* Top: title + actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
            {deal.title}
          </p>
          {deal.client && (
            <p className="text-[13px] text-gray-500 dark:text-[#8B92A5] truncate">
              {deal.client.name}
            </p>
          )}
        </div>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Icon icon={MoreHorizontal} customSize={12} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(deal)}>
                <Icon icon={Edit} size={16} className="mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-[#991B1B] dark:text-[#FCA5A5]"
                onClick={() => onDelete(deal)}
              >
                <Icon icon={Trash2} size={16} className="mr-2" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Value */}
      <p className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
        {formatCurrency(deal.value)}
      </p>

      {/* Bottom: avatar + probability */}
      <div className="flex items-center justify-between">
        {deal.owner ? (
          <Avatar className="h-6 w-6">
            <AvatarImage src={deal.owner.avatar_url} />
            <AvatarFallback className="text-[10px] bg-[#EEF0FB] text-[#4E62D8] dark:bg-[#141C3D] dark:text-[#7B8CEA]">
              {getInitials(deal.owner.name)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <span />
        )}
        {deal.probability != null && (
          <Badge variant="neutral" showDot={false} className="text-[10px]">
            {deal.probability}%
          </Badge>
        )}
      </div>
    </div>
  )
}

// ─── PipelineBoard ────────────────────────────────────────

export function PipelineBoard({
  stages,
  deals: initialDeals,
  pipelineId,
  currentUserRole,
}: PipelineBoardProps) {
  const router = useRouter()
  const [deals, setDeals] = useState(initialDeals)
  const [showNewDeal, setShowNewDeal] = useState(false)
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
  const [editingDeal, setEditingDeal] = useState<DealWithRelations | null>(null)
  const [deletingDeal, setDeletingDeal] = useState<DealWithRelations | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const canEdit = currentUserRole === "owner" || currentUserRole === "editor"

  async function handleDragEnd(result: DropResult) {
    if (!result.destination || !canEdit) return

    const { draggableId, destination } = result
    const newStageId = destination.droppableId

    // Optimistic update
    setDeals((prev) =>
      prev.map((deal) =>
        deal.id === draggableId ? { ...deal, stage_id: newStageId } : deal
      )
    )

    try {
      const res = await fetch("/api/pipeline/deals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_id: draggableId, stage_id: newStageId }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erro ao mover deal")
      }

      toast({
        title: "Deal movido",
        description: "O deal foi movido com sucesso.",
      })
    } catch {
      setDeals(initialDeals)
      toast({
        variant: "destructive",
        title: "Erro ao mover deal",
        description: "Tente novamente.",
      })
    }
  }

  async function handleDeleteDeal() {
    if (!deletingDeal) return
    setIsDeleting(true)

    try {
      const res = await fetch(`/api/pipeline/deals?id=${deletingDeal.id}`, { method: "DELETE" })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erro ao excluir deal")
      }

      setDeals((prev) => prev.filter((d) => d.id !== deletingDeal.id))
      setDeletingDeal(null)

      toast({
        title: "Deal excluído",
        description: `"${deletingDeal.title}" foi removido.`,
      })
    } catch {
      toast({
        variant: "destructive",
        title: "Erro ao excluir deal",
        description: "Tente novamente.",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  function getDealsForStage(stageId: string) {
    return deals.filter((deal) => deal.stage_id === stageId)
  }

  function getStageTotal(stageId: string) {
    return getDealsForStage(stageId).reduce(
      (sum, deal) => sum + Number(deal.value),
      0
    )
  }

  function handleAddDeal(stageId: string) {
    setSelectedStageId(stageId)
    setShowNewDeal(true)
  }

  // Empty state — plain text, no icon-in-circle (Rule 19)
  if (stages.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-sm font-medium text-gray-500 dark:text-[#8B92A5]">
            {pipelineId ? "Pipeline sem etapas" : "Nenhuma pipeline selecionada"}
          </p>
          <p className="text-xs text-gray-400 dark:text-[#5C6378] mt-1">
            {pipelineId
              ? "Configure as etapas desta pipeline nas configurações."
              : "Selecione ou crie uma pipeline para começar."}
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 h-full">
          {stages.map((stage) => {
            const stageDeals = getDealsForStage(stage.id)
            const stageTotal = getStageTotal(stage.id)

            return (
              <div
                key={stage.id}
                className={cn(
                  "flex flex-col w-[280px] shrink-0 rounded-[8px]",
                  "bg-gray-50 dark:bg-[#242836]",
                )}
              >
                {/* Stage Header */}
                <div className="p-3 pb-2">
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: stage.color }}
                    />
                    <h3 className="text-[13px] font-semibold text-gray-900 dark:text-[#EAEDF3] truncate">
                      {stage.name}
                    </h3>
                    <Badge variant="neutral" showDot={false} className="text-[10px] ml-auto shrink-0">
                      {stageDeals.length}
                    </Badge>
                  </div>
                  <p className="text-[12px] text-gray-500 dark:text-[#5C6378] font-mono tabular-nums pl-[18px]">
                    {formatCurrency(stageTotal)}
                  </p>
                </div>

                {/* Deals Droppable */}
                <Droppable droppableId={stage.id} isDropDisabled={!canEdit}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        "flex-1 overflow-y-auto p-2 pt-0 space-y-2 min-h-[120px]",
                        "transition-colors duration-150",
                        snapshot.isDraggingOver && "bg-[#4E62D8]/5 dark:bg-[#7B8CEA]/5",
                      )}
                    >
                      {stageDeals.map((deal, index) => (
                        <Draggable
                          key={deal.id}
                          draggableId={deal.id}
                          index={index}
                          isDragDisabled={!canEdit}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={cn(
                                "group rounded-[8px] border p-3",
                                "border-[rgba(0,0,0,0.08)] bg-white",
                                "dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]",
                                "transition-all duration-150",
                                canEdit && "cursor-grab active:cursor-grabbing",
                                canEdit && !snapshot.isDragging && "hover:shadow-sm",
                                snapshot.isDragging && "shadow-md opacity-95 scale-[1.02]",
                              )}
                            >
                              <DealCard
                                deal={deal}
                                canEdit={canEdit}
                                onEdit={setEditingDeal}
                                onDelete={setDeletingDeal}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}

                      {/* Empty stage — plain text (Rule 19) */}
                      {stageDeals.length === 0 && !snapshot.isDraggingOver && (
                        <p className="text-xs text-gray-400 dark:text-[#5C6378] text-center py-6">
                          Nenhum deal nesta etapa
                        </p>
                      )}
                    </div>
                  )}
                </Droppable>

                {/* Add deal button */}
                {canEdit && (
                  <div className="p-2 pt-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-gray-500 dark:text-[#5C6378] hover:text-gray-700 dark:hover:text-[#8B92A5]"
                      onClick={() => handleAddDeal(stage.id)}
                    >
                      <Icon icon={Plus} size={16} className="mr-1.5" />
                      Adicionar
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </DragDropContext>

      {/* New Deal Dialog */}
      <DealDialog
        open={showNewDeal}
        onOpenChange={setShowNewDeal}
        pipelineId={pipelineId}
        stageId={selectedStageId || undefined}
        onSuccess={() => router.refresh()}
      />

      {/* Edit Deal Dialog */}
      <DealDialog
        open={!!editingDeal}
        onOpenChange={() => setEditingDeal(null)}
        deal={editingDeal || undefined}
        pipelineId={pipelineId}
        onSuccess={() => router.refresh()}
      />

      {/* Delete Deal Confirmation */}
      <AlertDialog
        open={!!deletingDeal}
        onOpenChange={() => setDeletingDeal(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir deal</AlertDialogTitle>
            <AlertDialogDescription>
              O deal &quot;{deletingDeal?.title}&quot; será excluído
              permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDeal}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
