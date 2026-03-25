"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, Plus, ArrowRightLeft } from "lucide-react"
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
import { DealDialog } from "./deal-dialog"
import { formatCurrency, getInitials } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { toast } from "@/lib/hooks/use-toast"
import type { PipelineStage, DealWithRelations, PipelineMemberRole } from "@/types"

// ─── Types ────────────────────────────────────────────────

interface PipelineMobileProps {
  stages: PipelineStage[]
  deals: DealWithRelations[]
  pipelineId?: string
  currentUserRole: PipelineMemberRole | null
}

// ─── MobileDealCard ───────────────────────────────────────

interface MobileDealCardProps {
  deal: DealWithRelations
  stages: PipelineStage[]
  currentStageId: string
  canEdit: boolean
  onMove: (dealId: string, newStageId: string) => void
}

function MobileDealCard({ deal, stages, currentStageId, canEdit, onMove }: MobileDealCardProps) {
  return (
    <div className={cn(
      "rounded-[8px] border p-4",
      "border-[rgba(0,0,0,0.08)] bg-white",
      "dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]",
      "active:bg-gray-50 dark:active:bg-[#242836]",
      "transition-colors duration-150",
    )}>
      {/* Title + client */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3]">
            {deal.title}
          </p>
          {deal.client && (
            <p className="text-[13px] text-gray-500 dark:text-[#8B92A5] truncate mt-0.5">
              {deal.client.name}
            </p>
          )}
        </div>
        {deal.probability != null && (
          <Badge variant="neutral" showDot={false} className="text-[10px] shrink-0">
            {deal.probability}%
          </Badge>
        )}
      </div>

      {/* Value + owner */}
      <div className="flex items-center justify-between mt-3">
        <p className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
          {formatCurrency(deal.value)}
        </p>
        {deal.owner && (
          <Avatar className="h-6 w-6">
            <AvatarImage src={deal.owner.avatar_url} />
            <AvatarFallback className="text-[10px] bg-[#EEF0FB] text-[#4E62D8] dark:bg-[#141C3D] dark:text-[#7B8CEA]">
              {getInitials(deal.owner.name)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>

      {/* "Mover para..." action — replaces drag on mobile */}
      {canEdit && (
        <div className="mt-3 pt-3 border-t border-[rgba(0,0,0,0.05)] dark:border-[rgba(255,255,255,0.05)]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(
                "w-full flex items-center justify-center gap-2",
                "text-xs font-medium text-gray-400 dark:text-[#5C6378]",
                "hover:text-gray-600 dark:hover:text-[#8B92A5]",
                "min-h-[36px] transition-colors duration-150",
              )}>
                <Icon icon={ArrowRightLeft} customSize={14} />
                Mover para...
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-48">
              {stages
                .filter((s) => s.id !== currentStageId)
                .map((stage) => (
                  <DropdownMenuItem
                    key={stage.id}
                    onClick={() => onMove(deal.id, stage.id)}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full mr-2 shrink-0"
                      style={{ backgroundColor: stage.color }}
                    />
                    {stage.name}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}

// ─── PipelineMobile ───────────────────────────────────────

export function PipelineMobile({
  stages,
  deals: initialDeals,
  pipelineId,
  currentUserRole,
}: PipelineMobileProps) {
  const router = useRouter()
  const [deals, setDeals] = useState(initialDeals)
  const [activeIndex, setActiveIndex] = useState(0)
  const [showNewDeal, setShowNewDeal] = useState(false)
  const touchStartX = useRef(0)

  const canEdit = currentUserRole === "owner" || currentUserRole === "editor"
  const activeStage = stages[activeIndex]

  if (!activeStage) {
    return (
      <p className="text-sm text-gray-400 dark:text-[#5C6378] text-center py-12">
        Nenhuma etapa configurada
      </p>
    )
  }

  const stageDeals = deals.filter((d) => d.stage_id === activeStage.id)

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (diff > 50 && activeIndex < stages.length - 1) {
      setActiveIndex((prev) => prev + 1)
    } else if (diff < -50 && activeIndex > 0) {
      setActiveIndex((prev) => prev - 1)
    }
  }

  async function handleMoveDeal(dealId: string, newStageId: string) {
    // Optimistic update
    setDeals((prev) =>
      prev.map((deal) =>
        deal.id === dealId ? { ...deal, stage_id: newStageId } : deal
      )
    )

    try {
      const res = await fetch("/api/pipeline/deals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_id: dealId, stage_id: newStageId }),
      })
      if (!res.ok) throw new Error("Erro ao mover deal")

      toast({ title: "Deal movido", description: "O deal foi movido com sucesso." })
    } catch {
      setDeals(initialDeals)
      toast({
        variant: "destructive",
        title: "Erro ao mover deal",
        description: "Tente novamente.",
      })
    }
  }

  return (
    <div className="mt-4">
      {/* Navigation header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <button
          onClick={() => setActiveIndex((prev) => Math.max(0, prev - 1))}
          disabled={activeIndex === 0}
          className={cn(
            "p-2 rounded-[6px] min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors",
            activeIndex === 0
              ? "text-gray-200 dark:text-[#242836]"
              : "text-gray-500 dark:text-[#8B92A5] hover:bg-gray-50 dark:hover:bg-[#242836]",
          )}
        >
          <ChevronLeft size={20} strokeWidth={2} />
        </button>

        <div className="text-center">
          <div className="flex items-center justify-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: activeStage.color }}
            />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3]">
              {activeStage.name}
            </h3>
          </div>
          <span className="text-xs text-gray-500 dark:text-[#8B92A5]">
            {stageDeals.length} deal{stageDeals.length !== 1 ? "s" : ""} · {formatCurrency(
              stageDeals.reduce((sum, d) => sum + Number(d.value), 0)
            )}
          </span>
        </div>

        <button
          onClick={() => setActiveIndex((prev) => Math.min(stages.length - 1, prev + 1))}
          disabled={activeIndex === stages.length - 1}
          className={cn(
            "p-2 rounded-[6px] min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors",
            activeIndex === stages.length - 1
              ? "text-gray-200 dark:text-[#242836]"
              : "text-gray-500 dark:text-[#8B92A5] hover:bg-gray-50 dark:hover:bg-[#242836]",
          )}
        >
          <ChevronRight size={20} strokeWidth={2} />
        </button>
      </div>

      {/* Dots indicator */}
      <div className="flex items-center justify-center gap-1.5 mb-4">
        {stages.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveIndex(i)}
            className={cn(
              "rounded-full transition-all duration-150",
              i === activeIndex
                ? "w-6 h-2 bg-[#4E62D8] dark:bg-[#7B8CEA]"
                : "w-2 h-2 bg-gray-200 dark:bg-[#242836]",
            )}
          />
        ))}
      </div>

      {/* Cards */}
      <div
        className="space-y-3 px-1"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {stageDeals.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-[#5C6378] text-center py-12">
            Nenhum deal nesta etapa
          </p>
        ) : (
          stageDeals.map((deal) => (
            <MobileDealCard
              key={deal.id}
              deal={deal}
              stages={stages}
              currentStageId={activeStage.id}
              canEdit={canEdit}
              onMove={handleMoveDeal}
            />
          ))
        )}

        {/* Add deal button */}
        {canEdit && (
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => setShowNewDeal(true)}
          >
            <Icon icon={Plus} size={16} className="mr-1.5" />
            Novo Deal
          </Button>
        )}
      </div>

      {/* New Deal Dialog */}
      <DealDialog
        open={showNewDeal}
        onOpenChange={setShowNewDeal}
        pipelineId={pipelineId}
        stageId={activeStage.id}
        onSuccess={() => router.refresh()}
      />
    </div>
  )
}
