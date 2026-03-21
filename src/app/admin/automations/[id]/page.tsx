"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Zap, Plus, Trash2 } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/lib/hooks/use-toast"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/ui/page-header"
import { ROUTES } from "@/lib/routes"
import type { Automation, AutomationTriggerType, AutomationActionType, AutomationAction } from "@/types"

const triggerOptions: { value: AutomationTriggerType; label: string }[] = [
  { value: "new_client", label: "Novo cliente cadastrado" },
  { value: "client_status_changed", label: "Status do cliente alterado" },
  { value: "payment_confirmed", label: "Pagamento confirmado" },
  { value: "payment_overdue", label: "Pagamento em atraso" },
  { value: "meeting_overdue", label: "Reunião atrasada" },
  { value: "meeting_upcoming", label: "Reunião se aproximando" },
  { value: "report_overdue", label: "Relatório atrasado" },
  { value: "contract_expiring", label: "Contrato vencendo" },
  { value: "revenue_dropped", label: "Faturamento caiu" },
  { value: "deal_moved", label: "Deal movido" },
  { value: "deal_created", label: "Deal criado" },
  { value: "deal_won", label: "Deal ganho" },
  { value: "deal_lost", label: "Deal perdido" },
  { value: "scheduled_date", label: "Data específica" },
]

const actionOptions: { value: AutomationActionType; label: string }[] = [
  { value: "send_email", label: "Enviar email" },
  { value: "send_whatsapp", label: "Enviar WhatsApp" },
  { value: "send_sms", label: "Enviar SMS" },
  { value: "create_task", label: "Criar tarefa" },
  { value: "send_notification", label: "Enviar notificação" },
  { value: "update_field", label: "Atualizar campo" },
  { value: "update_status", label: "Atualizar status" },
  { value: "add_tag", label: "Adicionar tag" },
  { value: "remove_tag", label: "Remover tag" },
  { value: "create_invoice", label: "Criar fatura" },
  { value: "schedule_meeting", label: "Agendar reunião" },
  { value: "webhook", label: "Webhook" },
]

const automationSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  description: z.string().optional(),
  is_active: z.boolean(),
  trigger_type: z.string().min(1, "Selecione um gatilho"),
})

type AutomationForm = z.infer<typeof automationSchema>

interface ActionItem {
  id: string
  type: AutomationActionType
  delay_minutes: number
  order: number
}

