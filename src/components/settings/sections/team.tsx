"use client"

/**
 * Secao de Configuracoes "team" — corpo extraido de
 * src/app/admin/settings/team/page.tsx (jul/2026) para ser
 * renderizavel tanto na pagina cheia (rota preservada) quanto no
 * SettingsModal global. Conteudo movido, nao reescrito.
 */

import { useState, useEffect, useCallback } from "react"
import Image from "next/image"
import {
  UserPlus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Send,
  Trash2,
  Key,
  Info,
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
import { ALL_ORG_ROLES, ORG_ROLE_LABELS, resolveMemberRoles } from "@/lib/permissions/role-access"
import type { OrgRole } from "@/types/organization"

// ── Types ────────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string
  name: string
  email: string
  avatar_url: string | null
  role: string
  org_role: string
  org_roles: OrgRole[]
  last_sign_in_at: string | null
  is_active: boolean
}

// ── InviteMemberModal ───────────────────────────────────────────────────────

function InviteMemberModal({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: () => void }) {
  const { toast } = useToast()
  const [email, setEmail] = useState("")
  const [roles, setRoles] = useState<OrgRole[]>(["suporte"])
  const [sending, setSending] = useState(false)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [invitedEmail, setInvitedEmail] = useState("")

  function resetAndClose() {
    setEmail("")
    setRoles(["suporte"])
    setTempPassword(null)
    setInvitedEmail("")
    onClose()
  }

  function toggleRole(role: OrgRole) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    )
  }

  function copyPassword() {
    if (!tempPassword) return
    navigator.clipboard.writeText(tempPassword)
    toast({ title: "Copiado!", description: "Senha copiada para a área de transferência" })
  }

  async function handleInvite() {
    if (!email || roles.length === 0) return
    setSending(true)
    try {
      const response = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, roles }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || "Erro ao enviar convite")
      }
      onInvited()
      const pwd = data.data?.temp_password || data.temp_password || null
      if (pwd) {
        setInvitedEmail(email)
        setTempPassword(pwd)
      } else {
        toast({ title: "Convite enviado!", description: `Convite enviado para ${email}` })
        resetAndClose()
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Erro", description: err instanceof Error ? err.message : "Erro ao enviar convite" })
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{tempPassword ? "Membro criado" : "Convidar membro"}</DialogTitle>
        </DialogHeader>

        {tempPassword ? (
          <div className="space-y-4 py-4">
            <p className="text-[13px] text-gray-600 dark:text-[#8B92A5]">
              Convite criado para <span className="font-medium">{invitedEmail}</span>. Anote a senha
              provisória abaixo — será solicitada a troca no primeiro acesso.
            </p>
            <div className="flex items-center gap-2 p-3 rounded-[6px] bg-gray-50 dark:bg-[#242836] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
              <code className="flex-1 text-[15px] font-mono font-semibold tracking-wide text-gray-900 dark:text-[#EAEDF3] break-all">
                {tempPassword}
              </code>
              <Button variant="secondary" size="sm" onClick={copyPassword}>
                <Key className="h-4 w-4 mr-1.5" />
                Copiar
              </Button>
            </div>
            <DialogFooter>
              <Button variant="primary" size="md" onClick={resetAndClose} className="w-full sm:w-auto">
                Fechar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-4">
              <FormField label="Email" required>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@empresa.com" />
              </FormField>

              <FormField label="Funções (1 ou mais)" required>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_ORG_ROLES.map((r) => (
                    <label
                      key={r}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-[6px] border cursor-pointer text-[13px]",
                        "border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
                        roles.includes(r)
                          ? "bg-gray-900 text-white dark:bg-white dark:text-[#0F1117] border-transparent"
                          : "bg-white dark:bg-[#1A1D27] text-gray-700 dark:text-[#EAEDF3] hover:bg-gray-50 dark:hover:bg-[#242836]"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={roles.includes(r)}
                        onChange={() => toggleRole(r)}
                        className="sr-only"
                      />
                      {ORG_ROLE_LABELS[r]}
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mt-2">
                  Multi-função: a conta vê a união do que cada função libera.
                </p>
              </FormField>
            </div>

            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button variant="ghost" size="md" onClick={resetAndClose} className="w-full sm:w-auto">Cancelar</Button>
              <Button variant="primary" size="md" onClick={handleInvite} disabled={!email || roles.length === 0 || sending} className="w-full sm:w-auto">
                {sending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Enviar convite
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── EditRolesModal ──────────────────────────────────────────────────────────

function EditRolesModal({
  member,
  onClose,
  onSaved,
}: {
  member: TeamMember | null
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [roles, setRoles] = useState<OrgRole[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (member) setRoles(member.org_roles)
  }, [member])

  function toggleRole(role: OrgRole) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    )
  }

  async function handleSave() {
    if (!member || roles.length === 0) return
    setSaving(true)
    try {
      const response = await fetch(`/api/admin/org-members/${member.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Erro ao salvar funções")
      toast({ title: "Funções atualizadas", description: `Acesso de ${member.name} atualizado.` })
      onSaved()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro ao salvar funções",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Editar funções</DialogTitle>
        </DialogHeader>
        {member && (
          <>
            <div className="space-y-4 py-4">
              <div className="p-3 rounded-[6px] bg-gray-50 dark:bg-[#242836] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
                <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3]">{member.name}</p>
                <p className="text-xs text-gray-400 dark:text-[#5C6378]">{member.email}</p>
              </div>

              <FormField label="Funções (1 ou mais)" required>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_ORG_ROLES.map((r) => (
                    <label
                      key={r}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-[6px] border cursor-pointer text-[13px]",
                        "border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
                        roles.includes(r)
                          ? "bg-gray-900 text-white dark:bg-white dark:text-[#0F1117] border-transparent"
                          : "bg-white dark:bg-[#1A1D27] text-gray-700 dark:text-[#EAEDF3] hover:bg-gray-50 dark:hover:bg-[#242836]"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={roles.includes(r)}
                        onChange={() => toggleRole(r)}
                        className="sr-only"
                      />
                      {ORG_ROLE_LABELS[r]}
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mt-2">
                  A conta vê a união do que cada função libera.
                </p>
              </FormField>
            </div>

            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button variant="ghost" size="md" onClick={onClose} className="w-full sm:w-auto">
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleSave}
                disabled={roles.length === 0 || saving}
                className="w-full sm:w-auto"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Salvar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── TeamSettingsPage ────────────────────────────────────────────────────────

type TeamTab = "members" | "permissions"

export function TeamSection() {
  const { toast } = useToast()
  const [tab, setTab] = useState<TeamTab>("members")
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)

  const loadMembers = useCallback(async () => {
    try {
      const supabase = createClient()
      // Sem embed em org_member_roles: o embed do PostgREST derruba a query
      // inteira (400) se a junction estiver ausente/sem grant, e a tela some.
      // Buscamos a junction numa query separada e tolerante a falha.
      const { data, error } = await supabase
        .from("org_members")
        .select(`
          id, role, is_active,
          profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url, role)
        `)
        .eq("is_active", true)
        .order("created_at", { ascending: false })

      if (error) throw error

      const rows = (data || []) as Array<Record<string, unknown>>
      const ids = rows.map((m) => m.id as string)

      // Junction (fonte de verdade). Se falhar (tabela ausente/sem grant),
      // caímos no fallback pelo org_members.role legado.
      const rolesByMember = new Map<string, string[]>()
      if (ids.length > 0) {
        const { data: roleRows } = await supabase
          .from("org_member_roles")
          .select("org_member_id, role")
          .in("org_member_id", ids)
        ;(roleRows ?? []).forEach((r: { org_member_id: string; role: string }) => {
          const list = rolesByMember.get(r.org_member_id) ?? []
          list.push(r.role)
          rolesByMember.set(r.org_member_id, list)
        })
      }

      const mapped: TeamMember[] = rows.map((m) => {
        const p = m.profile as Record<string, unknown> | null
        const legacyRole = (m.role as string) || "suporte"
        const orgRoles = resolveMemberRoles(rolesByMember.get(m.id as string), legacyRole)
        return {
          id: m.id as string,
          name: (p?.name as string) || "—",
          email: (p?.email as string) || "—",
          avatar_url: (p?.avatar_url as string) || null,
          role: (p?.role as string) || "member",
          org_role: legacyRole,
          org_roles: orgRoles,
          last_sign_in_at: null,
          is_active: m.is_active as boolean,
        }
      })
      setMembers(mapped)
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : JSON.stringify(err)
      console.error("[team] loadMembers failed:", err)
      toast({
        variant: "destructive",
        title: "Erro ao carregar equipe",
        description: msg || "Erro desconhecido — abra o DevTools (Console) para detalhes.",
      })
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

  function getRoleBadgeVariant(role: OrgRole) {
    if (role === "admin" || role === "dev") return "negative" as const
    if (role === "coo") return "info" as const
    return "neutral" as const
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipe"
        badge={members.length}
        description="Gerencie usuários e funções de acesso."
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
                      <TableHead>Funções</TableHead>
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
                                <Image src={member.avatar_url} alt={member.name} width={32} height={32} className="w-8 h-8 rounded-full object-cover" />
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
                          <div className="flex flex-wrap gap-1">
                            {member.org_roles.map((r) => (
                              <Badge key={r} variant={getRoleBadgeVariant(r)} showDot={false}>
                                {ORG_ROLE_LABELS[r] ?? r}
                              </Badge>
                            ))}
                          </div>
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
                              <DropdownMenuItem onClick={() => setEditingMember(member)}>
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

              {/* Mobile card stack */}
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
                            <Image src={member.avatar_url} alt={member.name} width={32} height={32} className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            member.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">{member.name}</p>
                          <p className="text-xs text-gray-400 dark:text-[#5C6378] truncate">{member.email}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 justify-end max-w-[40%]">
                        {member.org_roles.map((r) => (
                          <Badge key={r} variant={getRoleBadgeVariant(r)} showDot={false}>
                            {ORG_ROLE_LABELS[r] ?? r}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-[rgba(0,0,0,0.04)] dark:border-[rgba(255,255,255,0.04)]">
                      <span className="text-xs font-mono tabular-nums text-gray-400 dark:text-[#5C6378]">
                        {member.last_sign_in_at ? formatRelativeTime(member.last_sign_in_at) : "Nunca acessou"}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => setEditingMember(member)}>
                          <Pencil className="h-4 w-4 text-gray-500 dark:text-[#8B92A5]" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => handleRemoveMember(member)}>
                          <Trash2 className="h-4 w-4 text-[#991B1B] dark:text-[#FCA5A5]" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Permissions tab (informational) */}
      {tab === "permissions" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Icon icon={Info} size={16} className="text-gray-400 dark:text-[#5C6378]" />
              Permissões por função
            </CardTitle>
            <CardDescription>
              Cada conta tem uma ou mais funções; o acesso a cada item do menu é a UNIÃO do que
              suas funções liberam. Admin e Dev têm acesso total. A matriz oficial vive em
              <code className="ml-1">src/lib/permissions/role-access.ts</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ALL_ORG_ROLES.map((r) => (
                <div
                  key={r}
                  className="rounded-[6px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] p-3"
                >
                  <Badge variant={getRoleBadgeVariant(r)} showDot={false} className="mb-2">
                    {ORG_ROLE_LABELS[r]}
                  </Badge>
                  <p className="text-[12px] text-gray-500 dark:text-[#8B92A5]">
                    {roleDescription(r)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <InviteMemberModal open={showInvite} onClose={() => setShowInvite(false)} onInvited={loadMembers} />
      <EditRolesModal
        member={editingMember}
        onClose={() => setEditingMember(null)}
        onSaved={() => {
          setEditingMember(null)
          loadMembers()
        }}
      />
    </div>
  )
}

function roleDescription(role: OrgRole): string {
  switch (role) {
    case "admin":
      return "Acesso total a tudo, inclusive Ferramentas e configurações internas."
    case "dev":
      return "Acesso total (engenharia). Mesmo bypass do Admin."
    case "coo":
      return "Operação inteira + Geral. Não vê Comercial nem Ferramentas."
    case "suporte":
      return "Comercial completo + operação parcial. Equipe em modo leitura."
    case "designer":
      return "Operacional restrito (Dashboard, Lojas, Onboarding) + Geral mínimo."
    case "implementacao":
      return "Mesmo conjunto que Designer por enquanto."
  }
}
