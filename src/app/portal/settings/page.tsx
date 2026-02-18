"use client"

import { useState, useEffect } from "react"
import {
  User,
  Mail,
  Phone,
  Lock,
  Bell,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
} from "lucide-react"
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GlowCard } from "@/components/ui/glow-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"

interface UserProfile {
  id: string
  name: string
  email: string
  phone?: string
}

interface NotificationPreferences {
  email_report_weekly: boolean
  email_report_monthly: boolean
  email_invoice_reminder: boolean
  email_invoice_paid: boolean
  email_campaign_sent: boolean
  email_performance_alerts: boolean
}

export default function PortalSettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [notifications, setNotifications] = useState<NotificationPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/portal/settings")
      if (!response.ok) throw new Error("Erro ao carregar configurações")
      const data = await response.json()
      setProfile(data.profile)
      setNotifications(data.notifications)
    } catch {
      setError("Não foi possível carregar as configurações")
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!profile) return
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch("/api/portal/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name,
          phone: profile.phone,
        }),
      })

      if (!response.ok) throw new Error("Erro ao salvar")
      setSuccess("Perfil atualizado com sucesso!")
    } catch {
      setError("Erro ao salvar as alterações")
    } finally {
      setSaving(false)
    }
  }

  const handleSaveNotifications = async () => {
    if (!notifications) return
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch("/api/portal/settings/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notifications),
      })

      if (!response.ok) throw new Error("Erro ao salvar")
      setSuccess("Preferências de notificação atualizadas!")
    } catch {
      setError("Erro ao salvar as preferências")
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem")
      return
    }

    if (newPassword.length < 8) {
      setError("A nova senha deve ter no mínimo 8 caracteres")
      return
    }

    setChangingPassword(true)

    try {
      const response = await fetch("/api/portal/settings/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Erro ao alterar senha")
      }

      setSuccess("Senha alterada com sucesso!")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao alterar a senha")
    } finally {
      setChangingPassword(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">
          Gerencie suas informações e preferências
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-success/20 bg-success/10 text-success">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Profile */}
        <GlowCard color="primary" intensity="subtle">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Perfil
            </CardTitle>
            <CardDescription>
              Suas informações pessoais
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={profile?.name || ""}
                onChange={(e) => setProfile(prev => prev ? { ...prev, name: e.target.value } : null)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  value={profile?.email || ""}
                  disabled
                  className="pl-10 bg-muted"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                O email não pode ser alterado
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  value={profile?.phone || ""}
                  onChange={(e) => setProfile(prev => prev ? { ...prev, phone: e.target.value } : null)}
                  placeholder="(11) 99999-9999"
                  className="pl-10"
                />
              </div>
            </div>

            <Button onClick={handleSaveProfile} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar Perfil
            </Button>
          </CardContent>
        </GlowCard>

        {/* Change Password */}
        <GlowCard color="primary" intensity="subtle">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Alterar Senha
            </CardTitle>
            <CardDescription>
              Mantenha sua conta segura
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Senha Atual</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">Nova Senha</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <p className="text-xs text-muted-foreground">
                  Mínimo de 8 caracteres
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" disabled={changingPassword}>
                {changingPassword ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4 mr-2" />
                )}
                Alterar Senha
              </Button>
            </form>
          </CardContent>
        </GlowCard>

        {/* Notifications */}
        <GlowCard color="primary" intensity="subtle" className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notificações por Email
            </CardTitle>
            <CardDescription>
              Escolha quais notificações deseja receber
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <h4 className="font-medium mb-4">Relatórios</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Relatório Semanal</p>
                      <p className="text-xs text-muted-foreground">
                        Resumo semanal de performance das suas lojas
                      </p>
                    </div>
                    <Switch
                      checked={notifications?.email_report_weekly || false}
                      onCheckedChange={(checked) =>
                        setNotifications(prev => prev ? { ...prev, email_report_weekly: checked } : null)
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Relatório Mensal</p>
                      <p className="text-xs text-muted-foreground">
                        Relatório mensal completo com métricas detalhadas
                      </p>
                    </div>
                    <Switch
                      checked={notifications?.email_report_monthly || false}
                      onCheckedChange={(checked) =>
                        setNotifications(prev => prev ? { ...prev, email_report_monthly: checked } : null)
                      }
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-4">Financeiro</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Lembrete de Fatura</p>
                      <p className="text-xs text-muted-foreground">
                        Aviso alguns dias antes do vencimento
                      </p>
                    </div>
                    <Switch
                      checked={notifications?.email_invoice_reminder || false}
                      onCheckedChange={(checked) =>
                        setNotifications(prev => prev ? { ...prev, email_invoice_reminder: checked } : null)
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Confirmação de Pagamento</p>
                      <p className="text-xs text-muted-foreground">
                        Confirmação quando o pagamento for identificado
                      </p>
                    </div>
                    <Switch
                      checked={notifications?.email_invoice_paid || false}
                      onCheckedChange={(checked) =>
                        setNotifications(prev => prev ? { ...prev, email_invoice_paid: checked } : null)
                      }
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-4">Marketing</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Campanha Enviada</p>
                      <p className="text-xs text-muted-foreground">
                        Notificação quando uma campanha for enviada
                      </p>
                    </div>
                    <Switch
                      checked={notifications?.email_campaign_sent || false}
                      onCheckedChange={(checked) =>
                        setNotifications(prev => prev ? { ...prev, email_campaign_sent: checked } : null)
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Alertas de Performance</p>
                      <p className="text-xs text-muted-foreground">
                        Alertas sobre mudanças significativas nas métricas
                      </p>
                    </div>
                    <Switch
                      checked={notifications?.email_performance_alerts || false}
                      onCheckedChange={(checked) =>
                        setNotifications(prev => prev ? { ...prev, email_performance_alerts: checked } : null)
                      }
                    />
                  </div>
                </div>
              </div>

              <Button onClick={handleSaveNotifications} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar Preferências
              </Button>
            </div>
          </CardContent>
        </GlowCard>
      </div>
    </div>
  )
}
