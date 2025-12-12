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
  status: z.enum(["active", "inactive", "prospect", "onboarding", "churned"]),
  notes: z.string().optional(),
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

      const { data: newClient, error } = await supabase
        .from("clients")
        .insert({
          name: data.name,
          email: data.email || null,
          phone: data.phone || null,
          company: data.company || null,
          website: data.website || null,
          status: data.status,
          owner_id: user?.id,
          custom_fields: {},
          tags: [],
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
        description: "Tente novamente mais tarde.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
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
      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Informações do Cliente</CardTitle>
            <CardDescription>
              Preencha os dados básicos do cliente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                placeholder="Nome do cliente ou empresa"
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

            {/* Actions */}
            <div className="flex justify-end gap-4 pt-4">
              <Button type="button" variant="outline" asChild disabled={isLoading}>
                <Link href="/clients">Cancelar</Link>
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar Cliente
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
