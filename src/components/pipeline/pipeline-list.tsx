"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { MoreHorizontal, Eye, Trash2 } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { DealDialog } from "./deal-dialog"
import { formatCurrency, getInitials } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { toast } from "@/lib/hooks/use-toast"
import type { PipelineStage, DealWithRelations, PipelineMemberRole } from "@/types"

// ─── Types ────────────────────────────────────────────────

interface PipelineListProps {
  stages: PipelineStage[]
  deals: DealWithRelations[]
  pipelineId?: string
  currentUserRole: PipelineMemberRole | null
}

// ─── Helpers ──────────────────────────────────────────────

function getStageName(stages: PipelineStage[], stageId: string): string {
  return stages.find((s) => s.id === stageId)?.name ?? "—"
}

function getStageColor(stages: PipelineStage[], stageId: string): string {
  return stages.find((s) => s.id === stageId)?.color ?? "#999"
}

// ─── PipelineList ─────────────────────────────────────────

export function PipelineList({
  stages,
  deals: initialDeals,
  pipelineId,
  currentUserRole,
}: PipelineListProps) {
  const router = useRouter()
  const [deals, setDeals] = useState(initialDeals)
  const [editingDeal, setEditingDeal] = useState<DealWithRelations | null>(null)
  const [deletingDeal, setDeletingDeal] = useState<DealWithRelations | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const canEdit = currentUserRole === "owner" || currentUserRole === "editor"

  async function handleMoveDeal(dealId: string, newStageId: string) {
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
      toast({ variant: "destructive", title: "Erro ao mover deal", description: "Tente novamente." })
    }
  }

  async function handleDeleteDeal() {
    if (!deletingDeal) return
    setIsDeleting(true)

    try {
      const res = await fetch(`/api/pipeline/deals?id=${deletingDeal.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Erro ao excluir deal")

      setDeals((prev) => prev.filter((d) => d.id !== deletingDeal.id))
      setDeletingDeal(null)
      toast({ title: "Deal excluído", description: `"${deletingDeal.title}" foi removido.` })
    } catch {
      toast({ variant: "destructive", title: "Erro ao excluir deal", description: "Tente novamente." })
    } finally {
      setIsDeleting(false)
    }
  }

  const columns: ColumnDef<DealWithRelations>[] = [
    {
      accessorKey: "title",
      header: "Deal",
      type: "text",
      mobilePriority: "title",
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
            {row.title}
          </p>
          {row.client && (
            <p className="text-xs text-gray-400 dark:text-[#5C6378] truncate mt-0.5">
              {row.client.name}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "stage_id",
      header: "Etapa",
      type: "badge",
      mobilePriority: "badge",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: getStageColor(stages, row.stage_id) }}
          />
          <span className="text-sm text-gray-700 dark:text-[#8B92A5]">
            {getStageName(stages, row.stage_id)}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "value",
      header: "Valor",
      type: "currency",
      mobilePriority: "detail",
      sortable: true,
      cell: (row) => (
        <span className="text-sm font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3]">
          {formatCurrency(row.value)}
        </span>
      ),
    },
    {
      accessorKey: "probability",
      header: "Prob.",
      type: "percentage",
      mobilePriority: "detail",
      width: "80px",
      cell: (row) => (
        <span className="text-sm font-mono tabular-nums text-gray-700 dark:text-[#8B92A5]">
          {row.probability != null ? `${row.probability}%` : "—"}
        </span>
      ),
    },
    {
      accessorKey: "owner_id",
      header: "Dono",
      type: "custom",
      mobilePriority: "hidden",
      hideOnTablet: true,
      cell: (row) =>
        row.owner ? (
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarImage src={row.owner.avatar_url} />
              <AvatarFallback className="text-[10px] bg-[#EEF0FB] text-[#4E62D8] dark:bg-[#141C3D] dark:text-[#7B8CEA]">
                {getInitials(row.owner.name)}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-gray-600 dark:text-[#8B92A5] truncate">
              {row.owner.name}
            </span>
          </div>
        ) : (
          <span className="text-sm text-gray-400 dark:text-[#5C6378]">—</span>
        ),
    },
    {
      accessorKey: "created_at",
      header: "Criado em",
      type: "date",
      mobilePriority: "hidden",
      hideOnTablet: true,
      sortable: true,
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
            <DropdownMenuItem onClick={() => setEditingDeal(row)}>
              <Icon icon={Eye} size={16} className="mr-2" />
              Editar
            </DropdownMenuItem>
            {canEdit && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] font-medium text-gray-400 dark:text-[#5C6378] uppercase tracking-[0.04em]">
                  Mover para
                </DropdownMenuLabel>
                {stages
                  .filter((s) => s.id !== row.stage_id)
                  .map((stage) => (
                    <DropdownMenuItem
                      key={stage.id}
                      onClick={() => handleMoveDeal(row.id, stage.id)}
                    >
                      <div
                        className="w-2 h-2 rounded-full mr-2 shrink-0"
                        style={{ backgroundColor: stage.color }}
                      />
                      {stage.name}
                    </DropdownMenuItem>
                  ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-[#991B1B] dark:text-[#FCA5A5]"
                  onClick={() => setDeletingDeal(row)}
                >
                  <Icon icon={Trash2} size={16} className="mr-2" />
                  Excluir
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <>
      <div className="mt-4">
        <DataTable
          columns={columns}
          data={deals}
          onRowClick={(row) => setEditingDeal(row)}
          emptyMessage="Nenhum deal encontrado"
          emptyDescription="Crie um novo deal para começar."
          rowKey="id"
        />
      </div>

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
