"use client"

import { useState, useEffect, useCallback } from "react"
import {
  User,
  Plus,
  Mail,
  Shield,
  Key,
  Trash2,
  MoreVertical,
  Loader2,
  Send,
  Clock,
  CheckCircle2,
  Sparkles,
  Pencil,
  X,
  Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn, getInitials } from "@/lib/utils"
import { ClientPortalUser } from "@/types"

interface ClientPortalUsersProps {
  clientId: string
  clientName: string
}

// ─── Permission pill ──────────────────────────────────────

function PermissionPill({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-[4px] border",
        enabled
          ? "bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0] dark:bg-[#0B2C24] dark:text-[#6EE7B7] dark:border-[rgba(110,231,183,0.3)]"
          : "bg-[#F3F4F6] text-gray-500 border-[#E5E7EB] dark:bg-[rgba(255,255,255,0.04)] dark:text-[#5C6378] dark:border-[rgba(255,255,255,0.08)]",
      )}
    >
      {enabled ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
      {label}
    </span>
  )
}

const PERMISSION_KEYS = [
  { key: "view_reports", label: "Relatórios" },
  { key: "view_invoices", label: "Faturas" },
  { key: "view_campaigns", label: "Campanhas" },
  { key: "edit_profile", label: "Editar perfil" },
] as const

// ─── Main Component ────────────────────────────────────────

