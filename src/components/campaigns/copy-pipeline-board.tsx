"use client"

import { useState, useEffect, useCallback } from "react"
import {
  CheckCircle2,
  Clock,
  Paintbrush,
  Rocket,
  Sparkles,
  User,
  ChevronRight,
  Loader2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { usePermissions } from "@/lib/hooks/use-permissions"
import { toast } from "@/lib/hooks/use-toast"

interface PipelineItem {
  id: string
  status: string
  client: { id: string; name: string } | null
  store: { id: string; store_name: string } | null
  design_assignee: { id: string; display_name: string; role: string } | null
  impl_assignee: { id: string; display_name: string; role: string } | null
  approver: { id: string; display_name: string } | null
  approved_at: string | null
  design_started_at: string | null
  design_completed_at: string | null
  impl_started_at: string | null
  impl_completed_at: string | null
  notes: string | null
  created_at: string
}

interface OrgMember {
  id: string
  display_name: string
  role: string
}

const PIPELINE_COLUMNS = [
  { key: "pending_approval", label: "Aguardando Aprovação", icon: Clock, color: "text-yellow-500" },
  { key: "approved", label: "Aprovado", icon: CheckCircle2, color: "text-green-500" },
  { key: "pending_design", label: "Aguardando Design", icon: Paintbrush, color: "text-blue-500" },
  { key: "in_design", label: "Em Design", icon: Paintbrush, color: "text-blue-600" },
  { key: "pending_implementation", label: "Aguardando Impl.", icon: Rocket, color: "text-purple-500" },
  { key: "implementing", label: "Implementando", icon: Rocket, color: "text-purple-600" },
  { key: "completed", label: "Concluído", icon: Sparkles, color: "text-emerald-500" },
] as const

type PipelineStatus = (typeof PIPELINE_COLUMNS)[number]["key"]

// Which features allow advancing from each status
const STATUS_ADVANCE_FEATURE: Record<string, string[]> = {
  pending_approval: ["onboarding_control"],
  approved: ["campaign_copy"],
  generating: ["campaign_copy"],
  pending_design: ["campaign_copy"],
  in_design: ["campaign_copy"],
  pending_implementation: ["campaign_control"],
  implementing: ["campaign_control"],
}

// Next status for each status
const NEXT_STATUS: Record<string, string> = {
  pending_approval: "approved",
  approved: "pending_design",
  pending_design: "in_design",
  in_design: "pending_implementation",
  pending_implementation: "implementing",
  implementing: "completed",
}

export function CopyPipelineBoard() {
  const [items, setItems] = useState<PipelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [actionItem, setActionItem] = useState<PipelineItem | null>(null)
  const [actionNotes, setActionNotes] = useState("")
  const [advancing, setAdvancing] = useState(false)
  const [members, setMembers] = useState<OrgMember[]>([])
  const [assignDialogItem, setAssignDialogItem] = useState<PipelineItem | null>(null)
  const [assignRole, setAssignRole] = useState<"design" | "implementation">("design")
  const [selectedMember, setSelectedMember] = useState("")

  const { permissions, hasAnyFeature } = usePermissions()
  const isAdminOrOwner = permissions?.isAdmin || permissions?.isOrgOwner

  const fetchPipeline = useCallback(async () => {
    try {
      const res = await fetch("/api/copy-pipeline")
      if (!res.ok) throw new Error("Erro ao carregar pipeline")
      const json = await res.json()
      setItems(json.data || [])
    } catch {
      toast({ variant: "destructive", title: "Erro ao carregar pipeline de copys" })
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/team-members")
      if (!res.ok) return
      const json = await res.json()
      setMembers(json.data || [])
    } catch {
      // Silent fail
    }
  }, [])

  useEffect(() => {
    fetchPipeline()
    fetchMembers()
  }, [fetchPipeline, fetchMembers])

  const getItemsByStatus = (status: PipelineStatus) =>
    items.filter((item) => item.status === status)

  const canAdvance = (status: string): boolean => {
    if (isAdminOrOwner) return true
    const features = STATUS_ADVANCE_FEATURE[status]
    if (!features) return false
    return hasAnyFeature(features)
  }

  const handleAdvance = async () => {
    if (!actionItem) return
    const nextStatus = NEXT_STATUS[actionItem.status]
    if (!nextStatus) return

    setAdvancing(true)
    try {
      const res = await fetch(`/api/copy-pipeline/${actionItem.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, notes: actionNotes || undefined }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erro ao atualizar status")
      }

      toast({ title: `Status atualizado para: ${nextStatus.replace(/_/g, " ")}` })
      setActionItem(null)
      setActionNotes("")
      fetchPipeline()
    } catch (err) {
      toast({ variant: "destructive", title: err instanceof Error ? err.message : "Erro ao atualizar" })
    } finally {
      setAdvancing(false)
    }
  }

  const handleAssign = async () => {
    if (!assignDialogItem || !selectedMember) return

    try {
      const res = await fetch(`/api/copy-pipeline/${assignDialogItem.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: assignRole, member_id: selectedMember }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erro ao atribuir")
      }

      toast({ title: "Membro atribuído com sucesso" })
      setAssignDialogItem(null)
      setSelectedMember("")
      fetchPipeline()
    } catch (err) {
      toast({ variant: "destructive", title: err instanceof Error ? err.message : "Erro ao atribuir" })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Paintbrush className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">Nenhum copy em andamento</h3>
        <p className="text-muted-foreground mt-1 max-w-md">
          O pipeline de copys será populado automaticamente quando onboardings forem aprovados.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {PIPELINE_COLUMNS.map((col) => {
          const colItems = getItemsByStatus(col.key)
          const Icon = col.icon
          return (
            <div
              key={col.key}
              className="flex-shrink-0 w-[260px]"
            >
              <div className="flex items-center gap-2 mb-3 px-1">
                <Icon className={`h-4 w-4 ${col.color}`} />
                <span className="text-sm font-medium">{col.label}</span>
                <Badge variant="secondary" className="ml-auto text-xs">
                  {colItems.length}
                </Badge>
              </div>

              <div className="space-y-2 min-h-[100px]">
                {colItems.map((item) => (
                  <PipelineCard
                    key={item.id}
                    item={item}
                    canAdvance={canAdvance(item.status)}
                    nextStatus={NEXT_STATUS[item.status]}
                    onAdvance={() => {
                      setActionItem(item)
                      setActionNotes("")
                    }}
                    onAssignDesign={() => {
                      setAssignDialogItem(item)
                      setAssignRole("design")
                      setSelectedMember(item.design_assignee?.id || "")
                    }}
                    onAssignImpl={() => {
                      setAssignDialogItem(item)
                      setAssignRole("implementation")
                      setSelectedMember(item.impl_assignee?.id || "")
                    }}
                    isAdminOrOwner={isAdminOrOwner || false}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Advance Status Dialog */}
      <Dialog open={!!actionItem} onOpenChange={() => setActionItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Avançar Pipeline</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Mover de <Badge variant="outline">{actionItem?.status?.replace(/_/g, " ")}</Badge>
            {" → "}
            <Badge>{NEXT_STATUS[actionItem?.status || ""]?.replace(/_/g, " ")}</Badge>
          </p>
          <Textarea
            placeholder="Notas (opcional)"
            value={actionNotes}
            onChange={(e) => setActionNotes(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionItem(null)}>
              Cancelar
            </Button>
            <Button onClick={handleAdvance} disabled={advancing}>
              {advancing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Member Dialog */}
      <Dialog open={!!assignDialogItem} onOpenChange={() => setAssignDialogItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Atribuir {assignRole === "design" ? "Designer" : "Implementação"}
            </DialogTitle>
          </DialogHeader>
          <Select value={selectedMember} onValueChange={setSelectedMember}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um membro" />
            </SelectTrigger>
            <SelectContent>
              {members
                .filter((m) =>
                  assignRole === "design"
                    ? ["designer", "copywriter", "owner", "manager"].includes(m.role)
                    : ["developer", "owner", "manager"].includes(m.role)
                )
                .map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.display_name} ({m.role})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogItem(null)}>
              Cancelar
            </Button>
            <Button onClick={handleAssign} disabled={!selectedMember}>
              Atribuir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// --- Card Sub-component ---

function PipelineCard({
  item,
  canAdvance,
  nextStatus,
  onAdvance,
  onAssignDesign,
  onAssignImpl,
  isAdminOrOwner,
}: {
  item: PipelineItem
  canAdvance: boolean
  nextStatus: string | undefined
  onAdvance: () => void
  onAssignDesign: () => void
  onAssignImpl: () => void
  isAdminOrOwner: boolean
}) {
  const clientName =
    item.client && !Array.isArray(item.client) ? item.client.name : "Cliente"
  const storeName =
    item.store && !Array.isArray(item.store) ? item.store.store_name : null

  return (
    <Card className="border shadow-sm">
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-sm font-medium leading-tight">
          {clientName}
        </CardTitle>
        {storeName && (
          <p className="text-xs text-muted-foreground">{storeName}</p>
        )}
      </CardHeader>
      <CardContent className="p-3 pt-1 space-y-2">
        {/* Assignees */}
        <div className="space-y-1">
          {(item.status === "pending_design" || item.status === "in_design") && (
            <div className="flex items-center gap-1.5 text-xs">
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Design:</span>
              {item.design_assignee && !Array.isArray(item.design_assignee) ? (
                <span className="font-medium">{item.design_assignee.display_name}</span>
              ) : (
                <button
                  onClick={onAssignDesign}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Atribuir
                </button>
              )}
            </div>
          )}
          {(item.status === "pending_implementation" || item.status === "implementing") && (
            <div className="flex items-center gap-1.5 text-xs">
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Impl:</span>
              {item.impl_assignee && !Array.isArray(item.impl_assignee) ? (
                <span className="font-medium">{item.impl_assignee.display_name}</span>
              ) : (
                <button
                  onClick={onAssignImpl}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Atribuir
                </button>
              )}
            </div>
          )}
        </div>

        {/* Date */}
        <p className="text-[10px] text-muted-foreground">
          {new Date(item.created_at).toLocaleDateString("pt-BR")}
        </p>

        {/* Advance button */}
        {canAdvance && nextStatus && item.status !== "completed" && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={onAdvance}
          >
            Avançar
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        )}

        {/* Assign buttons for admin */}
        {isAdminOrOwner && item.status !== "completed" && (
          <div className="flex gap-1">
            {!item.design_assignee && (
              <Button variant="outline" size="sm" className="flex-1 h-6 text-[10px]" onClick={onAssignDesign}>
                + Design
              </Button>
            )}
            {!item.impl_assignee && (
              <Button variant="outline" size="sm" className="flex-1 h-6 text-[10px]" onClick={onAssignImpl}>
                + Impl
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
