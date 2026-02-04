"use client"

import { useEffect, useState } from "react"
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
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/lib/hooks/use-toast"
import { Skeleton } from "@/components/ui/skeleton"

interface ClientOption {
  id: string
  name: string
  company?: string | null
}

const reportSchema = z.object({
  client_id: z.string().min(1, "Selecione um cliente"),
  month: z.string().min(1, "Selecione o mês"),
  revenue: z.number().min(0, "Receita deve ser positiva").optional(),
  orders: z.number().min(0, "Pedidos deve ser positivo").optional(),
  conversion_rate: z.number().min(0).max(100).optional(),
  ad_spend: z.number().min(0, "Investimento deve ser positivo").optional(),
  roas: z.number().min(0, "ROAS deve ser positivo").optional(),
  email_revenue: z.number().min(0, "Receita de e-mail deve ser positiva").optional(),
  notes: z.string().optional(),
})

type ReportForm = z.infer<typeof reportSchema>

export default function NewReportPage() {
  const router = useRouter()
  const [clients, setClients] = useState<ClientOption[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isFetchingClients, setIsFetchingClients] = useState(true)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ReportForm>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      month: new Date().toISOString().slice(0, 7), // YYYY-MM format
    },
  })

  const selectedClientId = watch("client_id")

  useEffect(() => {
    async function fetchClients() {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("clients")
          .select("id, name, company")
          .eq("status", "active")
          .order("name")

        if (error) throw error
        setClients(data || [])
      } catch {
        toast({
          variant: "destructive",
          title: "Erro ao carregar clientes",
          description: "Tente novamente mais tarde.",
        })
      } finally {
        setIsFetchingClients(false)
      }
    }

    fetchClients()
  }, [])

  async function onSubmit(data: ReportForm) {
    setIsLoading(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      const metrics = {
        revenue: data.revenue || 0,
        orders: data.orders || 0,
        conversion_rate: data.conversion_rate || 0,
        ad_spend: data.ad_spend || 0,
        roas: data.roas || 0,
        email_revenue: data.email_revenue || 0,
      }

      const { error } = await supabase
        .from("reports")
        .insert({
          client_id: data.client_id,
          user_id: user?.id,
          month: data.month,
          metrics,
          notes: data.notes || null,
        })

      if (error) throw error

      toast({
        title: "Relatório criado!",
        description: "O relatório foi criado com sucesso.",
      })

      router.push("/reports")
      router.refresh()
    } catch {
      toast({
        variant: "destructive",
        title: "Erro ao criar relatório",
        description: "Tente novamente mais tarde.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (isFetchingClients) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-60" />
          </CardHeader>
          <CardContent className="space-y-6">
            {[1, 2, 3, 4].map((i) => (
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
          <Link href="/reports">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Novo Relatório</h1>
          <p className="text-muted-foreground">
            Crie um relatório mensal para um cliente
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Informações do Relatório</CardTitle>
            <CardDescription>
              Preencha os dados do relatório mensal
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Client and Month */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="client_id">Cliente *</Label>
                <Select
                  value={selectedClientId}
                  onValueChange={(value) => setValue("client_id", value)}
                  disabled={isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                        {client.company && ` (${client.company})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.client_id && (
                  <p className="text-sm text-destructive">{errors.client_id.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="month">Mês *</Label>
                <Input
                  id="month"
                  type="month"
                  {...register("month")}
                  disabled={isLoading}
                />
                {errors.month && (
                  <p className="text-sm text-destructive">{errors.month.message}</p>
                )}
              </div>
            </div>

            {/* Metrics */}
            <div className="space-y-4">
              <h3 className="font-medium">Métricas</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="revenue">Receita (R$)</Label>
                  <Input
                    id="revenue"
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    {...register("revenue", { valueAsNumber: true })}
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orders">Pedidos</Label>
                  <Input
                    id="orders"
                    type="number"
                    placeholder="0"
                    {...register("orders", { valueAsNumber: true })}
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="conversion_rate">Taxa de Conversão (%)</Label>
                  <Input
                    id="conversion_rate"
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    {...register("conversion_rate", { valueAsNumber: true })}
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ad_spend">Investimento em Ads (R$)</Label>
                  <Input
                    id="ad_spend"
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    {...register("ad_spend", { valueAsNumber: true })}
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="roas">ROAS</Label>
                  <Input
                    id="roas"
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    {...register("roas", { valueAsNumber: true })}
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email_revenue">Receita de E-mail (R$)</Label>
                  <Input
                    id="email_revenue"
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    {...register("email_revenue", { valueAsNumber: true })}
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                placeholder="Notas sobre o período, insights, recomendações..."
                rows={4}
                {...register("notes")}
                disabled={isLoading}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-4 pt-4">
              <Button type="button" variant="outline" asChild disabled={isLoading}>
                <Link href="/reports">Cancelar</Link>
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar Relatório
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
