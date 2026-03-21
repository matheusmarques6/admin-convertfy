"use client"

import { useState, useEffect, useRef, useCallback } from "react"
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
  Camera,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface UserProfile {
  id: string
  name: string
  email: string
  phone?: string
  avatar_url?: string | null
}

interface NotificationPreferences {
  email_report_weekly: boolean
  email_report_monthly: boolean
  email_invoice_reminder: boolean
  email_invoice_paid: boolean
  email_campaign_sent: boolean
  email_performance_alerts: boolean
}

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export default function PortalSettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [notifications, setNotifications] = useState<NotificationPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Avatar state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [removingAvatar, setRemovingAvatar] = useState(false)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    }
  }, [avatarPreview])

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

  const handleAvatarUpload = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      setError("Arquivo muito grande. Máximo 2MB")
      return
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Formato não suportado. Use JPG, PNG ou WebP")
      return
    }

    const previewUrl = URL.createObjectURL(file)
    setAvatarPreview(previewUrl)
    setUploadingAvatar(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/portal/settings/avatar", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Erro ao fazer upload")
      }

      const data = await response.json()
      setProfile((prev) => prev ? { ...prev, avatar_url: data.avatar_url } : null)
      URL.revokeObjectURL(previewUrl)
      setAvatarPreview(null)
      setSuccess("Foto atualizada")
      window.dispatchEvent(new CustomEvent("portal-avatar-changed", { detail: { avatar_url: data.avatar_url } }))
    } catch (err) {
      URL.revokeObjectURL(previewUrl)
      setAvatarPreview(null)
      setError(err instanceof Error ? err.message : "Erro ao fazer upload")
    } finally {
      setUploadingAvatar(false)
    }
  }, [])

  const handleRemoveAvatar = useCallback(async () => {
    setRemovingAvatar(true)
    setError(null)

    try {
      const response = await fetch("/api/portal/settings/avatar", { method: "DELETE" })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Erro ao remover foto")
      }

      setProfile((prev) => prev ? { ...prev, avatar_url: null } : null)
      setAvatarPreview(null)
      setSuccess("Foto removida")
      window.dispatchEvent(new CustomEvent("portal-avatar-changed", { detail: { avatar_url: null } }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover foto")
    } finally {
      setRemovingAvatar(false)
    }
  }, [])

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

  const displayAvatarUrl = avatarPreview || profile?.avatar_url || undefined

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-7 w-48 bg-slate-200 dark:bg-slate-700 mb-2" />
          <Skeleton className="h-4 w-64 bg-slate-100 dark:bg-slate-800" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64 bg-white dark:bg-[#151922] rounded-xl border border-slate-100 dark:border-slate-700/30" />
          <Skeleton className="h-64 bg-white dark:bg-[#151922] rounded-xl border border-slate-100 dark:border-slate-700/30" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Configurações</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Gerencie suas informações e preferências</p>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive" className="bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <AlertDescription className="text-red-700 dark:text-red-400 text-[13px]">{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10">
          <CheckCircle className="h-4 w-4 text-emerald-600" />
          <AlertDescription className="text-emerald-700 dark:text-emerald-400 text-[13px]">{success}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Profile */}
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/30">
            <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Perfil
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Suas informações pessoais</p>
          </div>
          <div className="p-6 space-y-4">
            {/* Avatar Upload */}
            <div className="flex items-center gap-4">
              <div className="relative group">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={displayAvatarUrl} alt={profile?.name || "Avatar"} />
                  <AvatarFallback className="bg-gradient-to-br from-[#0284C7] to-[#05AFF2] text-white text-lg font-semibold">
                    {profile?.name ? getInitials(profile.name) : "?"}
                  </AvatarFallback>
                </Avatar>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  aria-label="Alterar foto de perfil"
                  className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-wait"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="h-5 w-5 text-white animate-spin" />
                  ) : (
                    <>
                      <Camera className="h-4 w-4 text-white" />
                      <span className="text-[10px] text-white mt-0.5">Alterar foto</span>
                    </>
                  )}
                </button>

                {profile?.avatar_url && !uploadingAvatar && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={removingAvatar}
                    className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center rounded-full bg-red-500 text-white shadow-sm hover:bg-red-600 transition-colors"
                    title="Remover foto"
                    aria-label="Remover foto de perfil"
                  >
                    {removingAvatar ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <X className="h-2.5 w-2.5" />
                    )}
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleAvatarUpload(file)
                    e.target.value = ""
                  }}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Foto de Perfil</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">JPG, PNG ou WebP. Máximo 2MB.</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name" className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">Nome</Label>
              <Input
                id="name"
                value={profile?.name || ""}
                onChange={(e) => setProfile(prev => prev ? { ...prev, name: e.target.value } : null)}
                className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                <Input
                  id="email"
                  value={profile?.email || ""}
                  disabled
                  className="pl-10 h-10 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700/40 text-slate-500 dark:text-slate-400"
                  aria-describedby="portal-email-help"
                />
              </div>
              <p id="portal-email-help" className="text-xs text-slate-400 dark:text-slate-500">O email não pode ser alterado</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">Telefone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                <Input
                  id="phone"
                  value={profile?.phone || ""}
                  onChange={(e) => setProfile(prev => prev ? { ...prev, phone: e.target.value } : null)}
                  placeholder="(11) 99999-9999"
                  className="pl-10 h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>
            </div>

            <Button onClick={handleSaveProfile} disabled={saving} className="bg-primary hover:bg-primary/85 text-white shadow-sm">
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar Perfil
            </Button>
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/30">
            <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-600" />
              Alterar Senha
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Mantenha sua conta segura</p>
          </div>
          <div className="p-6">
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword" className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">Senha Atual</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">Nova Senha</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100"
                />
                <p className="text-xs text-slate-400 dark:text-slate-500">Mínimo de 8 caracteres</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">Confirmar Nova Senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100"
                />
              </div>

              <Button type="submit" disabled={changingPassword} variant="secondary" className="border-slate-200 dark:border-slate-700/40 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
                {changingPassword ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4 mr-2" />
                )}
                Alterar Senha
              </Button>
            </form>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 overflow-hidden md:col-span-2">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/30">
            <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Bell className="h-4 w-4 text-[#05AFF2]" />
              Notificações por Email
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Escolha quais notificações deseja receber</p>
          </div>
          <div className="p-6">
            <div className="space-y-8">
              <NotifSection title="Relatórios">
                <NotifRow
                  title="Relatório Semanal"
                  description="Resumo semanal de performance das suas lojas"
                  checked={notifications?.email_report_weekly || false}
                  onChange={(checked) => setNotifications(prev => prev ? { ...prev, email_report_weekly: checked } : null)}
                />
                <NotifRow
                  title="Relatório Mensal"
                  description="Relatório mensal completo com métricas detalhadas"
                  checked={notifications?.email_report_monthly || false}
                  onChange={(checked) => setNotifications(prev => prev ? { ...prev, email_report_monthly: checked } : null)}
                />
              </NotifSection>

              <NotifSection title="Financeiro">
                <NotifRow
                  title="Lembrete de Fatura"
                  description="Aviso alguns dias antes do vencimento"
                  checked={notifications?.email_invoice_reminder || false}
                  onChange={(checked) => setNotifications(prev => prev ? { ...prev, email_invoice_reminder: checked } : null)}
                />
                <NotifRow
                  title="Confirmação de Pagamento"
                  description="Confirmação quando o pagamento for identificado"
                  checked={notifications?.email_invoice_paid || false}
                  onChange={(checked) => setNotifications(prev => prev ? { ...prev, email_invoice_paid: checked } : null)}
                />
              </NotifSection>

              <NotifSection title="Marketing">
                <NotifRow
                  title="Campanha Enviada"
                  description="Notificação quando uma campanha for enviada"
                  checked={notifications?.email_campaign_sent || false}
                  onChange={(checked) => setNotifications(prev => prev ? { ...prev, email_campaign_sent: checked } : null)}
                />
                <NotifRow
                  title="Alertas de Performance"
                  description="Alertas sobre mudanças significativas nas métricas"
                  checked={notifications?.email_performance_alerts || false}
                  onChange={(checked) => setNotifications(prev => prev ? { ...prev, email_performance_alerts: checked } : null)}
                />
              </NotifSection>

              <Button onClick={handleSaveNotifications} disabled={saving} className="bg-primary hover:bg-primary/85 text-white shadow-sm">
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar Preferências
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function NotifSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 mb-4 uppercase tracking-wide">{title}</h4>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function NotifRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={`Ativar ou desativar ${title}`} />
    </div>
  )
}
