"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AlertCircle, CheckCircle2, ChevronUp, ChevronDown } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PageHeader } from "@/components/ui/page-header"
import { FormField } from "@/components/ui/form-field"
import { SaveBar } from "@/components/ui/save-bar"
import { toast } from "@/lib/hooks/use-toast"
import { ROUTES } from "@/lib/routes"

const clientSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  company: z.string().optional(),
  website: z.string().url("URL inválida").optional().or(z.literal("")),
  cpf_cnpj: z.string().optional(),
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

export default function NewClientPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [showAddress, setShowAddress] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ClientForm>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      status: "prospect",
    },
  })

  // Check if client has all required Asaas fields
  const hasRequiredAsaasFields = () => {
    const name = watch("name")
    const cpfCnpj = watch("cpf_cnpj")
    const email = watch("email")
    const phone = watch("phone")
    return name && cpfCnpj && (email || phone)
  }

  async function onSubmit(data: ClientForm) {
    setIsLoading(true)

    try {
      const supabase = createClient()

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Usuário não autenticado")

      // Get org_id from org_members
      const { data: members } = await supabase
        .from("org_members")
        .select("org_id, role")
        .eq("profile_id", user.id)
        .eq("is_active", true)

      const member = members?.sort((a, b) =>
        a.role === "owner" ? -1 : b.role === "owner" ? 1 : 0
      )[0] ?? null

      if (!member?.org_id) throw new Error("Organização não encontrada")

      // Build address object if any address field is provided
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

      // If "000" is used, skip Asaas creation (for international clients or clients outside Asaas)
      const skipAsaas = data.asaas_customer_id === "000"

      // If we have all required fields and not skipping, create customer in Asaas
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
              description: asaasData.error || "Cliente será criado localmente sem integração Asaas.",
            })
          }
        } catch (asaasError) {
          console.warn("Error creating Asaas customer:", asaasError)
        }
      }

      // If "000" was used, set to null for local storage
      if (skipAsaas) {
        asaasCustomerId = null
      }

      const { data: newClient, error } = await supabase
        .from("clients")
        .insert({
          name: data.name,
          email: data.email || null,
          phone: data.phone || null,
          company: data.company || null,
          website: data.website || null,
          status: data.status,
          owner_id: null,
          custom_fields: {
            cpf_cnpj: data.cpf_cnpj || null,
            asaas_customer_id: asaasCustomerId,
            address: address,
            skip_asaas: skipAsaas || false,
          },
          tags: [],
          health_score: 100,
          org_id: member.org_id,
        })
        .select()
        .single()

      if (error) throw error

      // Create activity
      await supabase.from("activities").insert({
        client_id: newClient.id,
        user_id: user?.id,
        type: "client_created",
        description: `Cliente "${data.name}" foi criado${asaasCustomerId ? ` (Asaas: ${asaasCustomerId})` : ""}`,
      })

      toast({
        title: "Cliente criado!",
        description: asaasCustomerId
          ? "Cliente criado e vinculado ao Asaas com sucesso."
          : "Cliente criado com sucesso. Preencha CPF/CNPJ e email/telefone para criar assinaturas.",
      })

      router.push(`/admin/clients/${newClient.id}`)
      router.refresh()
    } catch (error) {
      console.error("Error creating client:", error)
      toast({
        variant: "destructive",
        title: "Erro ao criar cliente",
        description: "Verifique os dados e tente novamente.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Novo Cliente"
        breadcrumb={[
          { label: "Clientes", href: ROUTES.ADMIN.CLIENTS.LIST },
          { label: "Novo Cliente" },
        ]}
      />

      <div className="max-w-2xl mx-auto mt-6">
        {/* Asaas Fields Warning */}
        {!hasRequiredAsaasFields() && (
          <Card className="border-[#FDE68A] dark:border-[rgba(252,211,77,0.15)] mb-6">
            <CardContent className="flex items-start gap-3 py-4">
              <Icon icon={AlertCircle} size={20} className="text-[#92400E] dark:text-[#FCD34D] mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[#92400E] dark:text-[#FCD34D]">Campos obrigatórios para assinaturas automáticas</p>
                <p className="text-xs text-gray-500 dark:text-[#5C6378] mt-0.5">
                  Para criar o cliente no Asaas automaticamente, preencha: <strong>Nome</strong>, <strong>CPF/CNPJ</strong> e <strong>Email ou Telefone</strong>
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {hasRequiredAsaasFields() && (
          <Card className="border-[#A7F3D0] dark:border-[rgba(110,231,183,0.15)] mb-6">
            <CardContent className="flex items-start gap-3 py-4">
              <Icon icon={CheckCircle2} size={20} className="text-[#065F46] dark:text-[#6EE7B7] mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[#065F46] dark:text-[#6EE7B7]">Pronto para integração Asaas</p>
                <p className="text-xs text-gray-500 dark:text-[#5C6378] mt-0.5">
                  O cliente será criado automaticamente no Asaas ao salvar.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
                    placeholder="Nome da empresa"
                    {...register("name")}
                    disabled={isLoading}
                  />
                </FormField>
                <FormField label="Email" required error={errors.email?.message} htmlFor="email">
                  <Input
                    id="email"
                    type="email"
                    placeholder="contato@empresa.com"
                    {...register("email")}
                    disabled={isLoading}
                  />
                </FormField>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Telefone/WhatsApp" htmlFor="phone" hint="Pelo menos email ou telefone é obrigatório">
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(XX) XXXXX-XXXX"
                    {...register("phone")}
                    disabled={isLoading}
                  />
                </FormField>
                <FormField label="CPF/CNPJ" htmlFor="cpf_cnpj" hint="Obrigatório para criar cliente no Asaas">
                  <Input
                    id="cpf_cnpj"
                    placeholder="00.000.000/0001-00"
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
                  type="url"
                  placeholder="https://empresa.com.br"
                  {...register("website")}
                  disabled={isLoading}
                />
              </FormField>
            </CardContent>
          </Card>

          {/* Seção 2: Plano e Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Status e Integração</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Status" required>
                  <Select
                    defaultValue="prospect"
                    onValueChange={(value) => setValue("status", value as ClientForm["status"])}
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
                <FormField label="ID Asaas" htmlFor="asaas_customer_id" hint='Deixe vazio para criar automaticamente. Use "000" para clientes fora do Asaas.'>
                  <Input
                    id="asaas_customer_id"
                    placeholder="cus_xxxxxxxxxxxxxx"
                    {...register("asaas_customer_id")}
                    disabled={isLoading}
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
                      placeholder="Cidade"
                      {...register("address_city")}
                      disabled={isLoading}
                    />
                  </FormField>
                  <FormField label="Estado">
                    <Select
                      onValueChange={(value) => setValue("address_state", value)}
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
                placeholder="Observações sobre o cliente..."
                {...register("notes")}
                disabled={isLoading}
                rows={4}
              />
            </CardContent>
          </Card>

          {/* SaveBar */}
          <SaveBar
            isSaving={isLoading}
            onSave={handleSubmit(onSubmit)}
            onCancel={() => router.back()}
            hasChanges={true}
            saveLabel="Criar Cliente"
            savingLabel="Criando..."
          />
        </form>
      </div>
    </div>
  )
}
