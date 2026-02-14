"use client"

import { useState, useEffect } from "react"
import { Loader2, Plus, X, Crown, Pencil, Eye } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import { getInitials } from "@/lib/utils"
import type { Pipeline, PipelineMember, PipelineMemberRole, User } from "@/types"

interface PipelineMembersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pipeline: Pipeline
  members: PipelineMember[]
  currentUserRole: PipelineMemberRole | null
  onSuccess?: () => void
}

const roleConfig: Record<PipelineMemberRole, { label: string; icon: typeof Crown; color: string }> = {
  owner: { label: "Dono", icon: Crown, color: "text-amber-500" },
  editor: { label: "Editor", icon: Pencil, color: "text-blue-500" },
  viewer: { label: "Visualizador", icon: Eye, color: "text-muted-foreground" },
}

export function PipelineMembersDialog({
  open,
  onOpenChange,
  pipeline,
  members: initialMembers,
  currentUserRole,
  onSuccess,
}: PipelineMembersDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [members, setMembers] = useState(initialMembers)
  const [availableUsers, setAvailableUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>("")
  const [selectedRole, setSelectedRole] = useState<PipelineMemberRole>("editor")
  const [removingMember, setRemovingMember] = useState<PipelineMember | null>(null)

  const canManage = currentUserRole === "owner"

  useEffect(() => {
    if (open) {
      setMembers(initialMembers)
      if (canManage) loadAvailableUsers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMembers, canManage])

  async function loadAvailableUsers() {
    const supabase = createClient()
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, name, avatar_url, role")
      .order("name")

    if (profiles) {
      const memberIds = initialMembers.map((m) => m.user_id)
      setAvailableUsers(profiles.filter((p) => !memberIds.includes(p.id)) as User[])
    }
  }

  async function handleAddMember() {
    if (!selectedUserId) return
    setIsLoading(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      const { data, error } = await supabase
        .from("pipeline_members")
        .insert({
          pipeline_id: pipeline.id,
          user_id: selectedUserId,
          role: selectedRole,
          added_by: user?.id,
        })
        .select(`
          *,
          user:profiles!pipeline_members_user_id_fkey (id, name, email, avatar_url, role)
        `)
        .single()

      if (error) throw error

      setMembers((prev) => [...prev, data])
      setAvailableUsers((prev) => prev.filter((u) => u.id !== selectedUserId))
      setSelectedUserId("")

      toast({
        title: "Membro adicionado!",
        description: `Usuario adicionado como ${roleConfig[selectedRole].label}.`,
      })

      onSuccess?.()
    } catch (error) {
      console.error("Error adding member:", error)
      toast({
        variant: "destructive",
        title: "Erro ao adicionar membro",
        description: "Tente novamente.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  async function handleUpdateRole(memberId: string, newRole: PipelineMemberRole) {
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("pipeline_members")
        .update({ role: newRole })
        .eq("id", memberId)

      if (error) throw error

      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
      )

      toast({
        title: "Permissao atualizada!",
        description: `Role alterada para ${roleConfig[newRole].label}.`,
      })

      onSuccess?.()
    } catch (error) {
      console.error("Error updating role:", error)
      toast({
        variant: "destructive",
        title: "Erro ao atualizar permissao",
      })
    }
  }

  async function handleRemoveMember() {
    if (!removingMember) return
    setIsLoading(true)

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("pipeline_members")
        .delete()
        .eq("id", removingMember.id)

      if (error) throw error

      setMembers((prev) => prev.filter((m) => m.id !== removingMember.id))
      if (removingMember.user) {
        setAvailableUsers((prev) => [...prev, removingMember.user as User])
      }

      toast({
        title: "Membro removido!",
        description: `${removingMember.user?.name || "Usuario"} foi removido da pipeline.`,
      })

      setRemovingMember(null)
      onSuccess?.()
    } catch (error) {
      console.error("Error removing member:", error)
      toast({
        variant: "destructive",
        title: "Erro ao remover membro",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Membros da Pipeline</DialogTitle>
            <DialogDescription>
              Gerencie quem tem acesso a &quot;{pipeline.name}&quot;
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Add Member Section */}
            {canManage && availableUsers.length > 0 && (
              <>
                <div className="space-y-3">
                  <p className="text-sm font-medium">Adicionar Membro</p>
                  <div className="flex gap-2">
                    <Select
                      value={selectedUserId}
                      onValueChange={setSelectedUserId}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Selecione um usuario" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableUsers.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            <div className="flex items-center gap-2">
                              <span>{user.name}</span>
                              <span className="text-muted-foreground text-xs">
                                ({user.email})
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={selectedRole}
                      onValueChange={(v) => setSelectedRole(v as PipelineMemberRole)}
                    >
                      <SelectTrigger className="w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="viewer">Visualizador</SelectItem>
                        <SelectItem value="owner">Dono</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      size="icon"
                      onClick={handleAddMember}
                      disabled={!selectedUserId || isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Members List */}
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {members.length} membro{members.length !== 1 ? "s" : ""}
              </p>
              <ScrollArea className="max-h-[350px]">
                <div className="space-y-2">
                  {members.map((member) => {
                    const config = roleConfig[member.role]
                    const RoleIcon = config.icon

                    return (
                      <div
                        key={member.id}
                        className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50"
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={member.user?.avatar_url} />
                          <AvatarFallback>
                            {getInitials(member.user?.name || "?")}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {member.user?.name || "Usuario"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {member.user?.email}
                          </p>
                        </div>

                        {canManage ? (
                          <div className="flex items-center gap-1">
                            <Select
                              value={member.role}
                              onValueChange={(v) =>
                                handleUpdateRole(member.id, v as PipelineMemberRole)
                              }
                            >
                              <SelectTrigger className="w-[130px] h-8 text-xs">
                                <div className="flex items-center gap-1">
                                  <RoleIcon className={`h-3 w-3 ${config.color}`} />
                                  <SelectValue />
                                </div>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="owner">Dono</SelectItem>
                                <SelectItem value="editor">Editor</SelectItem>
                                <SelectItem value="viewer">Visualizador</SelectItem>
                              </SelectContent>
                            </Select>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => setRemovingMember(member)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            <RoleIcon className={`mr-1 h-3 w-3 ${config.color}`} />
                            {config.label}
                          </Badge>
                        )}
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation */}
      <AlertDialog
        open={!!removingMember}
        onOpenChange={() => setRemovingMember(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover membro?</AlertDialogTitle>
            <AlertDialogDescription>
              {removingMember?.user?.name} perdera o acesso a esta pipeline e seus deals.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
