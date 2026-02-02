"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, Bell, Mail, MessageSquare } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/lib/hooks/use-toast"

interface NotificationSettings {
  email_new_client: boolean
  email_payment_received: boolean
  email_payment_overdue: boolean
  email_meeting_reminder: boolean
  email_report_due: boolean
  push_new_client: boolean
  push_payment_received: boolean
  push_payment_overdue: boolean
  push_meeting_reminder: boolean
}

const defaultSettings: NotificationSettings = {
  email_new_client: true,
  email_payment_received: true,
  email_payment_overdue: true,
  email_meeting_reminder: true,
  email_report_due: true,
  push_new_client: true,
  push_payment_received: true,
  push_payment_overdue: true,
  push_meeting_reminder: true,
}

export default function NotificationsSettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings)
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(true)

  useEffect(() => {
    async function fetchSettings() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) return

        const { data } = await supabase
          .from("settings")
          .select("key, value")
          .eq("key", `notifications_${user.id}`)
          .single()

        if (data?.value) {
          setSettings({ ...defaultSettings, ...(data.value as NotificationSettings) })
        }
      } catch (error) {
        // Settings don't exist yet, use defaults
      } finally {
        setIsFetching(false)
      }
    }

    fetchSettings()
  }, [])

  async function handleToggle(key: keyof NotificationSettings, value: boolean) {
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) return

      await supabase
        .from("settings")
        .upsert({
          key: `notifications_${user.id}`,
          value: newSettings,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "key",
        })
    } catch (error) {
      // Revert on error
      setSettings(settings)
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: "Tente novamente.",
      })
    }
  }

  async function handleSaveAll() {
    setIsLoading(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) return

      await supabase
        .from("settings")
        .upsert({
          key: `notifications_${user.id}`,
          value: settings,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "key",
        })

      toast({
        title: "Preferências salvas!",
        description: "Suas preferências de notificação foram atualizadas.",
      })
    } catch (error) {
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
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-6 w-10" />
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
          <h1 className="text-2xl font-bold">Notificações</h1>
          <p className="text-muted-foreground">
            Configure suas preferências de notificação
          </p>
        </div>
      </div>

      {/* Email Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Notificações por Email
          </CardTitle>
          <CardDescription>
            Escolha quais emails você deseja receber
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Novo cliente cadastrado</Label>
              <p className="text-sm text-muted-foreground">
                Receba um email quando um novo cliente for cadastrado
              </p>
            </div>
            <Switch
              checked={settings.email_new_client}
              onCheckedChange={(value) => handleToggle("email_new_client", value)}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Pagamento recebido</Label>
              <p className="text-sm text-muted-foreground">
                Notificação quando um pagamento for confirmado
              </p>
            </div>
            <Switch
              checked={settings.email_payment_received}
              onCheckedChange={(value) => handleToggle("email_payment_received", value)}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Pagamento em atraso</Label>
              <p className="text-sm text-muted-foreground">
                Alerta quando um pagamento estiver atrasado
              </p>
            </div>
            <Switch
              checked={settings.email_payment_overdue}
              onCheckedChange={(value) => handleToggle("email_payment_overdue", value)}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Lembrete de reunião</Label>
              <p className="text-sm text-muted-foreground">
                Lembrete 1 hora antes das reuniões agendadas
              </p>
            </div>
            <Switch
              checked={settings.email_meeting_reminder}
              onCheckedChange={(value) => handleToggle("email_meeting_reminder", value)}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Relatório pendente</Label>
              <p className="text-sm text-muted-foreground">
                Lembrete quando um relatório estiver pendente
              </p>
            </div>
            <Switch
              checked={settings.email_report_due}
              onCheckedChange={(value) => handleToggle("email_report_due", value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Push Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notificações no Sistema
          </CardTitle>
          <CardDescription>
            Notificações que aparecem dentro do sistema
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Novo cliente</Label>
              <p className="text-sm text-muted-foreground">
                Notificação ao cadastrar novo cliente
              </p>
            </div>
            <Switch
              checked={settings.push_new_client}
              onCheckedChange={(value) => handleToggle("push_new_client", value)}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Pagamentos</Label>
              <p className="text-sm text-muted-foreground">
                Alertas de pagamentos recebidos
              </p>
            </div>
            <Switch
              checked={settings.push_payment_received}
              onCheckedChange={(value) => handleToggle("push_payment_received", value)}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Atrasos</Label>
              <p className="text-sm text-muted-foreground">
                Alertas de pagamentos em atraso
              </p>
            </div>
            <Switch
              checked={settings.push_payment_overdue}
              onCheckedChange={(value) => handleToggle("push_payment_overdue", value)}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Reuniões</Label>
              <p className="text-sm text-muted-foreground">
                Lembretes de reuniões próximas
              </p>
            </div>
            <Switch
              checked={settings.push_meeting_reminder}
              onCheckedChange={(value) => handleToggle("push_meeting_reminder", value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-4">
        <Button variant="outline" asChild>
          <Link href="/settings">Voltar</Link>
        </Button>
        <Button onClick={handleSaveAll} disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Preferências
        </Button>
      </div>
    </div>
  )
}