export default function EditAutomationPage() {
  const router = useRouter()
  const params = useParams()
  const automationId = params.id as string

  const [automation, setAutomation] = useState<Automation | null>(null)
  const [actions, setActions] = useState<ActionItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(true)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<AutomationForm>({
    resolver: zodResolver(automationSchema),
  })

  const isActive = watch("is_active")

  useEffect(() => {
    async function fetchAutomation() {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("automations")
          .select("*")
          .eq("id", automationId)
          .single()

        if (error) throw error

        setAutomation(data)

        // Parse actions from the automation data
        const automationActions = (data.actions as AutomationAction[]) || []
        setActions(
          automationActions.map((action, index) => ({
            id: action.id || `action-${index}`,
            type: action.type,
            delay_minutes: action.delay_minutes || 0,
            order: action.order || index,
          }))
        )

        reset({
          name: data.name,
          description: data.description || "",
          is_active: data.is_active,
          trigger_type: data.trigger?.type || "",
        })
      } catch (error) {
        console.error("Error fetching automation:", error)
        toast({
          variant: "destructive",
          title: "Erro ao carregar automação",
          description: "A automação não foi encontrada.",
        })
        router.push("/admin/automations")
      } finally {
        setIsFetching(false)
      }
    }

    fetchAutomation()
  }, [automationId, reset, router])

  function addAction() {
    const newAction: ActionItem = {
      id: `action-${Date.now()}`,
      type: "send_notification",
      delay_minutes: 0,
      order: actions.length,
    }
    setActions([...actions, newAction])
  }

  function removeAction(id: string) {
    setActions(actions.filter((a) => a.id !== id))
  }

  function updateAction(id: string, field: keyof ActionItem, value: unknown) {
    setActions(
      actions.map((a) => (a.id === id ? { ...a, [field]: value } : a))
    )
  }

  async function onSubmit(data: AutomationForm) {
    setIsLoading(true)

    try {
      const supabase = createClient()

      const formattedActions = actions.map((action, index) => ({
        id: action.id,
        type: action.type,
        config: {},
        delay_minutes: action.delay_minutes,
        order: index,
      }))

      const { error } = await supabase
        .from("automations")
        .update({
          name: data.name,
          description: data.description || null,
          is_active: data.is_active,
          trigger: {
            type: data.trigger_type,
            config: automation?.trigger?.config || {},
          },
          actions: formattedActions,
          conditions: automation?.conditions || [],
          updated_at: new Date().toISOString(),
        })
        .eq("id", automationId)

      if (error) throw error

      toast({
        title: "Automação atualizada!",
        description: "As alterações foram salvas com sucesso.",
      })

      router.push("/admin/automations")
      router.refresh()
    } catch (error) {
      console.error("Error updating automation:", error)
      toast({
        variant: "destructive",
        title: "Erro ao atualizar automação",
        description: "Tente novamente mais tarde.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (isFetching) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
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
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        title="Editar Automação"
        description="Configure os detalhes da automação"
        breadcrumb={[
          { label: "Automações", href: ROUTES.ADMIN.AUTOMATIONS.LIST },
          { label: automation?.name || "Automação" },
        ]}
        actions={
          <Badge variant={isActive ? "default" : "secondary"}>
            {isActive ? "Ativa" : "Pausada"}
          </Badge>
        }
      />

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Info */}
        <Card className="rounded-xl border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon icon={Zap} size={20} />
              Informações Básicas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Automação *</Label>
              <Input
                id="name"
                placeholder="Ex: Boas-vindas para novos clientes"
                {...register("name")}
                disabled={isLoading}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                placeholder="Descreva o que essa automação faz..."
                rows={3}
                {...register("description")}
                disabled={isLoading}
              />
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div>
                <p className="font-medium">Status da Automação</p>
                <p className="text-sm text-muted-foreground">
                  {isActive
                    ? "A automação está ativa e executando"
                    : "A automação está pausada"}
                </p>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={(value) => setValue("is_active", value)}
                disabled={isLoading}
              />
            </div>
          </CardContent>
        </Card>

        {/* Trigger */}
        <Card className="rounded-xl border bg-card">
          <CardHeader>
            <CardTitle>Gatilho</CardTitle>
            <CardDescription>
              Defina quando a automação deve ser acionada
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="trigger_type">Quando isso acontecer *</Label>
              <Select
                value={watch("trigger_type")}
                onValueChange={(value) => setValue("trigger_type", value)}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um gatilho" />
                </SelectTrigger>
                <SelectContent>
                  {triggerOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.trigger_type && (
                <p className="text-sm text-destructive">{errors.trigger_type.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <Card className="rounded-xl border bg-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Ações</CardTitle>
                <CardDescription>
                  Defina as ações que serão executadas
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addAction}
                disabled={isLoading}
              >
                <Icon icon={Plus} size={16} className="mr-2" />
                Adicionar Ação
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {actions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                <p>Nenhuma ação configurada</p>
                <p className="text-sm">Clique em &quot;Adicionar Ação&quot; para começar</p>
              </div>
            ) : (
              <div className="space-y-4">
                {actions.map((action, index) => (
                  <div
                    key={action.id}
                    className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1 grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Tipo de Ação</Label>
                        <Select
                          value={action.type}
                          onValueChange={(value) =>
                            updateAction(action.id, "type", value as AutomationActionType)
                          }
                          disabled={isLoading}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {actionOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Atraso (minutos)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={action.delay_minutes}
                          onChange={(e) =>
                            updateAction(action.id, "delay_minutes", parseInt(e.target.value) || 0)
                          }
                          disabled={isLoading}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAction(action.id)}
                      disabled={isLoading}
                    >
                      <Icon icon={Trash2} size={16} className="text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button type="button" variant="secondary" asChild disabled={isLoading}>
            <Link href="/admin/automations">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Icon icon={Loader2} size={16} className="mr-2 animate-spin" />}
            Salvar Alterações
          </Button>
        </div>
      </form>
    </div>
  )
}
