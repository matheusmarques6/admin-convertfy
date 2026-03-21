"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Shield,
  Store,
  UserCheck,
  UserX,
  Users2,
} from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { getInitials } from "@/lib/utils"
import { toast } from "@/lib/hooks/use-toast"
import { TeamMemberDialog } from "./team-member-dialog"
import type { FeatureCatalog, MemberWithDetails, Organization } from "@/types"

interface StoreWithClient {
  id: string
  store_name: string
  store_url?: string
  platform?: string
  client?: { id: string; name: string }
}

interface TeamTableProps {
  members: MemberWithDetails[]
  features: FeatureCatalog[]
  organizations: Organization[]
  stores: StoreWithClient[]
}

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "Nunca"
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHrs = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMin < 5) return "Agora"
  if (diffMin < 60) return `Há ${diffMin}min`
  if (diffHrs < 24) return `Há ${diffHrs}h`
  if (diffDays < 7) return `Há ${diffDays}d`
  if (diffDays < 30) return `Há ${Math.floor(diffDays / 7)} sem`
  return `Há ${Math.floor(diffDays / 30)} mês(es)`
}

function getActivityColor(dateStr: string | null | undefined): string {
  if (!dateStr) return "bg-muted-foreground/40"
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const diffDays = diffMs / 86400000
  if (diffDays < 1) return "bg-emerald-500"
  if (diffDays < 7) return "bg-amber-500"
  return "bg-muted-foreground/40"
}

const roleLabels: Record<string, { label: string; variant: "default" | "secondary" | "success" | "destructive" | "warning" | "outline" }> = {
  owner: { label: "Owner", variant: "default" },
  manager: { label: "Gerente", variant: "success" },
  coordinator: { label: "Coordenador", variant: "warning" },
  copywriter: { label: "Copywriter", variant: "secondary" },
  designer: { label: "Designer", variant: "secondary" },
  developer: { label: "Desenvolvedor", variant: "secondary" },
  support: { label: "Suporte", variant: "outline" },
  analyst: { label: "Analista", variant: "outline" },
}

export function TeamTable({ members, features, organizations, stores }: TeamTableProps) {
  const router = useRouter()
  const [deleteMember, setDeleteMember] = useState<MemberWithDetails | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<MemberWithDetails | null>(null)

  // Listen for add member button click
  useEffect(() => {
    const addButton = document.getElementById("add-member-trigger")
    if (addButton) {
      const handleClick = () => {
        setEditingMember(null)
        setDialogOpen(true)
      }
      addButton.addEventListener("click", handleClick)
      return () => addButton.removeEventListener("click", handleClick)
    }
  }, [])

  async function handleDelete() {
    if (!deleteMember) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/admin/org-members/${deleteMember.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete")
      }

      toast({
        title: "Membro removido",
        description: "O membro foi desativado com sucesso.",
      })

      router.refresh()
    } catch {
      toast({
        variant: "destructive",
        title: "Erro ao remover",
        description: "Não foi possível remover o membro.",
      })
    } finally {
      setIsDeleting(false)
      setDeleteMember(null)
    }
  }

  function handleEdit(member: MemberWithDetails) {
    setEditingMember(member)
    setDialogOpen(true)
  }

  function handleDialogClose() {
    setDialogOpen(false)
    setEditingMember(null)
  }

  function handleDialogSuccess() {
    handleDialogClose()
    router.refresh()
  }

  if (members.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Users2 className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium">Nenhum membro encontrado</h3>
          <p className="text-muted-foreground mt-1">
            Comece adicionando o primeiro membro da equipe
          </p>
          <Button className="mt-4" onClick={() => setDialogOpen(true)}>
            Adicionar Membro
          </Button>
        </div>

        <TeamMemberDialog
          open={dialogOpen}
          onClose={handleDialogClose}
          onSuccess={handleDialogSuccess}
          member={editingMember}
          features={features}
          organizations={organizations}
          stores={stores}
        />
      </>
    )
  }

  return (
    <TooltipProvider>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px]">Membro</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Organização</TableHead>
              <TableHead>Features</TableHead>
              <TableHead>Lojas</TableHead>
              <TableHead>Última atividade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const roleInfo = roleLabels[member.role] || roleLabels.support

              return (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={member.profile?.avatar_url} />
                        <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                          {getInitials(member.profile?.name || "?")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{member.profile?.name || "Sem nome"}</p>
                        <p className="text-sm text-muted-foreground">
                          {member.profile?.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Badge variant={roleInfo.variant}>{roleInfo.label}</Badge>
                      {member.job_title && (
                        <p className="text-xs text-muted-foreground">{member.job_title}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{member.organization?.name || "-"}</span>
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 cursor-help">
                          <Shield className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            {member.enabled_features?.length || 0} features
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        {member.enabled_features && member.enabled_features.length > 0 ? (
                          <div className="space-y-1">
                            {member.enabled_features.map((key) => {
                              const feature = features.find((f) => f.key === key)
                              return (
                                <p key={key} className="text-xs">
                                  {feature?.name || key}
                                </p>
                              )
                            })}
                          </div>
                        ) : (
                          <p className="text-xs">Nenhuma feature atribuída</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Store className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        {member.store_access_count || 0} lojas
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${getActivityColor(member.profile?.last_sign_in_at)}`} />
                      <span className="text-sm text-muted-foreground">
                        {formatRelativeTime(member.profile?.last_sign_in_at)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {member.is_active ? (
                      <Badge variant="success" className="flex items-center gap-1 w-fit">
                        <UserCheck className="h-3 w-3" />
                        Ativo
                      </Badge>
                    ) : (
                      <Badge variant="neutral" className="flex items-center gap-1 w-fit">
                        <UserX className="h-3 w-3" />
                        Inativo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Ações do membro">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Ações</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleEdit(member)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteMember(member)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Desativar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteMember} onOpenChange={() => setDeleteMember(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar membro</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja desativar o membro &quot;{deleteMember?.profile?.name}&quot;?
              Ele perderá acesso ao sistema, mas poderá ser reativado posteriormente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Desativando..." : "Desativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create/Edit Dialog */}
      <TeamMemberDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        onSuccess={handleDialogSuccess}
        member={editingMember}
        features={features}
        organizations={organizations}
        stores={stores}
      />
    </TooltipProvider>
  )
}
