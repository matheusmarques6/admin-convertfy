"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowLeft, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/lib/hooks/use-toast"
import { use } from "react"

const clientSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().min(10, "Telefone deve ter pelo menos 10 dígitos").optional().or(z.literal("")),
  company: z.string().optional(),
  website: z.string().url("URL inválida").optional().or(z.literal("")),
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
        setValue("cpf_cnpj", data.cpf_cnpj || "")
        setValue("asaas_customer_id", data.asaas_customer_id || "")
        setValue("status", data.status || "prospect")

        // Address
        if (data.address) {
          setValue("address_street", data.address.street || "")
          setValue("address_number", data.address.number || "")
          setValue("address_complement", data.address.complement || "")
          setValue("address_neighborhood", data.address.neighborhood || "")
          setValue("address_postal_code", data.address.postal_code || "")
          setValue("address_city", data.address.city || "")
          setValue("address_state", data.address.state || "")
        }

        // Notes from custom_fields
        if (data.custom_fields?.notes) {
          setValue("notes", data.custom_fields.notes as string)
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

      // If no Asaas ID and we have all required fields, create customer in Asaas
      if (!asaasCustomerId && data.name && data.cpf_cnpj && (data.email || data.phone)) {
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
          // Continue updating local client even if Asaas fails
        }
      }

      const { error } = await supabase
        .from("clients")
        .update({
          name: data.name,
          email: data.email || null,
          phone: data.phone || null,
          company: data.company || null,
          website: data.website || null,
          cpf_cnpj: data.cpf_cnpj || null,
          asaas_customer_id: asaasCustomerId,
          status: data.status,
          address: address,
          custom_fields: {
            ...client?.custom_fields,
            notes: data.notes || undefined,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)

      if (error) throw error

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
          : "As informações foram salvas com sucesso.",
      })

      router.push(`/clients/${id}`)
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
      <div className="max-w-3xl mx-auto space-y-6">
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h3 className="text-lg font-medium text-destructive">Erro</h3>
            <p className="text-muted-foreground text-center mt-1">{error}</p>
            <Button variant="outline" className="mt-4" asChild>
              <Link href="/clients">Voltar para Clientes</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isFetching) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
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
            <Skeleton className="h-4 w-64" />
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
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/clients/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Editar Cliente</h1>
          <p className="text-muted-foreground">
            Atualize as informações de {client?.name}
          </p>
        </div>
      </div>

      {/* Asaas Status */}
      {watch("asaas_customer_id") ? (
        <Card className="border-emerald-500/50 bg-emerald-500/10">
          <CardContent className="flex items-start gap-3 py-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5" />
            <div>
              <p className="font-medium text-emerald-600">Cliente vinculado ao Asaas</p>
              <p className="text-sm text-muted-foreground">
                ID: <code className="bg-emerald-500/20 px-1 rounded">{watch("asaas_customer_id")}</code>
              </p>
            </div>
          </CardContent>
        </Card>
      ) : !hasRequiredAsaasFields() ? (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
            <div>
              <p className="font-medium text-amber-600">Campos obrigatórios para cobranças</p>
              <p className="text-sm text-muted-foreground">
                Para criar o cliente no Asaas automaticamente, preencha: <strong>Nome</strong>, <strong>CPF/CNPJ</strong> e <strong>Email ou Telefone</strong>
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-blue-500/50 bg-blue-500/10">
          <CardContent className="flex items-start gap-3 py-4">
            <CheckCircle2 className="h-5 w-5 text-blue-500 mt-0.5" />
            <div>
              <p className="font-medium text-blue-600">Pronto para criar no Asaas</p>
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
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Dados Obrigatórios
              <span className="text-xs font-normal text-muted-foreground">(para cobranças)</span>
            </CardTitle>
            <CardDescription>
              Estes campos são necessários para gerar cobranças no Asaas
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
              {errors.cpf_cnpj && (
                <p className="text-sm text-destructive">{errors.cpf_cnpj.message}</p>
              )}
              <p className="text-xs text-muted-foreground">Obrigatório para cobranças via Asaas</p>
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
                {errors.phone && (
                  <p className="text-sm text-destructive">{errors.phone.message}</p>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">* Pelo menos email ou telefone é obrigatório para cobranças</p>
          </CardContent>
        </Card>

        {/* Basic Info */}
        <Card>
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
                value={watch("status")}
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
        <Card>
          <CardHeader>
            <CardTitle>Endereço</CardTitle>
            <CardDescription>
              Necessário para cobranças via boleto
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
                  value={watch("address_state") || ""}
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
        <Card>
          <CardHeader>
            <CardTitle>Integração Asaas</CardTitle>
            <CardDescription>
              {watch("asaas_customer_id")
                ? "Cliente já vinculado ao Asaas"
                : "O cliente será criado automaticamente no Asaas ao salvar (se os campos obrigatórios estiverem preenchidos)"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="asaas_customer_id">ID do Cliente no Asaas</Label>
              <Input
                id="asaas_customer_id"
                placeholder={watch("asaas_customer_id") ? "" : "Será gerado automaticamente"}
                {...register("asaas_customer_id")}
                disabled={isLoading || !!watch("asaas_customer_id")}
                className={watch("asaas_customer_id") ? "bg-muted" : ""}
              />
              {watch("asaas_customer_id") ? (
                <p className="text-xs text-emerald-600">
                  Cliente vinculado ao Asaas. ID não pode ser alterado.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Deixe vazio para criar automaticamente ao salvar.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
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
          <Button type="button" variant="outline" asChild disabled={isLoading}>
            <Link href={`/clients/${id}`}>Cancelar</Link>
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Alterações
          </Button>
        </div>
      </form>
    </div>
  )
}
