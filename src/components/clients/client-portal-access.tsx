"use client"

import { useState, useEffect, useCallback } from "react"
import { Users, Plus, Trash2, RefreshCw, Mail, Phone, Loader2, Copy, Check } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { useToast } from "@/lib/hooks/use-toast"
import type { ClientPortalUser, ClientPortalUserPermissions } from "@/types"

interface ClientPortalAccessProps {
  clientId: string
  clientName: string
}

const DEFAULT_PASSWORD = "Convertfy@2024"

export function ClientPortalAccess({ clientId, clientName }: ClientPortalAccessProps) {
  const [portalUsers, setPortalUsers] = useState<ClientPortalUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<ClientPortalUser | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [copiedPassword, setCopiedPassword] = useState(false)
  const [showPasswordInfo, setShowPasswordInfo] = useState(false)
  const [createdUserPassword, setCreatedUserPassword] = useState("")
  const { toast } = useToast()

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    is_primary_contact: false,
    permissions: {
      view_reports: true,
      view_invoices: true,
      view_campaigns: true,
      edit_profile: true,
    } as ClientPortalUserPermissions,
  })

  // Fetch portal users
  const fetchPortalUsers = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/portal-users?client_id=${clientId}`)
      const data = await response.json()

      if (response.ok) {
        setPortalUsers(data.data || [])
      } else {
        toast({
          title: "Erro",
          description: data.error || "Erro ao carregar usuários do portal",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error fetching portal users:", error)
      toast({
        title: "Erro",
        description: "Erro ao carregar usuários do portal",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [clientId, toast])

  useEffect(() => {
    fetchPortalUsers()
  }, [fetchPortalUsers])

  // Create portal user
  const handleCreateUser = async () => {
    if (!formData.name || !formData.email) {
      toast({
        title: "Erro",
        description: "Nome e email são obrigatórios",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/portal-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          ...formData,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: "Sucesso",
          description: "Usuário do portal criado com sucesso",
        })
        setCreatedUserPassword(data.default_password || DEFAULT_PASSWORD)
        setShowPasswordInfo(true)
        setIsCreateDialogOpen(false)
        resetForm()
        fetchPortalUsers()
      } else {
        toast({
          title: "Erro",
          description: data.error || "Erro ao criar usuário do portal",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error creating portal user:", error)
      toast({
        title: "Erro",
        description: "Erro ao criar usuário do portal",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Delete portal user
  const handleDeleteUser = async () => {
    if (!userToDelete) return

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/portal-users?id=${userToDelete.id}`, {
        method: "DELETE",
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: "Sucesso",
          description: "Usuário do portal removido com sucesso",
        })
        setIsDeleteDialogOpen(false)
        setUserToDelete(null)
        fetchPortalUsers()
      } else {
        toast({
          title: "Erro",
          description: data.error || "Erro ao remover usuário do portal",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error deleting portal user:", error)
      toast({
        title: "Erro",
        description: "Erro ao remover usuário do portal",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Reset password
  const handleResetPassword = async (portalUserId: string) => {
    try {
      const response = await fetch("/api/portal-users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portal_user_id: portalUserId }),
      })

      const data = await response.json()

      if (response.ok) {
        setCreatedUserPassword(data.new_password || DEFAULT_PASSWORD)
        setShowPasswordInfo(true)
        toast({
          title: "Sucesso",
          description: "Senha resetada com sucesso",
        })
      } else {
        toast({
          title: "Erro",
          description: data.error || "Erro ao resetar senha",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error resetting password:", error)
      toast({
        title: "Erro",
        description: "Erro ao resetar senha",
        variant: "destructive",
      })
    }
  }

  // Update permission
  const handleUpdatePermission = async (
    userId: string,
    permission: keyof ClientPortalUserPermissions,
    value: boolean
  ) => {
    const user = portalUsers.find((u) => u.id === userId)
    if (!user) return

    const newPermissions = { ...user.permissions, [permission]: value }

    try {
      const response = await fetch("/api/portal-users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: userId,
          permissions: newPermissions,
        }),
      })

      if (response.ok) {
        setPortalUsers((prev) =>
          prev.map((u) =>
            u.id === userId ? { ...u, permissions: newPermissions } : u
          )
        )
      } else {
        toast({
          title: "Erro",
          description: "Erro ao atualizar permissão",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error updating permission:", error)
    }
  }

  // Update primary contact
  const handleUpdatePrimaryContact = async (userId: string, value: boolean) => {
    try {
      const response = await fetch("/api/portal-users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: userId,
          is_primary_contact: value,
        }),
      })

      if (response.ok) {
        setPortalUsers((prev) =>
          prev.map((u) =>
            u.id === userId
              ? { ...u, is_primary_contact: value }
              : value
              ? { ...u, is_primary_contact: false }
              : u
          )
        )
      } else {
        toast({
          title: "Erro",
          description: "Erro ao atualizar contato principal",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error updating primary contact:", error)
    }
  }

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      phone: "",
      is_primary_contact: false,
      permissions: {
        view_reports: true,
        view_invoices: true,
        view_campaigns: true,
        edit_profile: true,
      },
    })
  }

  const copyPassword = () => {
    navigator.clipboard.writeText(createdUserPassword)
    setCopiedPassword(true)
    setTimeout(() => setCopiedPassword(false), 2000)
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-2 bg-muted">
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">Acesso ao Portal</CardTitle>
              <CardDescription>Gerencie os usuários que podem acessar o portal</CardDescription>
            </div>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Novo Usuário
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : portalUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum usuário do portal cadastrado</p>
              <p className="text-sm">Clique em &quot;Novo Usuário&quot; para adicionar</p>
            </div>
          ) : (
            <div className="space-y-4">
              {portalUsers.map((user) => (
                <div
                  key={user.id}
                  className="border rounded-lg p-4 space-y-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{user.name}</span>
                        {user.is_primary_contact && (
                          <Badge variant="secondary" className="text-xs">
                            Contato Principal
                          </Badge>
                        )}
                        {user.must_change_password && (
                          <Badge variant="warning" className="text-xs">
                            Deve trocar senha
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {user.email}
                        </div>
                        {user.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {user.phone}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleResetPassword(user.id)}
                        title="Resetar senha"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setUserToDelete(user)
                          setIsDeleteDialogOpen(true)
                        }}
                        title="Remover usuário"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm">Contato principal</span>
                    <Switch
                      checked={user.is_primary_contact}
                      onCheckedChange={(checked) =>
                        handleUpdatePrimaryContact(user.id, checked)
                      }
                    />
                  </div>

                  <div className="border-t pt-3">
                    <p className="text-xs text-muted-foreground mb-2">Permissões</p>
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Ver Relatórios</span>
                        <Switch
                          checked={user.permissions.view_reports}
                          onCheckedChange={(checked) =>
                            handleUpdatePermission(user.id, "view_reports", checked)
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Ver Faturas</span>
                        <Switch
                          checked={user.permissions.view_invoices}
                          onCheckedChange={(checked) =>
                            handleUpdatePermission(user.id, "view_invoices", checked)
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Ver Campanhas</span>
                        <Switch
                          checked={user.permissions.view_campaigns}
                          onCheckedChange={(checked) =>
                            handleUpdatePermission(user.id, "view_campaigns", checked)
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Editar Perfil</span>
                        <Switch
                          checked={user.permissions.edit_profile}
                          onCheckedChange={(checked) =>
                            handleUpdatePermission(user.id, "edit_profile", checked)
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Usuário do Portal</DialogTitle>
            <DialogDescription>
              Crie um acesso ao portal para {clientName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Nome do usuário"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="email@exemplo.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder="(00) 00000-0000"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="primary">Contato principal</Label>
              <Switch
                id="primary"
                checked={formData.is_primary_contact}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, is_primary_contact: checked }))
                }
              />
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-3">Permissões</p>
              <div className="grid gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Ver Relatórios</span>
                  <Switch
                    checked={formData.permissions.view_reports}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({
                        ...prev,
                        permissions: { ...prev.permissions, view_reports: checked },
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Ver Faturas</span>
                  <Switch
                    checked={formData.permissions.view_invoices}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({
                        ...prev,
                        permissions: { ...prev.permissions, view_invoices: checked },
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Ver Campanhas</span>
                  <Switch
                    checked={formData.permissions.view_campaigns}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({
                        ...prev,
                        permissions: { ...prev.permissions, view_campaigns: checked },
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Editar Perfil</span>
                  <Switch
                    checked={formData.permissions.edit_profile}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({
                        ...prev,
                        permissions: { ...prev.permissions, edit_profile: checked },
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false)
                resetForm()
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreateUser} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar Usuário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover usuário do portal?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o acesso de{" "}
              <strong>{userToDelete?.name}</strong> ao portal? Esta ação não pode
              ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Password Info Dialog */}
      <Dialog open={showPasswordInfo} onOpenChange={setShowPasswordInfo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Senha de Acesso</DialogTitle>
            <DialogDescription>
              A senha padrão para o primeiro acesso é:
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <code className="flex-1 text-lg font-mono">{createdUserPassword}</code>
              <Button variant="ghost" size="icon" onClick={copyPassword}>
                {copiedPassword ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              O usuário será obrigado a trocar a senha no primeiro acesso.
            </p>
          </div>

          <DialogFooter>
            <Button onClick={() => setShowPasswordInfo(false)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
