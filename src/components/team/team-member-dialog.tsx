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
import { toast } from "@/lib/hooks/use-toast"
import type { FeatureCatalog, Organization, OrgRole } from "@/types"

interface UserProfile {
  id: string
  name: string
  email: string
  avatar_url?: string
}

interface MemberWithDetails {
  id: string
  org_id: string
  profile_id: string
  role: OrgRole
  is_active: boolean
  invited_at?: string
  joined_at?: string
  created_at: string
  updated_at: string
  job_title?: string
  organization?: Organization
  profile?: UserProfile
  enabled_features?: string[]
  store_access_count?: number
}

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
  features: FeatureCatalog[]
  organizations: Organization[]
  stores: StoreWithClient[]
}

const schema = z.object({
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").optional().or(z.literal("")),
  role: z.enum(["owner", "manager", "coordinator", "copywriter", "designer", "developer", "support", "analyst"]),
  job_title: z.string().optional(),
  org_id: z.string().min(1, "Organização é obrigatória"),
})

type FormData = z.infer<typeof schema>

const roleOptions: { value: OrgRole; label: string }[] = [
  { value: "owner", label: "Owner (Acesso total)" },
  { value: "manager", label: "Gerente" },
  { value: "coordinator", label: "Coordenador" },
  { value: "copywriter", label: "Copywriter" },
  { value: "designer", label: "Designer" },
  { value: "developer", label: "Desenvolvedor" },
  { value: "support", label: "Suporte" },
  { value: "analyst", label: "Analista" },
]

// Group features by category
function groupFeaturesByCategory(features: FeatureCatalog[]) {
  return features.reduce((acc, feature) => {
    if (!acc[feature.category]) {
      acc[feature.category] = []
    }
    acc[feature.category].push(feature)
    return acc
  }, {} as Record<string, FeatureCatalog[]>)
}

const categoryLabels: Record<string, string> = {
  onboarding: "Onboarding",
  team: "Equipe",
  campaign: "Campanhas",
  request: "Solicitações",
  calendar: "Calendário",
  admin: "Administração",
}

export function TeamMemberDialog({
  open,
  onClose,
  onSuccess,
  member,
  features,
  organizations,
  stores,
}: TeamMemberDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([])
  const [selectedStores, setSelectedStores] = useState<string[]>([])
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
      role: "support",
      org_id: organizations[0]?.id || "",
    },
  })

  const selectedRole = watch("role")

  // Reset form when dialog opens/closes or member changes
  useEffect(() => {
    if (open) {
      if (member) {
        setValue("role", member.role)
        setValue("job_title", member.job_title || "")
        setValue("org_id", member.org_id)
        setSelectedFeatures(member.enabled_features || [])
        // Load store access for editing
        loadMemberStoreAccess(member.id)
      } else {
        reset({
          email: "",
          name: "",
          role: "support",
          job_title: "",
          org_id: organizations[0]?.id || "",
        })
        setSelectedFeatures([])
        setSelectedStores([])
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
      // Ignore errors
    }
  }

  function toggleFeature(featureKey: string) {
    setSelectedFeatures((prev) =>
      prev.includes(featureKey)
        ? prev.filter((f) => f !== featureKey)
        : [...prev, featureKey]
    )
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
            role: data.role,
            job_title: data.job_title,
            features: selectedFeatures,
            store_ids: selectedStores,
          }
        : {
            org_id: data.org_id,
            email: data.email,
            name: data.name,
            role: data.role,
            job_title: data.job_title,
            features: selectedFeatures,
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

  const groupedFeatures = groupFeaturesByCategory(features)

  // Check if role is owner/manager (they have all features)
  const hasAllFeatures = selectedRole === "owner" || selectedRole === "manager"

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
                <Button type="button" variant="outline" size="sm" onClick={copyTempPassword}>
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
              <TabsTrigger value="features">Features</TabsTrigger>
              <TabsTrigger value="stores">Lojas</TabsTrigger>
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
                  <Label htmlFor="role">Cargo *</Label>
                  <Select
                    value={watch("role")}
                    onValueChange={(value) => setValue("role", value as OrgRole)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o cargo" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.role && (
                    <p className="text-sm text-destructive">{errors.role.message}</p>
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

              <TabsContent value="features" className="mt-0 space-y-4">
                {hasAllFeatures ? (
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">
                      {selectedRole === "owner" ? "Owners" : "Gerentes"} têm acesso a todas as features automaticamente.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(groupedFeatures).map(([category, categoryFeatures]) => (
                      <div key={category} className="space-y-2">
                        <h4 className="font-medium text-sm">
                          {categoryLabels[category] || category}
                        </h4>
                        <div className="grid gap-2">
                          {categoryFeatures.map((feature) => (
                            <label
                              key={feature.key}
                              className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={selectedFeatures.includes(feature.key)}
                                onChange={() => toggleFeature(feature.key)}
                                className="h-4 w-4 rounded border-border"
                              />
                              <div className="flex-1">
                                <p className="font-medium text-sm">{feature.name}</p>
                                {feature.description && (
                                  <p className="text-xs text-muted-foreground">
                                    {feature.description}
                                  </p>
                                )}
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="stores" className="mt-0 space-y-4">
                {hasAllFeatures ? (
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">
                      {selectedRole === "owner" ? "Owners" : "Gerentes"} têm acesso a todas as lojas automaticamente.
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
                          variant="outline"
                          size="sm"
                          onClick={selectAllStores}
                        >
                          Selecionar todas
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
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
            </div>
          </Tabs>

          <DialogFooter className="pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
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
