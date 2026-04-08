"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, AlertCircle, CheckCircle2, ChevronUp, ChevronDown, Trash2, Archive } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
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
} from "@/components/ui/dialog"
import { PageHeader } from "@/components/ui/page-header"
import { FormField } from "@/components/ui/form-field"
import { SaveBar } from "@/components/ui/save-bar"
import { toast } from "@/lib/hooks/use-toast"
import { ROUTES } from "@/lib/routes"
import { use } from "react"

const clientSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().min(10, "Telefone deve ter pelo menos 10 caracteres").optional().or(z.literal("")),
  company: z.string().optional(),
  website: z.string().optional().or(z.literal("")),
  cpf_cnpj: z.string().min(11, "CPF/CNPJ inválido").optional().or(z.literal("")),
  asaas_customer_id: z.string().optional(),
  status: z.enum(["active", "inactive", "prospect", "onboarding", "churned"]),
  notes: z.string().optional(),
  // Address
  address_street: z.string().optional(),
  address_number: z.string().optional(),
  address_complement: z.string().optional(),
  address_neighborhood: z.string().optional(),
  address_postal_code: z.string().optional(),
  address_city: z.string().optional(),
  address_state: z.string().optional(),
})

type ClientForm = z.infer<typeof clientSchema>

interface Client {
  id: string
  name: string
  email?: string
  phone?: string
  company?: string
  website?: string
  cpf_cnpj?: string
  asaas_customer_id?: string
  status: string
  address?: {
    street?: string
    number?: string
    complement?: string
    neighborhood?: string
    postal_code?: string
    city?: string
    state?: string
  }
  custom_fields?: Record<string, unknown>
}

