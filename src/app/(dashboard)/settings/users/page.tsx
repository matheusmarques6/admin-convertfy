"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Users, MoreHorizontal, Mail, Shield, UserPlus, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/lib/hooks/use-toast"

interface Profile {
  id: string
  name: string
  email: string
  avatar_url: string | null
  role: string
  created_at: string
}

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  manager: "Gerente",
  sdr: "SDR",
  closer: "Closer",
  cs: "Customer Success",
  financial: "Financeiro",
}

const roleColors: Record<string, string> = {
  admin: "bg-red-500/10 text-red-500",
  manager: "bg-purple-500/10 text-purple-500",
  sdr: "bg-blue-500/10 text-blue-500",
  closer: "bg-emerald-500/10 text-emerald-500",
  cs: "bg-amber-500/10 text-amber-500",
  financial: "bg-slate-500/10 text-slate-500",
}

export default function UsersSettingsPage() {
  const [users, setUsers] = useState<Profile[]>([])
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [isFetching, setIsFetching] = useState(true)
  const [isInviting, setIsInviting] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("cs")
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    async function fetchUsers() {
      try {
        const supabase = createClient()

        const { data: { user } } = await supabase.auth.getUser()

        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: true })

        if (error) throw error

        setUsers(data || [])

        if (user && data) {
          const current = data.find(p => p.id === user.id)
          setCurrentUser(current || null)
        }
      } catch (error) {
        console.error("Error fetching users:", error)
        toast({
          variant: "destructive",
          title: "Erro ao carregar usuários",
          description: "Tente novamente mais tarde.",
        })
      } finally {
        setIsFetching(false)
      }
    }

    fetchUsers()
  }, [])

  async function handleRoleChange(userId: string, newRole: string) {
    try {
      const supabase = createClient()

      const { error } = await supabase
        .from("profiles")
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq("id", userId)

      if (error) throw error

      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u))

      toast({
        title: "Cargo atualizado!",
        description: "O cargo do usuário foi alterado.",
      })
    } catch (error) {
      console.error("Error updating role:", error)
      toast({
        variant: "destructive",
        title: "Erro ao atualizar cargo",
        description: "Tente novamente.",
      })
    }
  }

  async function handleInviteUser() {
    if (!inviteEmail) {
      toast({
        variant: "destructive",
        title: "Email obrigatório",
        description: "Digite o email do usuário a ser convidado.",
      })
      return
    }

    setIsInviting(true)

    try {
      // Note: In a real app, this would send an invitation email
      // For now, we just show a success message
      toast({
        title: "Convite enviado!",
        description: `Um convite foi enviado para ${inviteEmail}`,
      })

      setInviteEmail("")
      setInviteRole("cs")
      setDialogOpen(false)
    } catch {
      toast({
        variant: "destructive",
        title: "Erro ao enviar convite",
        description: "Tente novamente mais tarde.",
      })
    } finally {
      setIsInviting(false)
    }
  }

  const isAdmin = currentUser?.role === "admin"

  if (isFetching) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-6 w-24" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/settings">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Usuários</h1>
            <p className="text-muted-foreground">
              Gerencie os usuários do sistema
            </p>
          </div>
        </div>

        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Convidar Usuário
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Convidar Novo Usuário</DialogTitle>
                <DialogDescription>
                  Envie um convite para adicionar um novo membro à equipe.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="usuario@email.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    disabled={isInviting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-role">Cargo</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole} disabled={isInviting}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cs">Customer Success</SelectItem>
                      <SelectItem value="sdr">SDR</SelectItem>
                      <SelectItem value="closer">Closer</SelectItem>
                      <SelectItem value="financial">Financeiro</SelectItem>
                      <SelectItem value="manager">Gerente</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isInviting}>
                  Cancelar
                </Button>
                <Button onClick={handleInviteUser} disabled={isInviting}>
                  {isInviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enviar Convite
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Users List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Equipe ({users.length})
          </CardTitle>
          <CardDescription>
            Membros com acesso ao sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-4 rounded-lg border"
              >
                <div className="flex items-center gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={user.avatar_url || ""} />
                    <AvatarFallback>
                      {user.name?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">
                      {user.name}
                      {user.id === currentUser?.id && (
                        <span className="text-muted-foreground ml-2">(você)</span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {user.email}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <Badge className={roleColors[user.role] || "bg-muted"}>
                    {roleLabels[user.role] || user.role}
                  </Badge>

                  {isAdmin && user.id !== currentUser?.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="text-muted-foreground" disabled>
                          <Shield className="mr-2 h-4 w-4" />
                          Alterar Cargo
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {Object.entries(roleLabels).map(([value, label]) => (
                          <DropdownMenuItem
                            key={value}
                            onClick={() => handleRoleChange(user.id, value)}
                            disabled={user.role === value}
                          >
                            {label}
                            {user.role === value && " ✓"}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {!isAdmin && (
        <div className="text-center py-4 text-muted-foreground text-sm">
          Apenas administradores podem gerenciar usuários
        </div>
      )}

      {/* Back */}
      <div className="flex justify-end">
        <Button variant="outline" asChild>
          <Link href="/settings">Voltar</Link>
        </Button>
      </div>
    </div>
  )
}
