"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
/* Select still used for org_id dropdown below. */
import { toast } from "@/lib/hooks/use-toast"
import { AgentBoardConfig, type BoardConfigState } from "./agent-board-config"
import { ALL_ORG_ROLES, ORG_ROLE_LABELS } from "@/lib/permissions/role-access"
import { cn } from "@/lib/utils"

import type { MemberWithDetails, Organization, OrgRole } from "@/types"

interface StoreWithClient {
  id: string
  store_name: string
  store_url?: string
  platform?: string
  client?: { id: string; name: string }
}

interface TeamMemberDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  member: MemberWithDetails | null
  organizations: Organization[]
  stores: StoreWithClient[]
}

const schema = z.object({
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").optional().or(z.literal("")),
  roles: z.array(z.enum(["admin", "dev", "coo", "suporte", "designer", "implementacao"])).min(1, "Selecione ao menos uma função"),
  job_title: z.string().optional(),
  org_id: z.string().min(1, "Organização é obrigatória"),
})

type FormData = z.infer<typeof schema>

export function TeamMemberDialog({
  open,
  onClose,
  onSuccess,
  member,
  organizations,
  stores,
}: TeamMemberDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedStores, setSelectedStores] = useState<string[]>([])
  const [boardConfig, setBoardConfig] = useState<BoardConfigState | null>(null)
  const [boardConfigLoading, setBoardConfigLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("info")
  const [tempPassword, setTempPassword] = useState<string | null>(null)

  const isEditing = !!member

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      roles: ["suporte"],
      org_id: organizations[0]?.id || "",
    },
  })

  const selectedRoles = (watch("roles") || []) as OrgRole[]
  const primaryRole: OrgRole = selectedRoles[0] || "suporte"
  const hasBypass = selectedRoles.includes("admin") || selectedRoles.includes("dev")

  function toggleRole(role: OrgRole) {
    const next = selectedRoles.includes(role)
      ? selectedRoles.filter((r) => r !== role)
      : [...selectedRoles, role]
    setValue("roles", next as FormData["roles"], { shouldValidate: true })
  }

  // Reset form when dialog opens/closes or member changes
  useEffect(() => {
    if (open) {
      if (member) {
        const memberRoles = (member.roles && member.roles.length > 0
          ? member.roles
          : [member.role]) as OrgRole[]
        setValue("roles", memberRoles as FormData["roles"])
        setValue("job_title", member.job_title || "")
        setValue("org_id", member.org_id)
        loadMemberStoreAccess(member.id)
        loadBoardConfig(member.id)
      } else {
        reset({
          email: "",
          name: "",
          roles: ["suporte"],
          job_title: "",
          org_id: organizations[0]?.id || "",
        })
        setSelectedStores([])
        setBoardConfig(null)
        setTempPassword(null)
      }
      setActiveTab("info")
    }
  }, [open, member, organizations, setValue, reset])

  async function loadMemberStoreAccess(memberId: string) {
    try {
      const response = await fetch(`/api/admin/store-access?org_member_id=${memberId}`)
      if (response.ok) {
        const data = await response.json()
        setSelectedStores(data.access?.map((a: { store_id: string }) => a.store_id) || [])
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Erro ao carregar acessos",
        description: "Não foi possível carregar os acessos às lojas deste membro.",
      })
    }
  }

  async function loadBoardConfig(memberId: string) {
    setBoardConfigLoading(true)
    try {
      const response = await fetch(`/api/team/board-config?org_member_id=${memberId}`)
      if (response.ok) {
        const data = await response.json()
        setBoardConfig(data.config)
      }
    } catch {
      // Silently fail — defaults will be used
    } finally {
      setBoardConfigLoading(false)
    }
  }

  async function saveBoardConfig(memberId: string) {
    if (!boardConfig) return
    try {
      await fetch("/api/team/board-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_member_id: memberId,
          ...boardConfig,
        }),
      })
    } catch {
      // Non-blocking: board config save failure shouldn't block member save
    }
  }

  function toggleStore(storeId: string) {
    setSelectedStores((prev) =>
      prev.includes(storeId)
        ? prev.filter((s) => s !== storeId)
        : [...prev, storeId]
    )
  }

  function selectAllStores() {
    setSelectedStores(stores.map((s) => s.id))
  }

  function deselectAllStores() {
    setSelectedStores([])
  }

  function copyTempPassword() {
    if (tempPassword) {
      navigator.clipboard.writeText(tempPassword)
      toast({
        title: "Copiado!",
        description: "Senha copiada para a área de transferência",
      })
    }
  }

  function handleCloseWithPassword() {
    setTempPassword(null)
    onSuccess()
  }

  async function onSubmit(data: FormData) {
    // Client-side validation: email and name required when creating
    if (!isEditing && (!data.email || !data.name)) {
      toast({
        variant: "destructive",
        title: "Campos obrigatórios",
        description: "Email e nome são obrigatórios para criar um novo membro.",
      })
      return
    }

    setIsSubmitting(true)

    try {
      const url = isEditing
        ? `/api/admin/org-members/${member.id}`
        : "/api/admin/org-members"

      const method = isEditing ? "PUT" : "POST"

      const body = isEditing
        ? {
            roles: data.roles,
            job_title: data.job_title,
            store_ids: selectedStores,
          }
        : {
            org_id: data.org_id,
            email: data.email,
            name: data.name,
            roles: data.roles,
            job_title: data.job_title,
            store_ids: selectedStores,
          }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Erro ao salvar")
      }

      // Save board config if changed
      if (boardConfig) {
        const memberId = isEditing ? member.id : result.member?.id
        if (memberId) {
          await saveBoardConfig(memberId)
        }
      }

      // Check if a temp password was returned (new user created)
      if (result.temp_password) {
        setTempPassword(result.temp_password)
        toast({
          title: "Membro criado",
          description: "Anote a senha provisória antes de fechar.",
        })
      } else {
        toast({
          title: isEditing ? "Membro atualizado" : "Membro criado",
          description: result.message,
        })
        onSuccess()
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao salvar membro",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => !isSubmitting && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {tempPassword ? "Membro Criado com Sucesso" : isEditing ? "Editar Membro" : "Novo Membro"}
          </DialogTitle>
          <DialogDescription>
            {tempPassword
              ? "Anote a senha provisória abaixo. O usuário deverá alterá-la no primeiro login."
              : isEditing
              ? "Atualize as informações e permissões do membro"
              : "Adicione um novo membro à equipe com suas permissões"}
          </DialogDescription>
        </DialogHeader>

        {tempPassword ? (
          <div className="flex-1 flex flex-col items-center justify-center py-8 space-y-6">
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">Senha Provisória</p>
              <div className="flex items-center gap-2 p-4 bg-muted rounded-lg">
                <code className="text-2xl font-mono font-bold tracking-wider">{tempPassword}</code>
                <Button type="button" variant="secondary" size="sm" onClick={copyTempPassword}>
                  Copiar
                </Button>
              </div>
            </div>
            <div className="text-center text-sm text-muted-foreground max-w-md">
              <p>
                O usuário deverá usar esta senha para fazer o primeiro login.
                Ao entrar, será solicitada a troca para uma nova senha.
              </p>
            </div>
            <DialogFooter className="w-full pt-4 border-t">
              <Button type="button" onClick={handleCloseWithPassword}>
                Fechar
              </Button>
            </DialogFooter>
          </div>
        ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-hidden flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="info">Informações</TabsTrigger>
              <TabsTrigger value="stores">Lojas</TabsTrigger>
              <TabsTrigger value="board">Board</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto py-4">
              <TabsContent value="info" className="mt-0 space-y-4">
                {!isEditing && (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="email@exemplo.com"
                        {...register("email")}
                      />
                      {errors.email && (
                        <p className="text-sm text-destructive">{errors.email.message}</p>
                      )}
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="name">Nome *</Label>
                      <Input
                        id="name"
                        placeholder="Nome completo"
                        {...register("name")}
                      />
                      {errors.name && (
                        <p className="text-sm text-destructive">{errors.name.message}</p>
                      )}
                    </div>
                  </>
                )}

                {isEditing && (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="font-medium">{member.profile?.name}</p>
                    <p className="text-sm text-muted-foreground">{member.profile?.email}</p>
                  </div>
                )}

                <div className="grid gap-2">
                  <Label htmlFor="org_id">Organização *</Label>
                  <Select
                    value={watch("org_id")}
                    onValueChange={(value) => setValue("org_id", value)}
                    disabled={isEditing}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a organização" />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.org_id && (
                    <p className="text-sm text-destructive">{errors.org_id.message}</p>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label>Funções *</Label>
                  <p className="text-xs text-muted-foreground">
                    Selecione uma ou mais. O acesso é a união do que cada função libera.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_ORG_ROLES.map((r) => (
                      <label
                        key={r}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer text-sm",
                          selectedRoles.includes(r)
                            ? "bg-foreground text-background border-transparent"
                            : "bg-background hover:bg-muted/50"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selectedRoles.includes(r)}
                          onChange={() => toggleRole(r)}
                          className="sr-only"
                        />
                        {ORG_ROLE_LABELS[r]}
                      </label>
                    ))}
                  </div>
                  {errors.roles && (
                    <p className="text-sm text-destructive">{errors.roles.message as string}</p>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="job_title">Título (opcional)</Label>
                  <Input
                    id="job_title"
                    placeholder="Ex: Designer Sênior, Copy Pleno..."
                    {...register("job_title")}
                  />
                </div>
              </TabsContent>

              <TabsContent value="stores" className="mt-0 space-y-4">
                {hasBypass ? (
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">
                      Admin e Dev têm acesso a todas as lojas automaticamente.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        {selectedStores.length} de {stores.length} lojas selecionadas
                      </p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={selectAllStores}
                        >
                          Selecionar todas
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={deselectAllStores}
                        >
                          Limpar
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-2 max-h-[300px] overflow-y-auto">
                      {stores.map((store) => (
                        <label
                          key={store.id}
                          className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedStores.includes(store.id)}
                            onChange={() => toggleStore(store.id)}
                            className="h-4 w-4 rounded border-border"
                          />
                          <div className="flex-1">
                            <p className="font-medium text-sm">{store.store_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {store.client?.name || "Sem cliente"} • {store.platform}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="board" className="mt-0">
                <AgentBoardConfig
                  orgMemberId={member?.id || ""}
                  role={primaryRole}
                  value={boardConfig}
                  onChange={setBoardConfig}
                  isLoading={boardConfigLoading}
                />
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="pt-4 border-t">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : isEditing ? "Salvar" : "Criar Membro"}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
