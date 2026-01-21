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
  Copy,
  Check,
  X,
  Loader2,
  Eye,
  EyeOff,
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
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedUser, setSelectedUser] = useState<ClientPortalUser | null>(null)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copiedPassword, setCopiedPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

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
        setTempPassword(data.tempPassword)
        setShowAddModal(false)
        setShowPasswordModal(true)
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

  const handleResetPassword = async (userId: string) => {
    try {
      const response = await fetch(`/api/admin/portal-users/${userId}/reset-password`, {
        method: "POST",
      })

      const data = await response.json()

      if (response.ok) {
        setTempPassword(data.tempPassword)
        setShowPasswordModal(true)
      } else {
        alert(data.error || "Erro ao redefinir senha")
      }
    } catch (error) {
      console.error("Error resetting password:", error)
      alert("Erro ao redefinir senha")
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

  const copyPassword = () => {
    if (tempPassword) {
      navigator.clipboard.writeText(tempPassword)
      setCopiedPassword(true)
      setTimeout(() => setCopiedPassword(false), 2000)
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

  return (
    <Card>
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
                        <Badge variant="secondary" className="text-xs">
                          Principal
                        </Badge>
                      )}
                      {!user.is_active && (
                        <Badge variant="destructive" className="text-xs">
                          Inativo
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
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleResetPassword(user.id)}>
                        <Key className="h-4 w-4 mr-2" />
                        Redefinir Senha
                      </DropdownMenuItem>
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
              Crie um acesso ao portal para {clientName}
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateUser} disabled={submitting || !formData.name || !formData.email}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Usuário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Modal */}
      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Senha Temporária
            </DialogTitle>
            <DialogDescription>
              Anote a senha abaixo. Ela não será mostrada novamente.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-muted p-4 rounded-lg">
            <div className="flex items-center justify-between gap-2">
              <code className="text-lg font-mono flex-1">
                {showPassword ? tempPassword : "••••••••••••"}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={copyPassword}>
                {copiedPassword ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Envie essa senha para o cliente. Ele poderá alterá-la após o primeiro acesso.
          </p>

          <DialogFooter>
            <Button onClick={() => setShowPasswordModal(false)}>Entendi</Button>
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