export default function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(true)
  const [client, setClient] = useState<Client | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAddress, setShowAddress] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<ClientForm>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      status: "prospect",
    },
  })

  function onValidationError() {
    toast({
      variant: "destructive",
      title: "Campos com erro",
      description: "Verifique os campos destacados em vermelho e corrija antes de salvar.",
    })
  }

  useEffect(() => {
    async function fetchClient() {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("clients")
          .select("*")
          .eq("id", id)
          .single()

        if (error) throw error

        setClient(data)

        // Populate form
        setValue("name", data.name || "")
        setValue("email", data.email || "")
        setValue("phone", data.phone || "")
        setValue("company", data.company || "")
        setValue("website", data.website || "")

        // Read cpf_cnpj from root (preferred) or custom_fields (legacy)
        const customFields = data.custom_fields as Record<string, unknown> || {}
        setValue("cpf_cnpj", data.cpf_cnpj || (customFields.cpf_cnpj as string) || "")
        setValue("asaas_customer_id", (customFields.asaas_customer_id as string) || "")
        setValue("status", data.status || "prospect")

        // Address from custom_fields
        const addressData = (customFields.address as Record<string, string>) || null
        if (addressData) {
          setShowAddress(true)
          setValue("address_street", addressData.street || "")
          setValue("address_number", addressData.number || "")
          setValue("address_complement", addressData.complement || "")
          setValue("address_neighborhood", addressData.neighborhood || "")
          setValue("address_postal_code", addressData.postal_code || "")
          setValue("address_city", addressData.city || "")
          setValue("address_state", addressData.state || "")
        }

        // Notes from custom_fields
        if (customFields.notes) {
          setValue("notes", customFields.notes as string)
        }
      } catch (err) {
        console.error("Error fetching client:", err)
        setError("Erro ao carregar dados do cliente")
      } finally {
        setIsFetching(false)
      }
    }

    fetchClient()
  }, [id, setValue])

  async function onSubmit(data: ClientForm) {
    setIsLoading(true)

    try {
      // Normalize phone: keep only digits and optional leading +
      if (data.phone) {
        const rawPhone = data.phone
        const hasPlus = rawPhone.startsWith("+")
        const digits = rawPhone.replace(/\D/g, "")
        data.phone = hasPlus ? `+${digits}` : digits
      }

      // Normalize CPF/CNPJ: keep only digits, validate length
      if (data.cpf_cnpj) {
        const cpfCnpjDigits = data.cpf_cnpj.replace(/\D/g, "")
        if (cpfCnpjDigits.length !== 11 && cpfCnpjDigits.length !== 14) {
          toast({
            variant: "destructive",
            title: "CPF/CNPJ inválido",
            description: "CPF deve ter 11 dígitos e CNPJ deve ter 14 dígitos.",
          })
          setIsLoading(false)
          return
        }
        data.cpf_cnpj = cpfCnpjDigits
      }

      const supabase = createClient()

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()

      // Build address object
      const hasAddress = data.address_street || data.address_city || data.address_postal_code
      const address = hasAddress ? {
        street: data.address_street || undefined,
        number: data.address_number || undefined,
        complement: data.address_complement || undefined,
        neighborhood: data.address_neighborhood || undefined,
        postal_code: data.address_postal_code || undefined,
        city: data.address_city || undefined,
        state: data.address_state || undefined,
      } : null

      let asaasCustomerId = data.asaas_customer_id || null

      // If "000" is used, skip Asaas creation
      const skipAsaas = data.asaas_customer_id === "000"

      // If no Asaas ID and we have all required fields and not skipping, create customer in Asaas
      if (!skipAsaas && !asaasCustomerId && data.name && data.cpf_cnpj && (data.email || data.phone)) {
        try {
          const asaasResponse = await fetch("/api/integrations/asaas/customers/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: data.name,
              cpfCnpj: data.cpf_cnpj,
              email: data.email || undefined,
              phone: data.phone || undefined,
              mobilePhone: data.phone || undefined,
              address: data.address_street || undefined,
              addressNumber: data.address_number || undefined,
              complement: data.address_complement || undefined,
              province: data.address_neighborhood || undefined,
              postalCode: data.address_postal_code || undefined,
              externalReference: id,
            }),
          })

          const asaasData = await asaasResponse.json()

          if (asaasData.success && asaasData.customer?.id) {
            asaasCustomerId = asaasData.customer.id
            toast({
              title: "Cliente criado no Asaas!",
              description: asaasData.alreadyExists
                ? "Cliente já existia no Asaas e foi vinculado."
                : `ID: ${asaasData.customer.id}`,
            })
          } else if (!asaasResponse.ok) {
            console.warn("Asaas customer creation failed:", asaasData.error)
            toast({
              variant: "destructive",
              title: "Aviso: Erro ao criar no Asaas",
              description: asaasData.error || "Cliente atualizado localmente sem integração Asaas.",
            })
          }
        } catch (asaasError) {
          console.warn("Error creating Asaas customer:", asaasError)
        }
      }

      if (skipAsaas) {
        asaasCustomerId = null
      }

      // Normalize website URL
      let website = data.website?.trim() || null
      if (website && !/^https?:\/\//.test(website)) {
        website = `https://${website}`
      }

      // Save locally FIRST
      const { data: updated, error } = await supabase
        .from("clients")
        .update({
          name: data.name,
          email: data.email || null,
          phone: data.phone || null,
          company: data.company || null,
          website,
          cpf_cnpj: data.cpf_cnpj || null,
          status: data.status,
          custom_fields: {
            ...client?.custom_fields,
            asaas_customer_id: asaasCustomerId,
            address: address,
            notes: data.notes || undefined,
            skip_asaas: skipAsaas || (client?.custom_fields as Record<string, unknown>)?.skip_asaas || false,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()

      if (error) throw error

      if (!updated || updated.length === 0) {
        throw new Error("Nenhum registro foi atualizado. Verifique suas permissões.")
      }

      // Sync to Asaas AFTER local save
      let asaasSyncSuccess = false
      let asaasSyncAttempted = false
      if (!skipAsaas && asaasCustomerId && asaasCustomerId !== "000") {
        asaasSyncAttempted = true
        try {
          const asaasUpdateResponse = await fetch("/api/integrations/asaas/customers/update", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId: id }),
          })

          const asaasUpdateData = await asaasUpdateResponse.json()

          if (asaasUpdateData.success) {
            asaasSyncSuccess = true
          } else {
            console.warn("Asaas customer update failed:", asaasUpdateData.error)
            toast({
              variant: "destructive",
              title: "Aviso: Erro ao sincronizar com Asaas",
              description: asaasUpdateData.error
                ? `Erro do Asaas: ${asaasUpdateData.error}`
                : "Cliente atualizado localmente, mas houve erro ao sincronizar com o Asaas.",
            })
          }
        } catch (asaasUpdateError) {
          console.warn("Error updating Asaas customer:", asaasUpdateError)
          toast({
            variant: "destructive",
            title: "Aviso: Erro ao sincronizar com Asaas",
            description: asaasUpdateError instanceof Error
              ? `Erro: ${asaasUpdateError.message}`
              : "Cliente atualizado localmente, mas houve erro ao sincronizar com o Asaas.",
          })
        }
      }

      // Create activity
      await supabase.from("activities").insert({
        client_id: id,
        user_id: user?.id,
        type: "client_updated",
        description: `Cliente "${data.name}" foi atualizado${asaasCustomerId && !data.asaas_customer_id ? ` e vinculado ao Asaas (${asaasCustomerId})` : ""}`,
      })

      toast({
        title: "Cliente atualizado!",
        description: asaasCustomerId && !data.asaas_customer_id
          ? "Cliente atualizado e vinculado ao Asaas com sucesso."
          : asaasSyncAttempted && asaasSyncSuccess
            ? "As informações foram salvas e sincronizadas com o Asaas."
            : "As informações foram salvas com sucesso.",
      })

      router.push(`/admin/clients/${id}`)
      router.refresh()
    } catch (error) {
      console.error("Error updating client:", error)
      toast({
        variant: "destructive",
        title: "Erro ao atualizar cliente",
        description: "Verifique os dados e tente novamente.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  async function handleArchive() {
    setIsArchiving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("clients")
        .update({ status: "inactive", updated_at: new Date().toISOString() })
        .eq("id", id)

      if (error) throw error

      toast({ title: "Cliente arquivado", description: "O cliente foi movido para inativos." })
      router.push(ROUTES.ADMIN.CLIENTS.LIST)
      router.refresh()
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível arquivar o cliente." })
    } finally {
      setIsArchiving(false)
    }
  }

  async function handleDelete() {
    setIsDeleting(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from("clients").delete().eq("id", id)

      if (error) throw error

      toast({ title: "Cliente excluído", description: "O cliente foi removido permanentemente." })
      router.push(ROUTES.ADMIN.CLIENTS.LIST)
      router.refresh()
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível excluir o cliente." })
    } finally {
      setIsDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  // Check if client has all required Asaas fields
  const hasRequiredAsaasFields = () => {
    const name = watch("name")
    const cpfCnpj = watch("cpf_cnpj")
    const email = watch("email")
    const phone = watch("phone")
    return name && cpfCnpj && (email || phone)
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card className="border-[#FECACA] dark:border-[rgba(252,165,165,0.15)]">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Icon icon={AlertCircle} customSize={48} className="text-[#991B1B] dark:text-[#FCA5A5] mb-4" />
            <h3 className="text-lg font-medium text-[#991B1B] dark:text-[#FCA5A5]">Erro</h3>
            <p className="text-sm text-gray-500 dark:text-[#5C6378] text-center mt-1">{error}</p>
            <Button variant="secondary" className="mt-4" asChild>
              <Link href="/admin/clients">Voltar para Clientes</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isFetching) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Editar Cliente"
        breadcrumb={[
          { label: "Clientes", href: ROUTES.ADMIN.CLIENTS.LIST },
          { label: client?.name || "Cliente", href: `/admin/clients/${id}` },
          { label: "Editar" },
        ]}
      />

      <div className="max-w-2xl mx-auto mt-6">
        {/* Asaas Status */}
        {watch("asaas_customer_id") ? (
          <Card className="border-[#A7F3D0] dark:border-[rgba(110,231,183,0.15)] mb-6">
            <CardContent className="flex items-start gap-3 py-4">
              <Icon icon={CheckCircle2} size={20} className="text-[#065F46] dark:text-[#6EE7B7] mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[#065F46] dark:text-[#6EE7B7]">Cliente vinculado ao Asaas</p>
                <p className="text-xs text-gray-500 dark:text-[#5C6378] mt-0.5">
                  ID: <code className="bg-[#ECFDF5] dark:bg-[#052E1C] px-1 rounded text-xs">{watch("asaas_customer_id")}</code>
                </p>
              </div>
            </CardContent>
          </Card>
        ) : !hasRequiredAsaasFields() ? (
          <Card className="border-[#FDE68A] dark:border-[rgba(252,211,77,0.15)] mb-6">
            <CardContent className="flex items-start gap-3 py-4">
              <Icon icon={AlertCircle} size={20} className="text-[#92400E] dark:text-[#FCD34D] mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[#92400E] dark:text-[#FCD34D]">Campos obrigatórios para assinaturas</p>
                <p className="text-xs text-gray-500 dark:text-[#5C6378] mt-0.5">
                  Preencha: <strong>Nome</strong>, <strong>CPF/CNPJ</strong> e <strong>Email ou Telefone</strong>
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-[#C7CDEF] dark:border-[rgba(168,184,240,0.15)] mb-6">
            <CardContent className="flex items-start gap-3 py-4">
              <Icon icon={CheckCircle2} size={20} className="text-[#4E62D8] dark:text-[#7B8CEA] mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[#4E62D8] dark:text-[#7B8CEA]">Pronto para criar no Asaas</p>
                <p className="text-xs text-gray-500 dark:text-[#5C6378] mt-0.5">
                  O cliente será criado automaticamente no Asaas ao salvar.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <form onSubmit={handleSubmit(onSubmit, onValidationError)} className="space-y-6">
          {/* Seção 1: Dados do Cliente */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Dados do Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Nome" required error={errors.name?.message} htmlFor="name">
                  <Input
                    id="name"
                    placeholder="Nome completo do cliente"
                    {...register("name")}
                    disabled={isLoading}
                  />
                </FormField>
                <FormField label="Email" required error={errors.email?.message} htmlFor="email">
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@empresa.com"
                    {...register("email")}
                    disabled={isLoading}
                  />
                </FormField>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Telefone/WhatsApp" error={errors.phone?.message} htmlFor="phone" hint="Pelo menos email ou telefone é obrigatório">
                  <Input
                    id="phone"
                    placeholder="11999999999"
                    {...register("phone")}
                    disabled={isLoading}
                  />
                </FormField>
                <FormField label="CPF/CNPJ" error={errors.cpf_cnpj?.message} htmlFor="cpf_cnpj" hint="Obrigatório para assinaturas via Asaas">
                  <Input
                    id="cpf_cnpj"
                    placeholder="000.000.000-00 ou 00.000.000/0000-00"
                    {...register("cpf_cnpj")}
                    disabled={isLoading}
                  />
                </FormField>
              </div>
              <FormField label="Empresa" htmlFor="company">
                <Input
                  id="company"
                  placeholder="Nome da empresa"
                  {...register("company")}
                  disabled={isLoading}
                />
              </FormField>
              <FormField label="Website" error={errors.website?.message} htmlFor="website">
                <Input
                  id="website"
                  placeholder="https://www.empresa.com"
                  {...register("website")}
                  disabled={isLoading}
                />
              </FormField>
            </CardContent>
          </Card>

          {/* Seção 2: Status e Integração */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Status e Integração</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Status" required>
                  <Select
                    value={watch("status")}
                    onValueChange={(value) => setValue("status", value as ClientForm["status"], { shouldDirty: true })}
                    disabled={isLoading}
                  >
                    <SelectTrigger className="h-9 sm:h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prospect">Prospect</SelectItem>
                      <SelectItem value="onboarding">Em Onboarding</SelectItem>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="inactive">Inativo</SelectItem>
                      <SelectItem value="churned">Churned</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="ID Asaas" htmlFor="asaas_customer_id" hint={watch("asaas_customer_id") ? "Cliente vinculado ao Asaas." : 'Deixe vazio para criar automaticamente. Use "000" para clientes fora do Asaas.'}>
                  <Input
                    id="asaas_customer_id"
                    placeholder={watch("asaas_customer_id") ? "" : "Será gerado automaticamente"}
                    {...register("asaas_customer_id")}
                    disabled={isLoading || !!watch("asaas_customer_id")}
                    className={watch("asaas_customer_id") ? "bg-[#F3F4F6] dark:bg-[#242836]" : ""}
                  />
                </FormField>
              </div>
            </CardContent>
          </Card>

          {/* Seção 3: Endereço (colapsável) */}
          <Card>
            <CardHeader>
              <button type="button" onClick={() => setShowAddress(!showAddress)} className="flex items-center gap-2 w-full focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#4E62D8] dark:focus-visible:shadow-[0_0_0_2px_#7B8CEA] rounded-[4px]">
                <CardTitle className="text-sm font-semibold">Endereço</CardTitle>
                <Badge variant="neutral" showDot={false}>Opcional</Badge>
                <Icon icon={showAddress ? ChevronUp : ChevronDown} size={16} className="ml-auto text-gray-400" />
              </button>
            </CardHeader>
            {showAddress && (
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <FormField label="Rua" htmlFor="address_street">
                      <Input
                        id="address_street"
                        placeholder="Nome da rua"
                        {...register("address_street")}
                        disabled={isLoading}
                      />
                    </FormField>
                  </div>
                  <FormField label="Número" htmlFor="address_number">
                    <Input
                      id="address_number"
                      placeholder="123"
                      {...register("address_number")}
                      disabled={isLoading}
                    />
                  </FormField>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="Complemento" htmlFor="address_complement">
                    <Input
                      id="address_complement"
                      placeholder="Apto, Sala, etc"
                      {...register("address_complement")}
                      disabled={isLoading}
                    />
                  </FormField>
                  <FormField label="Bairro" htmlFor="address_neighborhood">
                    <Input
                      id="address_neighborhood"
                      placeholder="Nome do bairro"
                      {...register("address_neighborhood")}
                      disabled={isLoading}
                    />
                  </FormField>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField label="CEP" htmlFor="address_postal_code">
                    <Input
                      id="address_postal_code"
                      placeholder="00000-000"
                      {...register("address_postal_code")}
                      disabled={isLoading}
                    />
                  </FormField>
                  <FormField label="Cidade" htmlFor="address_city">
                    <Input
                      id="address_city"
                      placeholder="Nome da cidade"
                      {...register("address_city")}
                      disabled={isLoading}
                    />
                  </FormField>
                  <FormField label="Estado">
                    <Select
                      value={watch("address_state") || ""}
                      onValueChange={(value) => setValue("address_state", value, { shouldDirty: true })}
                      disabled={isLoading}
                    >
                      <SelectTrigger className="h-9 sm:h-11">
                        <SelectValue placeholder="UF" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AC">Acre</SelectItem>
                        <SelectItem value="AL">Alagoas</SelectItem>
                        <SelectItem value="AP">Amapá</SelectItem>
                        <SelectItem value="AM">Amazonas</SelectItem>
                        <SelectItem value="BA">Bahia</SelectItem>
                        <SelectItem value="CE">Ceará</SelectItem>
                        <SelectItem value="DF">Distrito Federal</SelectItem>
                        <SelectItem value="ES">Espírito Santo</SelectItem>
                        <SelectItem value="GO">Goiás</SelectItem>
                        <SelectItem value="MA">Maranhão</SelectItem>
                        <SelectItem value="MT">Mato Grosso</SelectItem>
                        <SelectItem value="MS">Mato Grosso do Sul</SelectItem>
                        <SelectItem value="MG">Minas Gerais</SelectItem>
                        <SelectItem value="PA">Pará</SelectItem>
                        <SelectItem value="PB">Paraíba</SelectItem>
                        <SelectItem value="PR">Paraná</SelectItem>
                        <SelectItem value="PE">Pernambuco</SelectItem>
                        <SelectItem value="PI">Piauí</SelectItem>
                        <SelectItem value="RJ">Rio de Janeiro</SelectItem>
                        <SelectItem value="RN">Rio Grande do Norte</SelectItem>
                        <SelectItem value="RS">Rio Grande do Sul</SelectItem>
                        <SelectItem value="RO">Rondônia</SelectItem>
                        <SelectItem value="RR">Roraima</SelectItem>
                        <SelectItem value="SC">Santa Catarina</SelectItem>
                        <SelectItem value="SP">São Paulo</SelectItem>
                        <SelectItem value="SE">Sergipe</SelectItem>
                        <SelectItem value="TO">Tocantins</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Seção 4: Notas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Notas</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Adicione observações sobre o cliente..."
                {...register("notes")}
                disabled={isLoading}
                rows={4}
              />
            </CardContent>
          </Card>

          {/* Zona de Perigo */}
          <Card className="border-[#FECACA] dark:border-[rgba(252,165,165,0.15)]">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-[#991B1B] dark:text-[#FCA5A5]">Zona de Perigo</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={handleArchive}
                disabled={isArchiving || watch("status") === "inactive"}
                className="w-full sm:w-auto"
              >
                {isArchiving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Archive className="h-4 w-4 mr-2" />}
                Arquivar cliente
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
                className="w-full sm:w-auto"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir cliente
              </Button>
            </CardContent>
          </Card>

          {/* SaveBar */}
          <SaveBar
            isSaving={isLoading}
            onSave={handleSubmit(onSubmit, onValidationError)}
            onCancel={() => router.push(`/admin/clients/${id}`)}
            hasChanges={isDirty}
            saveLabel="Salvar alterações"
          />
        </form>

        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Excluir cliente</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja excluir <strong>{client?.name}</strong>? Esta ação não pode ser desfeita e todos os dados associados serão perdidos.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="ghost" onClick={() => setShowDeleteDialog(false)} disabled={isDeleting}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Excluir permanentemente
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
