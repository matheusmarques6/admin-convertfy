"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd"
import { Plus, MoreHorizontal, Trash2, Edit } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DealDialog } from "./deal-dialog"
import { formatCurrency, getInitials } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import type { PipelineStage, Deal, Client, User } from "@/types"

interface DealWithRelations extends Deal {
  client?: Client
  owner?: User
}

interface PipelineBoardProps {
  stages: PipelineStage[]
  deals: DealWithRelations[]
  pipelineId?: string
}

export function PipelineBoard({ stages, deals: initialDeals, pipelineId }: PipelineBoardProps) {
  const router = useRouter()
  const [deals, setDeals] = useState(initialDeals)
  const [showNewDeal, setShowNewDeal] = useState(false)
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
  const [editingDeal, setEditingDeal] = useState<DealWithRelations | null>(null)

  async function handleDragEnd(result: DropResult) {
    if (!result.destination) return

    const { draggableId, destination } = result
    const newStageId = destination.droppableId

    // Optimistic update
    setDeals((prev) =>
      prev.map((deal) =>
        deal.id === draggableId ? { ...deal, stage_id: newStageId } : deal
      )
    )

    // Update in database
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("deals")
        .update({ stage_id: newStageId })
        .eq("id", draggableId)

      if (error) throw error

      toast({
        title: "Deal movido",
        description: "O deal foi movido com sucesso.",
      })
    } catch {
      // Revert on error
      setDeals(initialDeals)
      toast({
        variant: "destructive",
        title: "Erro ao mover deal",
        description: "Tente novamente.",
      })
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

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 h-full">
          {stages.map((stage) => {
            const stageDeals = getDealsForStage(stage.id)
            const stageTotal = getStageTotal(stage.id)

            return (
              <div
                key={stage.id}
                className="flex flex-col w-[300px] flex-shrink-0 bg-muted/50 rounded-lg"
              >
                {/* Stage Header */}
                <div
                  className="p-4 border-b border-border"
                  style={{ borderTopColor: stage.color, borderTopWidth: 3 }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{stage.name}</h3>
                      <Badge variant="secondary" className="rounded-full">
                        {stageDeals.length}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleAddDeal(stage.id)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatCurrency(stageTotal)}
                  </p>
                </div>

                {/* Deals */}
                <Droppable droppableId={stage.id}>
                  {(provided, snapshot) => (
                    <ScrollArea className="flex-1">
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`p-2 min-h-[200px] transition-colors ${
                          snapshot.isDraggingOver ? "bg-accent/50" : ""
                        }`}
                      >
                        {stageDeals.map((deal, index) => (
                          <Draggable
                            key={deal.id}
                            draggableId={deal.id}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <Card
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`mb-2 cursor-grab active:cursor-grabbing transition-shadow ${
                                  snapshot.isDragging ? "shadow-lg" : ""
                                }`}
                              >
                                <CardContent className="p-3">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium truncate">
                                        {deal.title}
                                      </p>
                                      {deal.client && (
                                        <p className="text-sm text-muted-foreground truncate">
                                          {deal.client.name}
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
                                          onClick={() => setEditingDeal(deal)}
                                        >
                                          <Edit className="mr-2 h-4 w-4" />
                                          Editar
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="text-destructive">
                                          <Trash2 className="mr-2 h-4 w-4" />
                                          Excluir
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>

                                  <p className="text-lg font-semibold text-primary mt-2">
                                    {formatCurrency(deal.value)}
                                  </p>

                                  <div className="flex items-center justify-between mt-3">
                                    {deal.owner && (
                                      <Avatar className="h-6 w-6">
                                        <AvatarImage src={deal.owner.avatar_url} />
                                        <AvatarFallback className="text-xs">
                                          {getInitials(deal.owner.name)}
                                        </AvatarFallback>
                                      </Avatar>
                                    )}
                                    {deal.probability && (
                                      <Badge variant="outline" className="text-xs">
                                        {deal.probability}%
                                      </Badge>
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
    </>
  )
}
