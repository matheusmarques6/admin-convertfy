"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PageHeader } from "@/components/ui/page-header"
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
      // Mirror current_org_id() SQL: prefer org where user is owner
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
          // Continue creating local client even if Asaas fails
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
          owner_id: null, // Set to null to avoid foreign key constraint
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
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        title="Novo Cliente"
        description="Cadastre um novo cliente na sua carteira"
        breadcrumb={[
          { label: "Clientes", href: ROUTES.ADMIN.CLIENTS.LIST },
          { label: "Novo Cliente" },
        ]}
      />

      {/* Asaas Fields Warning */}
      {!hasRequiredAsaasFields() && (
        <Card className="border-warning/50 bg-warning/10">
          <CardContent className="flex items-start gap-3 py-4">
            <Icon icon={AlertCircle} size={20} className="text-warning mt-0.5" />
            <div>
              <p className="font-medium text-warning">Campos obrigatórios para assinaturas automáticas</p>
              <p className="text-sm text-muted-foreground">
                Para criar o cliente no Asaas automaticamente, preencha: <strong>Nome</strong>, <strong>CPF/CNPJ</strong> e <strong>Email ou Telefone</strong>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {hasRequiredAsaasFields() && (
        <Card className="border-success/50 bg-success/10">
          <CardContent className="flex items-start gap-3 py-4">
            <Icon icon={CheckCircle2} size={20} className="text-success mt-0.5" />
            <div>
              <p className="font-medium text-success">Pronto para integração Asaas</p>
              <p className="text-sm text-muted-foreground">
                O cliente será criado automaticamente no Asaas ao salvar.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Required Fields for Asaas */}
        <Card className="rounded-xl border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Dados Obrigatórios
              <span className="text-xs font-normal text-muted-foreground">(para assinaturas)</span>
            </CardTitle>
            <CardDescription>
              Estes campos são necessários para criar o cliente no Asaas e gerar assinaturas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Nome Completo *</Label>
              <Input
                id="name"
                placeholder="Nome completo do cliente"
                {...register("name")}
                disabled={isLoading}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            {/* CPF/CNPJ */}
            <div className="space-y-2">
              <Label htmlFor="cpf_cnpj">CPF/CNPJ *</Label>
              <Input
                id="cpf_cnpj"
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                {...register("cpf_cnpj")}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">Obrigatório para criar cliente no Asaas</p>
            </div>

            {/* Email and Phone */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@empresa.com"
                  {...register("email")}
                  disabled={isLoading}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone/WhatsApp *</Label>
                <Input
                  id="phone"
                  placeholder="11999999999"
                  {...register("phone")}
                  disabled={isLoading}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">* Pelo menos email ou telefone é obrigatório</p>
          </CardContent>
        </Card>

        {/* Additional Info */}
        <Card className="rounded-xl border bg-card">
          <CardHeader>
            <CardTitle>Informações Adicionais</CardTitle>
            <CardDescription>
              Dados complementares do cliente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Company */}
            <div className="space-y-2">
              <Label htmlFor="company">Empresa</Label>
              <Input
                id="company"
                placeholder="Nome da empresa"
                {...register("company")}
                disabled={isLoading}
              />
            </div>

            {/* Website */}
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                placeholder="https://www.empresa.com"
                {...register("website")}
                disabled={isLoading}
              />
              {errors.website && (
                <p className="text-sm text-destructive">{errors.website.message}</p>
              )}
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                defaultValue="prospect"
                onValueChange={(value) => setValue("status", value as ClientForm["status"])}
                disabled={isLoading}
              >
                <SelectTrigger>
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
            </div>
          </CardContent>
        </Card>

        {/* Address */}
        <Card className="rounded-xl border bg-card">
          <CardHeader>
            <CardTitle>Endereço</CardTitle>
            <CardDescription>
              Informações de endereço do cliente (opcional)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address_street">Rua</Label>
                <Input
                  id="address_street"
                  placeholder="Nome da rua"
                  {...register("address_street")}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address_number">Número</Label>
                <Input
                  id="address_number"
                  placeholder="123"
                  {...register("address_number")}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="address_complement">Complemento</Label>
                <Input
                  id="address_complement"
                  placeholder="Apto, Sala, etc"
                  {...register("address_complement")}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address_neighborhood">Bairro</Label>
                <Input
                  id="address_neighborhood"
                  placeholder="Nome do bairro"
                  {...register("address_neighborhood")}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="address_postal_code">CEP</Label>
                <Input
                  id="address_postal_code"
                  placeholder="00000-000"
                  {...register("address_postal_code")}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address_city">Cidade</Label>
                <Input
                  id="address_city"
                  placeholder="Nome da cidade"
                  {...register("address_city")}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address_state">Estado</Label>
                <Select
                  onValueChange={(value) => setValue("address_state", value)}
                  disabled={isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
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
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Integration */}
        <Card className="rounded-xl border bg-card">
          <CardHeader>
            <CardTitle>Integração Asaas</CardTitle>
            <CardDescription>
              O cliente será criado automaticamente no Asaas se os campos obrigatórios estiverem preenchidos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="asaas_customer_id">ID do Cliente no Asaas (opcional)</Label>
              <Input
                id="asaas_customer_id"
                placeholder="cus_xxxxxxxxxxxxxx"
                {...register("asaas_customer_id")}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Deixe vazio para criar automaticamente. Use &quot;000&quot; para clientes internacionais/fora do Asaas.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card className="rounded-xl border bg-card">
          <CardHeader>
            <CardTitle>Observações</CardTitle>
            <CardDescription>
              Notas internas sobre o cliente
            </CardDescription>
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

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button type="button" variant="secondary" asChild disabled={isLoading}>
            <Link href="/admin/clients">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Icon icon={Loader2} size={16} className="mr-2 animate-spin" />}
            Criar Cliente
          </Button>
        </div>
      </form>
    </div>
  )
}
