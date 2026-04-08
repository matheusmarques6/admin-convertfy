"use client"

import Link from "next/link"
import { Pencil, MoreHorizontal, Mail, Calendar, FileText, Trash2 } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "@/lib/hooks/use-toast"
import { getInitials, formatCurrency } from "@/lib/utils"
import { cn } from "@/lib/utils"
import type { Client, Contract, User } from "@/types"

// ─── Types ────────────────────────────────────────────────

export interface ClientWithRelations extends Client {
  owner?: User
  contracts?: Contract[]
  client_stores?: { id: string; store_name: string; platform: string; is_active: boolean }[]
}

interface ClientHeaderProps {
  client: ClientWithRelations
}

// ─── MiniKpi ──────────────────────────────────────────────

interface MiniKpiProps {
  label: string
  value: string
  isLast?: boolean
}

function MiniKpi({ label, value, isLast }: MiniKpiProps) {
  return (
    <div className={cn(
      "text-center sm:text-left",
      !isLast && "sm:border-r sm:border-[rgba(0,0,0,0.08)] sm:dark:border-[rgba(255,255,255,0.08)]",
      "sm:px-4 first:sm:pl-0 last:sm:pr-0",
    )}>
      <p className="text-[12px] font-medium text-gray-500 dark:text-[#5C6378] uppercase tracking-[0.04em]">
        {label}
      </p>
      <p className="text-base font-semibold text-gray-900 dark:text-[#EAEDF3] mt-0.5 font-mono tabular-nums">
        {value}
      </p>
    </div>
  )
}

// ─── ClientHeader ─────────────────────────────────────────

export function ClientHeader({ client }: ClientHeaderProps) {
  const router = useRouter()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Derive data
  const activeContract = client.contracts?.find((c) => c.status === "active")
  const mrr = activeContract?.monthly_value ?? 0
  const storeCount = client.client_stores?.length ?? 0
  const healthScore = client.health_score ?? 50

  async function handleDelete() {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/clients/manage?id=${client.id}`, { method: "DELETE" })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erro ao excluir cliente")
      }
      toast({ title: "Cliente excluído", description: "O cliente foi excluído com sucesso." })
      router.push("/admin/clients")
      router.refresh()
    } catch {
      toast({ variant: "destructive", title: "Erro ao excluir", description: "Não foi possível excluir o cliente." })
    } finally {
      setIsDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  return (
    <>
      <div className={cn(
        "rounded-[8px] border p-5",
        "border-[rgba(0,0,0,0.08)] bg-white",
        "dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]",
      )}>
        {/* Top row: Avatar + Info + Actions */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          {/* Avatar */}
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarFallback className="bg-[#EEF0FB] text-[#4E62D8] dark:bg-[#141C3D] dark:text-[#7B8CEA] text-base font-semibold">
              {getInitials(client.name)}
            </AvatarFallback>
          </Avatar>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-lg font-semibold text-gray-900 dark:text-[#EAEDF3]">
                {client.name}
              </h1>
              <StatusBadge status={client.status} />
            </div>
            <p className="text-sm text-gray-500 dark:text-[#8B92A5] mt-0.5">
              {client.email}
              {client.company && (
                <span className="text-gray-400 dark:text-[#5C6378]"> · {client.company}</span>
              )}
            </p>
            {client.tags && client.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {client.tags.map((tag: string) => (
                  <Badge key={tag} variant="neutral" showDot={false} className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Actions — desktop: inline | mobile: full-width below */}
          <div className="flex gap-2 shrink-0 w-full sm:w-auto">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 sm:flex-initial"
              asChild
            >
              <Link href={`/admin/clients/${client.id}/edit`}>
                <Icon icon={Pencil} size={16} className="mr-1.5" />
                Editar
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <Icon icon={MoreHorizontal} size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Ações</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => window.open(`mailto:${client.email}`)}>
                  <Mail className="mr-2 h-4 w-4" />
                  Enviar email
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/admin/meetings/new?clientId=${client.id}`}>
                    <Calendar className="mr-2 h-4 w-4" />
                    Agendar Reunião
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/admin/reports/new?clientId=${client.id}`}>
                    <FileText className="mr-2 h-4 w-4" />
                    Criar Relatório
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-[#991B1B] dark:text-[#FCA5A5]"
                  onSelect={(e) => {
                    e.preventDefault()
                    setShowDeleteDialog(true)
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir cliente
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Mini KPIs — divider + 4 metrics inline */}
        <div className={cn(
          "mt-5 pt-5",
          "border-t border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
          "grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-0",
        )}>
          <MiniKpi label="MRR" value={mrr > 0 ? formatCurrency(mrr) : "—"} />
          <MiniKpi label="Lojas" value={storeCount.toString()} />
          <MiniKpi label="Plano" value={activeContract?.plan_name ?? "—"} />
          <MiniKpi label="Health Score" value={`${healthScore}/100`} isLast />
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o cliente &quot;{client.name}&quot;?
              Esta ação não pode ser desfeita e todos os dados relacionados serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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
