"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  User,
  Mail,
  Phone,
  Save,
  Loader2,
  ArrowLeft,
  Shield,
  Lock,
  Eye,
  EyeOff,
  Camera,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useToast } from "@/lib/hooks/use-toast"
import Link from "next/link"

interface ProfileData {
  id: string
  name: string
  email: string
  phone: string | null
  avatar_url: string | null
  role: string
}

interface OrgData {
  role: string
  job_title: string | null
  org: { id: string; name: string } | null
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

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [orgData, setOrgData] = useState<OrgData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [originalName, setOriginalName] = useState("")
  const [originalPhone, setOriginalPhone] = useState<string | null>(null)
  const { toast } = useToast()

  // Avatar state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [removingAvatar, setRemovingAvatar] = useState(false)

  // Password state
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [changingPassword, setChangingPassword] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const fetchProfile = useCallback(async () => {
    try {
      const response = await fetch("/api/settings/profile")
      if (!response.ok) throw new Error("Erro ao carregar perfil")
      const data = await response.json()
      setProfile(data.profile)
      setOrgData(data.organization)
      setOriginalName(data.profile.name)
      setOriginalPhone(data.profile.phone)
    } catch {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível carregar o perfil",
      })
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  // Cleanup object URL on unmount or when preview changes
  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    }
  }, [avatarPreview])

  const handleAvatarUpload = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Arquivo muito grande. Máximo 2MB",
      })
      return
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Formato não suportado. Use JPG, PNG ou WebP",
      })
      return
    }

    // Optimistic preview
    const previewUrl = URL.createObjectURL(file)
    setAvatarPreview(previewUrl)
    setUploadingAvatar(true)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/settings/avatar", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Erro ao fazer upload")
      }

      const data = await response.json()

      // Update profile with new avatar URL
      setProfile((prev) => prev ? { ...prev, avatar_url: data.avatar_url } : null)
      URL.revokeObjectURL(previewUrl)
      setAvatarPreview(null)

      toast({
        title: "Foto atualizada",
        description: "Sua foto de perfil foi alterada com sucesso.",
      })
    } catch (err) {
      // Revert optimistic preview
      URL.revokeObjectURL(previewUrl)
      setAvatarPreview(null)
      toast({
        variant: "destructive",
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro ao fazer upload",
      })
    } finally {
      setUploadingAvatar(false)
    }
  }, [toast])

  const handleRemoveAvatar = useCallback(async () => {
    setRemovingAvatar(true)
    try {
      const response = await fetch("/api/settings/avatar", { method: "DELETE" })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Erro ao remover foto")
      }

      setProfile((prev) => prev ? { ...prev, avatar_url: null } : null)
      setAvatarPreview(null)

      toast({
        title: "Foto removida",
        description: "Sua foto de perfil foi removida.",
      })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro ao remover foto",
      })
    } finally {
      setRemovingAvatar(false)
    }
  }, [toast])

  const handleSaveProfile = async () => {
    if (!profile) return
    if (!profile.name || profile.name.trim().length < 2) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Nome deve ter pelo menos 2 caracteres",
      })
      return
    }

    setSaving(true)
    try {
      const response = await fetch("/api/settings/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profile.name.trim(), phone: profile.phone || null }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Erro ao salvar")
      }

      setOriginalName(profile.name.trim())
      setOriginalPhone(profile.phone || null)
      toast({
        title: "Salvo!",
        description: "Perfil atualizado com sucesso.",
      })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro ao salvar alterações",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()

    if (newPassword.length < 8) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "A nova senha deve ter no mínimo 8 caracteres",
      })
      return
    }

    if (newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "As senhas não coincidem",
      })
      return
    }

    setChangingPassword(true)
    try {
      const response = await fetch("/api/settings/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Erro ao alterar senha")
      }

      toast({
        title: "Senha alterada!",
        description: "Sua senha foi atualizada com sucesso.",
      })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro ao alterar senha",
      })
    } finally {
      setChangingPassword(false)
    }
  }

  const hasChanges = profile?.name !== originalName || (profile?.phone ?? null) !== originalPhone
  const displayAvatarUrl = avatarPreview || profile?.avatar_url || undefined

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/settings">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <p className="text-muted-foreground">Gerencie suas informações pessoais</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Profile Edit */}
        <Card className="rounded-xl border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Informações Pessoais
            </CardTitle>
            <CardDescription>Atualize seu nome, foto e dados de contato</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Avatar Upload */}
            <div className="flex items-center gap-4">
              <div className="relative group">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={displayAvatarUrl} alt={profile?.name || "Avatar"} />
                  <AvatarFallback className="text-lg">
                    {profile?.name ? getInitials(profile.name) : "?"}
                  </AvatarFallback>
                </Avatar>

                {/* Upload overlay */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-wait"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="h-6 w-6 text-white animate-spin" />
                  ) : (
                    <Camera className="h-6 w-6 text-white" />
                  )}
                </button>

                {/* Remove button */}
                {profile?.avatar_url && !uploadingAvatar && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={removingAvatar}
                    className="absolute -top-1 -right-1 h-6 w-6 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 transition-colors"
                    title="Remover foto"
                  >
                    {removingAvatar ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <X className="h-3 w-3" />
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
                <p className="text-sm font-medium">Foto de Perfil</p>
                <p className="text-xs text-muted-foreground">JPG, PNG ou WebP. Máximo 2MB.</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={profile?.name || ""}
                onChange={(e) =>
                  setProfile((prev) =>
                    prev ? { ...prev, name: e.target.value } : null
                  )
                }
                placeholder="Seu nome completo"
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
                  aria-describedby="email-help"
                />
              </div>
              <p id="email-help" className="text-xs text-muted-foreground">
                Para alteração de email, entre em contato com o suporte
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  value={profile?.phone || ""}
                  onChange={(e) =>
                    setProfile((prev) =>
                      prev ? { ...prev, phone: e.target.value } : null
                    )
                  }
                  placeholder="(11) 99999-9999"
                  className="pl-10"
                />
              </div>
            </div>

            <Button
              onClick={handleSaveProfile}
              disabled={saving || !hasChanges}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar Alterações
            </Button>
          </CardContent>
        </Card>

        {/* Account Info (read-only) */}
        <Card className="rounded-xl border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Informações da Conta
            </CardTitle>
            <CardDescription>Dados do sistema (somente leitura)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">ID do Usuário</p>
              <p className="font-medium text-xs font-mono">{profile?.id || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Papel no Sistema</p>
              <p className="font-medium capitalize">{profile?.role || "—"}</p>
            </div>
            {orgData && (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">Organização</p>
                  <p className="font-medium">{orgData.org?.name || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Papel na Organização</p>
                  <p className="font-medium capitalize">{orgData.role || "—"}</p>
                </div>
                {orgData.job_title && (
                  <div>
                    <p className="text-sm text-muted-foreground">Cargo</p>
                    <p className="font-medium">{orgData.job_title}</p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Password Change */}
      <Card className="rounded-xl border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-amber-600" />
            Alterar Senha
          </CardTitle>
          <CardDescription>Mantenha sua conta segura atualizando sua senha regularmente</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Senha Atual</Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">Nova Senha</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="md:col-span-3">
              <Button
                type="submit"
                variant="outline"
                disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
              >
                {changingPassword ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4 mr-2" />
                )}
                Alterar Senha
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
