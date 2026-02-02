"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowLeft, Loader2, Building } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/lib/hooks/use-toast"

const companySchema = z.object({
  company_name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  company_email: z.string().email("Email inválido").optional().or(z.literal("")),
  company_phone: z.string().optional(),
  company_website: z.string().url("URL inválida").optional().or(z.literal("")),
  company_address: z.string().optional(),
  company_cnpj: z.string().optional(),
})

type CompanyForm = z.infer<typeof companySchema>

export default function CompanySettingsPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(true)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CompanyForm>({
    resolver: zodResolver(companySchema),
  })

  useEffect(() => {
    async function fetchSettings() {
      try {
        const supabase = createClient()

        const { data, error } = await supabase
          .from("settings")
          .select("key, value")
          .in("key", [
            "company_name",
            "company_email",
            "company_phone",
            "company_website",
            "company_address",
            "company_cnpj",
          ])

        if (error) throw error

        const settings: Record<string, string> = {}
        data?.forEach((item) => {
          settings[item.key] = item.value as string
        })

        reset({
          company_name: settings.company_name || "",
          company_email: settings.company_email || "",
          company_phone: settings.company_phone || "",
          company_website: settings.company_website || "",
          company_address: settings.company_address || "",
          company_cnpj: settings.company_cnpj || "",
        })
      } catch (error) {
        console.error("Error fetching settings:", error)
      } finally {
        setIsFetching(false)
      }
    }

    fetchSettings()
  }, [reset])

  async function onSubmit(data: CompanyForm) {
    setIsLoading(true)

    try {
      const supabase = createClient()

      // Upsert each setting
      const settings = Object.entries(data).filter(([_, value]) => value !== undefined)

      for (const [key, value] of settings) {
        const { error } = await supabase
          .from("settings")
          .upsert({
            key,
            value: value || "",
            updated_at: new Date().toISOString(),
          }, {
            onConflict: "key",
          })

        if (error) throw error
      }

      toast({
        title: "Configurações salvas!",
        description: "As informações da empresa foram atualizadas.",
      })

      router.refresh()
    } catch (error) {
      console.error("Error saving settings:", error)
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: "Tente novamente mais tarde.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (isFetching) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent className="space-y-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Empresa</h1>
          <p className="text-muted-foreground">
            Configure as informações da sua empresa
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Dados da Empresa
            </CardTitle>
            <CardDescription>
              Informações que aparecerão em relatórios e documentos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Company Name */}
            <div className="space-y-2">
              <Label htmlFor="company_name">Nome da Empresa *</Label>
              <Input
                id="company_name"
                placeholder="Convertfy"
                {...register("company_name")}
                disabled={isLoading}
              />
              {errors.company_name && (
                <p className="text-sm text-destructive">{errors.company_name.message}</p>
              )}
            </div>

            {/* CNPJ */}
            <div className="space-y-2">
              <Label htmlFor="company_cnpj">CNPJ</Label>
              <Input
                id="company_cnpj"
                placeholder="00.000.000/0000-00"
                {...register("company_cnpj")}
                disabled={isLoading}
              />
            </div>

            {/* Email and Phone */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="company_email">Email</Label>
                <Input
                  id="company_email"
                  type="email"
                  placeholder="contato@empresa.com"
                  {...register("company_email")}
                  disabled={isLoading}
                />
                {errors.company_email && (
                  <p className="text-sm text-destructive">{errors.company_email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_phone">Telefone</Label>
                <Input
                  id="company_phone"
                  placeholder="(11) 99999-9999"
                  {...register("company_phone")}
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Website */}
            <div className="space-y-2">
              <Label htmlFor="company_website">Website</Label>
              <Input
                id="company_website"
                placeholder="https://www.empresa.com"
                {...register("company_website")}
                disabled={isLoading}
              />
              {errors.company_website && (
                <p className="text-sm text-destructive">{errors.company_website.message}</p>
              )}
            </div>

            {/* Address */}
            <div className="space-y-2">
              <Label htmlFor="company_address">Endereço</Label>
              <Textarea
                id="company_address"
                placeholder="Rua, número, bairro, cidade - estado"
                rows={2}
                {...register("company_address")}
                disabled={isLoading}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-4 pt-4">
              <Button type="button" variant="outline" asChild disabled={isLoading}>
                <Link href="/settings">Cancelar</Link>
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Alterações
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
