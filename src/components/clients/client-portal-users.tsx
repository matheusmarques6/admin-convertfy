"use client"

import { useState, useEffect, useCallback } from "react"
import {
  User,
  Plus,
  Mail,
  Phone,
  Shield,
  Key,
  Trash2,
  MoreVertical,
  Loader2,
  Send,
  Clock,
  CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { ClientPortalUser } from "@/types"

interface ClientPortalUsersProps {
  clientId: string
  clientName: string
}

export function ClientPortalUsers({ clientId, clientName }: ClientPortalUsersProps) {
  const [portalUsers, setPortalUsers] = useState<ClientPortalUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedUser, setSelectedUser] = useState<ClientPortalUser | null>(null)
  const [successMessage, setSuccessMessage] = useState("")
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    is_primary: false,
    permissions: {
      view_reports: true,
      view_invoices: true,
      view_campaigns: true,
      edit_profile: true,
      manage_stores: false,
    },
  })
  const [submitting, setSubmitting] = useState(false)

  const fetchPortalUsers = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/portal-users?client_id=${clientId}`)
      if (response.ok) {
        const data = await response.json()
        setPortalUsers(data.portalUsers || [])
      }
    } catch (error) {
      console.error("Error fetching portal users:", error)
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    fetchPortalUsers()
  }, [fetchPortalUsers])

  const handleCreateUser = async () => {
    if (!formData.name || !formData.email) return

    setSubmitting(true)
    try {
      const response = await fetch("/api/admin/portal-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          ...formData,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setPortalUsers([data.portalUser, ...portalUsers])
        setShowAddModal(false)
        setSuccessMessage(`Convite enviado para ${formData.email}`)
        setShowSuccessModal(true)
        resetForm()
      } else {
        alert(data.error || "Erro ao criar usuário")
      }
    } catch (error) {
      console.error("Error creating user:", error)
      alert("Erro ao criar usuário")
    } finally {
      setSubmitting(false)
    }
  }

  const handleSendInvite = async (userId: string, userEmail: string) => {
    setActionLoading(userId)
    try {
      const response = await fetch(`/api/admin/portal-users/${userId}/send-invite`, {
        method: "POST",
      })

      const data = await response.json()

      if (response.ok) {
        setSuccessMessage(`Convite reenviado para ${userEmail}`)
        setShowSuccessModal(true)
      } else {
        alert(data.error || "Erro ao enviar convite")
      }
    } catch (error) {
      console.error("Error sending invite:", error)
      alert("Erro ao enviar convite")
    } finally {
      setActionLoading(null)
    }
  }

  const handleResetPassword = async (userId: string) => {
    setActionLoading(userId)
    try {
      const response = await fetch(`/api/admin/portal-users/${userId}/reset-password`, {
        method: "POST",
      })

      const data = await response.json()

      if (response.ok) {
        setSuccessMessage(`Email de redefinição de senha enviado para ${data.userEmail}`)
        setShowSuccessModal(true)
      } else {
        alert(data.error || "Erro ao redefinir senha")
      }
    } catch (error) {
      console.error("Error resetting password:", error)
      alert("Erro ao redefinir senha")
    } finally {
      setActionLoading(null)
    }
  }

  const handleToggleActive = async (user: ClientPortalUser) => {
    try {
      const response = await fetch(`/api/admin/portal-users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !user.is_active }),
      })

      if (response.ok) {
        setPortalUsers(
          portalUsers.map((u) =>
            u.id === user.id ? { ...u, is_active: !u.is_active } : u
          )
        )
      }
    } catch (error) {
      console.error("Error toggling user:", error)
    }
  }

  const handleDeleteUser = async () => {
    if (!selectedUser) return

    try {
      const response = await fetch(`/api/admin/portal-users/${selectedUser.id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        setPortalUsers(portalUsers.filter((u) => u.id !== selectedUser.id))
        setShowDeleteDialog(false)
        setSelectedUser(null)
      } else {
        alert("Erro ao excluir usuário")
      }
    } catch (error) {
      console.error("Error deleting user:", error)
      alert("Erro ao excluir usuário")
    }
  }

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      phone: "",
      is_primary: false,
      permissions: {
        view_reports: true,
        view_invoices: true,
        view_campaigns: true,
        edit_profile: true,
        manage_stores: false,
      },
    })
  }

  const hasLoggedIn = (user: ClientPortalUser) => (user.login_count || 0) > 0

  return (
    <Card className="rounded-xl border bg-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Acesso ao Portal
            </CardTitle>
            <CardDescription>
              Gerencie os usuários que podem acessar o portal do cliente
            </CardDescription>
          </div>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Usuário
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : portalUsers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum usuário do portal cadastrado</p>
            <p className="text-sm mt-1">
              Crie um usuário para que o cliente possa acessar seus dados
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {portalUsers.map((user) => (
              <div
                key={user.id}
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  !user.is_active ? "opacity-60 bg-muted/50" : ""
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{user.name}</p>
                      {user.is_primary && (
                        <Badge variant="neutral" className="text-xs">
                          Principal
                        </Badge>
                      )}
                      {!user.is_active && (
                        <Badge variant="negative" className="text-xs">
                          Inativo
                        </Badge>
                      )}
                      {user.is_active && !hasLoggedIn(user) && (
                        <Badge variant="neutral" showDot={false} className="text-xs text-amber-600 border-amber-300 bg-amber-50">
                          <Clock className="h-3 w-3 mr-1" />
                          Convite pendente
                        </Badge>
                      )}
                      {user.is_active && hasLoggedIn(user) && (
                        <Badge variant="neutral" showDot={false} className="text-xs text-emerald-600 border-emerald-300 bg-emerald-50">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Ativo
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {user.email}
                      </span>
                      {user.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {user.phone}
                        </span>
                      )}
                    </div>
                    {user.last_login_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Último acesso:{" "}
                        {new Date(user.last_login_at).toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={user.is_active}
                    onCheckedChange={() => handleToggleActive(user)}
                  />

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" disabled={actionLoading === user.id}>
                        {actionLoading === user.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MoreVertical className="h-4 w-4" />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {!hasLoggedIn(user) ? (
                        <DropdownMenuItem onClick={() => handleSendInvite(user.id, user.email)}>
                          <Send className="h-4 w-4 mr-2" />
                          Reenviar Convite
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => handleResetPassword(user.id)}>
                          <Key className="h-4 w-4 mr-2" />
                          Redefinir Senha
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => {
                          setSelectedUser(user)
                          setShowDeleteDialog(true)
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Add User Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Usuário do Portal</DialogTitle>
            <DialogDescription>
              Crie um acesso ao portal para {clientName}. Um email de convite será enviado automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nome do usuário"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@exemplo.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="(11) 99999-9999"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is_primary">Contato principal</Label>
              <Switch
                id="is_primary"
                checked={formData.is_primary}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_primary: checked })
                }
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Permissões
              </Label>

              {[
                { key: "view_reports", label: "Ver Relatórios" },
                { key: "view_invoices", label: "Ver Faturas" },
                { key: "view_campaigns", label: "Ver Campanhas" },
                { key: "edit_profile", label: "Editar Perfil" },
              ].map((perm) => (
                <div key={perm.key} className="flex items-center justify-between">
                  <span className="text-sm">{perm.label}</span>
                  <Switch
                    checked={formData.permissions[perm.key as keyof typeof formData.permissions]}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        permissions: { ...formData.permissions, [perm.key]: checked },
                      })
                    }
                  />
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="flex items-center gap-2 text-sm text-blue-700">
                <Mail className="h-4 w-4 shrink-0" />
                <span>O usuário receberá um email com link para criar sua senha.</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateUser} disabled={submitting || !formData.name || !formData.email}>
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Criar e Enviar Convite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Modal */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <DialogTitle className="text-center">Convite Enviado</DialogTitle>
            <DialogDescription className="text-center">
              {successMessage}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button onClick={() => setShowSuccessModal(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. O usuário {selectedUser?.name} perderá
              acesso ao portal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className="bg-destructive text-destructive-foreground"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
