"use client"

import { useState, useEffect, useCallback } from "react"
import {
  UserPlus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Send,
  Trash2,
  ShieldAlert,
  ShieldCheck,
  Shield,
  Eye,
  Key,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { FormField } from "@/components/ui/form-field"
import { SegmentedTabs, SegmentedTabItem } from "@/components/ui/segmented-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/lib/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

// ── Types ────────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string
  name: string
  email: string
  avatar_url: string | null
  role: string
  org_role: string
  last_sign_in_at: string | null
  is_active: boolean
}

// ── Permission Matrix (static, from original) ──────────────────────────────

const roles = [
  { name: "Admin", icon: ShieldAlert, color: "negative" as const, permissions: { clients: "Total", pipeline: "Total", reports: "Total", settings: "Total", team: "Total", financial: "Total", integrations: "Total", delete: "Sim" } },
  { name: "Manager", icon: ShieldCheck, color: "info" as const, permissions: { clients: "Total", pipeline: "Total", reports: "Total", settings: "Leitura", team: "Leitura", financial: "Leitura", integrations: "Leitura", delete: "Não" } },
  { name: "Member", icon: Shield, color: "neutral" as const, permissions: { clients: "Próprios", pipeline: "Edição", reports: "Leitura", settings: "Não", team: "Não", financial: "Não", integrations: "Não", delete: "Não" } },
  { name: "Viewer", icon: Eye, color: "warning" as const, permissions: { clients: "Leitura", pipeline: "Leitura", reports: "Leitura", settings: "Não", team: "Não", financial: "Não", integrations: "Não", delete: "Não" } },
]

const permissionLabels: Record<string, string> = {
  clients: "Clientes", pipeline: "Pipeline", reports: "Relatórios", settings: "Configurações",
  team: "Equipe", financial: "Financeiro", integrations: "Integrações", delete: "Excluir dados",
}

// ── InviteMemberModal ───────────────────────────────────────────────────────

