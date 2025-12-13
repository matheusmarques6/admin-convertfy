"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowLeft, Loader2 } from "lucide-react"
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
import { toast } from "@/lib/hooks/use-toast"

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
    formState: { errors },
  } = useForm<ClientForm>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      status: "prospect",
    },
  })

  async function onSubmit(data: ClientForm) {
    setIsLoading(true)

    try {
      const supabase = createClient()

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()

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

      const { data: newClient, error } = await supabase
        .from("clients")
        .insert({
          name: data.name,
          email: data.email || null,
          phone: data.phone || null,
          company: data.company || null,
          website: data.website || null,
          cpf_cnpj: data.cpf_cnpj || null,
          asaas_customer_id: data.asaas_customer_id || null,
          status: data.status,
          address: address,
          owner_id: null, // Set to null to avoid foreign key constraint
          custom_fields: {},
          tags: [],
          health_score: 100,
        })
        .select()
        .single()

      if (error) throw error

      // Create activity
      await supabase.from("activities").insert({
        client_id: newClient.id,
        user_id: user?.id,
        type: "client_created",
        description: `Cliente "${data.name}" foi criado`,
      })

      toast({
        title: "Cliente criado!",
        description: "O cliente foi criado com sucesso.",
      })

      router.push(`/clients/${newClient.id}`)
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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/clients">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Novo Cliente</h1>
          <p className="text-muted-foreground">
            Cadastre um novo cliente na sua carteira
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Informações Básicas</CardTitle>
            <CardDescription>
              Dados principais do cliente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                placeholder="Nome do cliente ou responsável"
                {...register("name")}
                disabled={isLoading}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

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

            {/* CPF/CNPJ */}
            <div className="space-y-2">
              <Label htmlFor="cpf_cnpj">CPF/CNPJ</Label>
              <Input
                id="cpf_cnpj"
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                {...register("cpf_cnpj")}
                disabled={isLoading}
              />
            </div>

            {/* Email and Phone */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
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
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  placeholder="(11) 99999-9999"
                  {...register("phone")}
                  disabled={isLoading}
                />
              </div>
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
        <Card>
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
        <Card>
          <CardHeader>
            <CardTitle>Integração Asaas</CardTitle>
            <CardDescription>
              Vincule este cliente a um cadastro no Asaas para cobranças automáticas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="asaas_customer_id">ID do Cliente no Asaas</Label>
              <Input
                id="asaas_customer_id"
                placeholder="cus_xxxxxxxxxxxxxx"
                {...register("asaas_customer_id")}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Se deixar vazio, você pode vincular depois ou criar cobranças manuais
              </p>
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
            <Link href="/clients">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar Cliente
          </Button>
        </div>
      </form>
    </div>
  )
}