export function ClientPortalUsers({ clientId, clientName }: ClientPortalUsersProps) {
  const [portalUsers, setPortalUsers] = useState<ClientPortalUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingUser, setEditingUser] = useState<ClientPortalUser | null>(null)
  const [selectedUser, setSelectedUser] = useState<ClientPortalUser | null>(null)
  const [successMessage, setSuccessMessage] = useState("")
  const [actionLoading, setActionLoading] = useState<string | null>(null)

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

  function openEditModal(user: ClientPortalUser) {
    setEditingUser(user)
    setFormData({
      name: user.name,
      email: user.email,
      phone: user.phone ?? "",
      is_primary: user.is_primary,
      permissions: {
        view_reports: user.permissions?.view_reports ?? true,
        view_invoices: user.permissions?.view_invoices ?? true,
        view_campaigns: user.permissions?.view_campaigns ?? true,
        edit_profile: user.permissions?.edit_profile ?? true,
        manage_stores: user.permissions?.manage_stores ?? false,
      },
    })
    setShowEditModal(true)
  }

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

  const handleUpdateUser = async () => {
    if (!editingUser) return
    setSubmitting(true)
    try {
      const response = await fetch(`/api/admin/portal-users/${editingUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          is_primary: formData.is_primary,
          permissions: formData.permissions,
        }),
      })
      const data = await response.json()
      if (response.ok) {
        setPortalUsers(portalUsers.map((u) => (u.id === editingUser.id ? { ...u, ...data.portalUser } : u)))
        setShowEditModal(false)
        setEditingUser(null)
      } else {
        alert(data.error || "Erro ao atualizar usuário")
      }
    } catch (error) {
      console.error("Error updating user:", error)
      alert("Erro ao atualizar usuário")
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
          portalUsers.map((u) => (u.id === user.id ? { ...u, is_active: !u.is_active } : u)),
        )
      }
    } catch (error) {
      console.error("Error toggling user:", error)
    }
  }

  const handleDeleteUser = async () => {
    if (!selectedUser) return
    try {
      const response = await fetch(`/api/admin/portal-users/${selectedUser.id}`, { method: "DELETE" })
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

  function formatRelativeAccess(date?: string): string {
    if (!date) return "Nunca acessou"
    const d = new Date(date)
    return `Último acesso ${d.toLocaleDateString("pt-BR")}`
  }

  return (
    <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
      <CardHeader className="pb-3 flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <User className="h-3.5 w-3.5" />
            Acesso ao Portal
          </CardTitle>
          <CardDescription className="text-[12px] mt-0.5">
            Gerencie os usuários que podem acessar o portal do cliente
          </CardDescription>
        </div>
        <Button onClick={() => setShowAddModal(true)} size="sm">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Novo Usuário
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : portalUsers.length === 0 ? (
          <div className="text-center py-8 px-4 text-muted-foreground">
            <User className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm font-medium">Nenhum usuário do portal cadastrado</p>
            <p className="text-[12px] mt-1">
              Crie um usuário para que o cliente possa acessar seus dados
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] uppercase tracking-[0.06em]">Usuário</TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.06em]">Contato</TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.06em]">Permissões</TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.06em]">Último acesso</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {portalUsers.map((user) => (
                <TableRow key={user.id} className={!user.is_active ? "opacity-60" : ""}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-[10px] bg-[#EEF0FB] text-[#2137B6] dark:bg-[#141C3D] dark:text-[#7B8CEA]">
                          {getInitials(user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
                            {user.name}
                          </p>
                          {user.is_primary && (
                            <span className="inline-flex items-center px-1 py-0 text-[9px] font-semibold rounded-[3px] bg-[#EEF0FB] text-[#2137B6] dark:bg-[#141C3D] dark:text-[#7B8CEA]">
                              principal
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-[#8B92A5] truncate">
                          {user.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      {user.phone && (
                        <p className="text-[12px] text-gray-700 dark:text-[#EAEDF3]">{user.phone}</p>
                      )}
                      <p className="text-[10px] text-gray-400 dark:text-[#5C6378]">
                        Convidado {new Date(user.invited_at ?? user.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {PERMISSION_KEYS.map((p) => (
                        <PermissionPill
                          key={p.key}
                          label={p.label}
                          enabled={user.permissions?.[p.key] ?? false}
                        />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {hasLoggedIn(user) ? (
                      <p className="text-[11px] text-gray-700 dark:text-[#EAEDF3]">
                        {formatRelativeAccess(user.last_login_at)}
                      </p>
                    ) : user.is_active ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-[4px] bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A]">
                        <Clock className="h-2.5 w-2.5" />
                        Convite pendente
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-400 dark:text-[#5C6378]">
                        Inativo
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEditModal(user)}
                        title="Editar usuário"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={actionLoading === user.id}
                          >
                            {actionLoading === user.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <MoreVertical className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleToggleActive(user)}>
                            <Switch checked={user.is_active} className="mr-2 pointer-events-none" />
                            {user.is_active ? "Desativar" : "Ativar"}
                          </DropdownMenuItem>
                          {!hasLoggedIn(user) ? (
                            <DropdownMenuItem onClick={() => handleSendInvite(user.id, user.email)}>
                              <Send className="h-4 w-4 mr-2" />
                              Reenviar convite
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => handleResetPassword(user.id)}>
                              <Key className="h-4 w-4 mr-2" />
                              Redefinir senha
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {portalUsers.length > 0 && (
          <div className="px-4 py-2.5 border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)] bg-[#EEF0FB]/30 dark:bg-[#141C3D]/30 flex items-center gap-2">
            <Sparkles className="h-3 w-3 text-[#2137B6] dark:text-[#7B8CEA]" />
            <p className="text-[11px] text-[#2137B6] dark:text-[#7B8CEA]">
              Os usuários recebem um email com link para criar a senha ao serem convidados.
            </p>
          </div>
        )}
      </CardContent>

      {/* Add User Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo usuário do portal</DialogTitle>
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
                onCheckedChange={(checked) => setFormData({ ...formData, is_primary: checked })}
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
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateUser}
              disabled={submitting || !formData.name || !formData.email}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Criar e enviar convite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar usuário do portal</DialogTitle>
            <DialogDescription>{editingUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit_name">Nome *</Label>
              <Input
                id="edit_name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_email">Email *</Label>
              <Input
                id="edit_email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_phone">Telefone</Label>
              <Input
                id="edit_phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit_primary">Contato principal</Label>
              <Switch
                id="edit_primary"
                checked={formData.is_primary}
                onCheckedChange={(checked) => setFormData({ ...formData, is_primary: checked })}
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
            <Button variant="secondary" onClick={() => setShowEditModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateUser} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
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
            <DialogTitle className="text-center">Convite enviado</DialogTitle>
            <DialogDescription className="text-center">{successMessage}</DialogDescription>
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
              Essa ação não pode ser desfeita. O usuário {selectedUser?.name} perderá acesso ao portal.
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
