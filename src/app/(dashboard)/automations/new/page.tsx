"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Save,
  Zap,
  Play,
  Mail,
  MessageSquare,
  Phone,
  Bell,
  Webhook,
  Clock,
  Trash2,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"

const triggers = [
  { type: "new_client", label: "Novo cliente cadastrado", icon: Zap },
  { type: "client_status_changed", label: "Status do cliente alterado", icon: Zap },
  { type: "payment_confirmed", label: "Pagamento confirmado", icon: Zap },
  { type: "payment_overdue", label: "Pagamento em atraso", icon: Clock },
  { type: "meeting_overdue", label: "Reunião atrasada", icon: Clock },
  { type: "meeting_upcoming", label: "Reunião se aproximando", icon: Clock },
  { type: "report_overdue", label: "Relatório atrasado", icon: Clock },
  { type: "contract_expiring", label: "Contrato vencendo", icon: Clock },
  { type: "deal_moved", label: "Deal movido", icon: Zap },
  { type: "deal_won", label: "Deal ganho", icon: Zap },
  { type: "deal_lost", label: "Deal perdido", icon: Zap },
]

const actions = [
  { type: "send_email", label: "Enviar Email", icon: Mail },
  { type: "send_whatsapp", label: "Enviar WhatsApp", icon: MessageSquare },
  { type: "send_sms", label: "Enviar SMS", icon: Phone },
  { type: "send_notification", label: "Notificação no sistema", icon: Bell },
  { type: "webhook", label: "Webhook externo", icon: Webhook },
]

interface AutomationAction {
  id: string
  type: string
  delay_minutes: number
  config: Record<string, unknown>
}

export default function NewAutomationPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isActive, setIsActive] = useState(false)
  const [selectedTrigger, setSelectedTrigger] = useState<string>("")
  const [automationActions, setAutomationActions] = useState<AutomationAction[]>([])

  function addAction(type: string) {
    setAutomationActions((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        type,
        delay_minutes: 0,
        config: {},
      },
    ])
  }

  function removeAction(id: string) {
    setAutomationActions((prev) => prev.filter((a) => a.id !== id))
  }

  function updateActionDelay(id: string, delay: number) {
    setAutomationActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, delay_minutes: delay } : a))
    )
  }

  async function handleSave() {
    if (!name || !selectedTrigger) {
      toast({
        variant: "destructive",
        title: "Campos obrigatórios",
        description: "Preencha o nome e selecione um gatilho.",
      })
      return
    }

    setIsLoading(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      const { error } = await supabase.from("automations").insert({
        name,
        description: description || null,
        is_active: isActive,
        trigger: { type: selectedTrigger, config: {} },
        conditions: [],
        actions: automationActions.map((a, index) => ({
          ...a,
          order: index,
        })),
        created_by: user?.id,
      })

      if (error) throw error

      toast({
        title: "Automação criada!",
        description: "A automação foi criada com sucesso.",
      })

      router.push("/automations")
    } catch (error) {
      console.error("Error creating automation:", error)
      toast({
        variant: "destructive",
        title: "Erro ao criar automação",
        description: "Tente novamente mais tarde.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/automations">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Nova Automação</h1>
            <p className="text-muted-foreground">
              Configure gatilhos, condições e ações
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-4">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label>{isActive ? "Ativa" : "Inativa"}</Label>
          </div>
          <Button onClick={handleSave} disabled={isLoading}>
            <Save className="mr-2 h-4 w-4" />
            Salvar
          </Button>
        </div>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informações Básicas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nome da automação *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Lembrete de pagamento em atraso"
            />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o objetivo desta automação..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Trigger */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            Gatilho
          </CardTitle>
          <CardDescription>
            Escolha o evento que irá disparar esta automação
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedTrigger} onValueChange={setSelectedTrigger}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um gatilho" />
            </SelectTrigger>
            <SelectContent>
              {triggers.map((trigger) => (
                <SelectItem key={trigger.type} value={trigger.type}>
                  <div className="flex items-center gap-2">
                    <trigger.icon className="h-4 w-4" />
                    {trigger.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Play className="h-4 w-4 text-emerald-500" />
            Ações
          </CardTitle>
          <CardDescription>
            Defina as ações que serão executadas quando o gatilho for ativado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Added Actions */}
          {automationActions.length > 0 && (
            <div className="space-y-3">
              {automationActions.map((action, index) => {
                const actionConfig = actions.find((a) => a.type === action.type)
                const Icon = actionConfig?.icon || Play

                return (
                  <div
                    key={action.id}
                    className="flex items-center gap-3 p-4 rounded-lg border bg-muted/50"
                  >
                    {/* Connector */}
                    {index > 0 && (
                      <div className="absolute -top-3 left-8 flex items-center gap-1 text-xs text-muted-foreground">
                        <ChevronRight className="h-3 w-3" />
                        <span>depois</span>
                      </div>
                    )}

                    <div className="rounded-lg p-2 bg-background">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{actionConfig?.label}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Label className="text-xs text-muted-foreground">
                          Aguardar:
                        </Label>
                        <Input
                          type="number"
                          value={action.delay_minutes}
                          onChange={(e) =>
                            updateActionDelay(action.id, parseInt(e.target.value) || 0)
                          }
                          className="w-20 h-7 text-sm"
                        />
                        <span className="text-xs text-muted-foreground">
                          minutos
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAction(action.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Add Action Buttons */}
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button
                key={action.type}
                variant="outline"
                size="sm"
                onClick={() => addAction(action.type)}
              >
                <action.icon className="mr-2 h-4 w-4" />
                {action.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">Resumo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 flex-wrap">
            {selectedTrigger && (
              <>
                <Badge variant="secondary" className="gap-1">
                  <Zap className="h-3 w-3" />
                  {triggers.find((t) => t.type === selectedTrigger)?.label}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </>
            )}
            {automationActions.map((action, index) => {
              const actionConfig = actions.find((a) => a.type === action.type)
              return (
                <div key={action.id} className="flex items-center gap-2">
                  {action.delay_minutes > 0 && (
                    <>
                      <Badge variant="outline" className="gap-1">
                        <Clock className="h-3 w-3" />
                        {action.delay_minutes} min
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </>
                  )}
                  <Badge className="gap-1">
                    {actionConfig?.label}
                  </Badge>
                  {index < automationActions.length - 1 && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              )
            })}
            {!selectedTrigger && automationActions.length === 0 && (
              <span className="text-muted-foreground text-sm">
                Configure o gatilho e as ações acima
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