function InviteMemberModal({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: () => void }) {
  const { toast } = useToast()
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("member")
  const [sending, setSending] = useState(false)

  async function handleInvite() {
    if (!email) return
    setSending(true)
    try {
      const response = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Erro ao enviar convite")
      }
      toast({ title: "Convite enviado!", description: `Convite enviado para ${email}` })
      setEmail("")
      setRole("member")
      onInvited()
      onClose()
    } catch (err) {
      toast({ variant: "destructive", title: "Erro", description: err instanceof Error ? err.message : "Erro ao enviar convite" })
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Convidar membro</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <FormField label="Email" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@empresa.com" />
          </FormField>

          <FormField label="Role" required>
            <SegmentedTabs value={role} onValueChange={setRole}>
              <SegmentedTabItem value="admin">Admin</SegmentedTabItem>
              <SegmentedTabItem value="manager">Manager</SegmentedTabItem>
              <SegmentedTabItem value="member">Membro</SegmentedTabItem>
            </SegmentedTabs>
            <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mt-2">
              {role === "admin" && "Acesso total ao sistema, incluindo configurações e equipe."}
              {role === "manager" && "Gerencia clientes, lojas e campanhas. Sem acesso a configurações."}
              {role === "member" && "Acesso limitado às lojas atribuídas. Sem financeiro ou equipe."}
            </p>
          </FormField>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button variant="ghost" size="md" onClick={onClose} className="w-full sm:w-auto">Cancelar</Button>
          <Button variant="primary" size="md" onClick={handleInvite} disabled={!email || sending} className="w-full sm:w-auto">
            {sending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Enviar convite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── TeamSettingsPage ────────────────────────────────────────────────────────

type TeamTab = "members" | "permissions"

export default function TeamSettingsPage() {
  const { toast } = useToast()
  const [tab, setTab] = useState<TeamTab>("members")
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)

  const loadMembers = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("org_members")
        .select(`
          id, role, is_active,
          profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url, role, last_sign_in_at)
        `)
        .eq("is_active", true)
        .order("created_at", { ascending: false })

      if (error) throw error

      const mapped: TeamMember[] = (data || []).map((m: Record<string, unknown>) => {
        const p = m.profile as Record<string, unknown> | null
        return {
          id: m.id as string,
          name: (p?.name as string) || "—",
          email: (p?.email as string) || "—",
          avatar_url: (p?.avatar_url as string) || null,
          role: (p?.role as string) || "member",
          org_role: (m.role as string) || "member",
          last_sign_in_at: (p?.last_sign_in_at as string) || null,
          is_active: m.is_active as boolean,
        }
      })
      setMembers(mapped)
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Erro ao carregar equipe." })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { loadMembers() }, [loadMembers])

  async function handleRemoveMember(member: TeamMember) {
    if (!confirm(`Remover ${member.name} da equipe?`)) return
    try {
      const supabase = createClient()
      await supabase.from("org_members").update({ is_active: false }).eq("id", member.id)
      setMembers((prev) => prev.filter((m) => m.id !== member.id))
      toast({ title: "Membro removido" })
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Erro ao remover membro." })
    }
  }

  function formatRelativeTime(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return "Hoje"
    if (diffDays === 1) return "Ontem"
    if (diffDays < 30) return `${diffDays}d atrás`
    return date.toLocaleDateString("pt-BR")
  }

  function getRoleBadgeVariant(role: string) {
    if (role === "admin" || role === "owner") return "negative" as const
    if (role === "manager") return "info" as const
    return "neutral" as const
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipe"
        badge={members.length}
        description="Gerencie usuários, roles e permissões de acesso."
        breadcrumb={[
          { label: "Configurações", href: "/admin/settings" },
          { label: "Equipe" },
        ]}
        actions={
          <Button variant="primary" size="md" onClick={() => setShowInvite(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Convidar membro
          </Button>
        }
      >
        <SegmentedTabs value={tab} onValueChange={(v) => setTab(v as TeamTab)}>
          <SegmentedTabItem value="members">Membros</SegmentedTabItem>
          <SegmentedTabItem value="permissions">Permissões</SegmentedTabItem>
        </SegmentedTabs>
      </PageHeader>

      {/* Members tab */}
      {tab === "members" && (
        <>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-[8px]" />)}
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-[#5C6378]">
              Nenhum membro na equipe.
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Membro</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Último acesso</TableHead>
                      <TableHead className="w-[48px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-[#242836] flex items-center justify-center text-xs font-semibold text-gray-500 dark:text-[#8B92A5] shrink-0 overflow-hidden">
                              {member.avatar_url ? (
                                <img src={member.avatar_url} alt={member.name} className="w-8 h-8 rounded-full object-cover" />
                              ) : (
                                member.name.charAt(0).toUpperCase()
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">{member.name}</p>
                              <p className="text-xs text-gray-400 dark:text-[#5C6378] truncate">{member.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getRoleBadgeVariant(member.org_role)} showDot={false} className="capitalize">
                            {member.org_role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-mono tabular-nums text-gray-400 dark:text-[#5C6378]">
                            {member.last_sign_in_at ? formatRelativeTime(member.last_sign_in_at) : "Nunca"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Pencil className="h-4 w-4 mr-2" />
                                Editar permissões
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Send className="h-4 w-4 mr-2" />
                                Reenviar convite
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-[#991B1B] dark:text-[#FCA5A5]" onClick={() => handleRemoveMember(member)}>
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remover
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile card stack — Rule 22 */}
              <div className="md:hidden space-y-2">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className={cn(
                      "rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
                      "bg-white dark:bg-[#1A1D27] p-4",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-[#242836] flex items-center justify-center text-xs font-semibold text-gray-500 dark:text-[#8B92A5] shrink-0 overflow-hidden">
                          {member.avatar_url ? (
                            <img src={member.avatar_url} alt={member.name} className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            member.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">{member.name}</p>
                          <p className="text-xs text-gray-400 dark:text-[#5C6378] truncate">{member.email}</p>
                        </div>
                      </div>
                      <Badge variant={getRoleBadgeVariant(member.org_role)} showDot={false} className="capitalize shrink-0">
                        {member.org_role}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-[rgba(0,0,0,0.04)] dark:border-[rgba(255,255,255,0.04)]">
                      <span className="text-xs font-mono tabular-nums text-gray-400 dark:text-[#5C6378]">
                        {member.last_sign_in_at ? formatRelativeTime(member.last_sign_in_at) : "Nunca acessou"}
                      </span>
                      <Button variant="ghost" size="icon-sm" onClick={() => handleRemoveMember(member)}>
                        <Trash2 className="h-4 w-4 text-[#991B1B] dark:text-[#FCA5A5]" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Permissions tab (static matrix) */}
      {tab === "permissions" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Icon icon={Key} size={16} className="text-gray-400 dark:text-[#5C6378]" />
              Matriz de Permissões
            </CardTitle>
            <CardDescription>
              As permissões são gerenciadas via RLS no banco de dados.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Recurso</TableHead>
                  {roles.map((role) => (
                    <TableHead key={role.name} className="text-center">
                      <Badge variant={role.color} showDot={false}>{role.name}</Badge>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.keys(permissionLabels).map((key) => (
                  <TableRow key={key}>
                    <TableCell className="font-medium text-sm">{permissionLabels[key]}</TableCell>
                    {roles.map((role) => {
                      const val = role.permissions[key as keyof typeof role.permissions]
                      return (
                        <TableCell key={role.name} className="text-center text-sm">
                          <span className={val === "Não" ? "text-muted-foreground" : val === "Total" || val === "Sim" ? "text-success font-medium" : ""}>
                            {val}
                          </span>
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <InviteMemberModal open={showInvite} onClose={() => setShowInvite(false)} onInvited={loadMembers} />
    </div>
  )
}
