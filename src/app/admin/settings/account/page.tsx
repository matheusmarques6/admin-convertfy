"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  Lock,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Camera,
  Loader2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Icon } from "@/components/ui/icon"
import { FormField } from "@/components/ui/form-field"
import { SaveBar } from "@/components/ui/save-bar"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/lib/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

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

interface CompanyData {
  company_name: string
  cnpj: string
  phone: string
  email: string
  address: string
  city: string
  state: string
  logo_url: string
}

const emptyCompany: CompanyData = {
  company_name: "", cnpj: "", phone: "", email: "",
  address: "", city: "", state: "", logo_url: "",
}

const MAX_FILE_SIZE = 2 * 1024 * 1024
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
}

export default function AccountSettingsPage() {
  const { toast } = useToast()

  // Profile state
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [orgData, setOrgData] = useState<OrgData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [originalName, setOriginalName] = useState("")
  const [originalPhone, setOriginalPhone] = useState<string | null>(null)

  // Avatar state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [removingAvatar, setRemovingAvatar] = useState(false)

  // Password state
  const [showPasswordChange, setShowPasswordChange] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [changingPassword, setChangingPassword] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Company state
  const [company, setCompany] = useState<CompanyData>(emptyCompany)
  const [originalCompany, setOriginalCompany] = useState<CompanyData>(emptyCompany)
  const [savingCompany, setSavingCompany] = useState(false)

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
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível carregar o perfil" })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    async function loadAll() {
      await fetchProfile()
      try {
        const supabase = createClient()
        const { data } = await supabase.from("company_settings").select("*").limit(1).single()
        if (data) {
          const companyData = data as unknown as CompanyData
          setCompany(companyData)
          setOriginalCompany(companyData)
        }
      } catch {
        // No company data yet
      }
      setLoading(false)
    }
    loadAll()
  }, [fetchProfile])

  useEffect(() => {
    return () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview) }
  }, [avatarPreview])

  const handleAvatarUpload = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast({ variant: "destructive", title: "Erro", description: "Arquivo muito grande. Máximo 2MB" })
      return
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({ variant: "destructive", title: "Erro", description: "Formato não suportado. Use JPG, PNG ou WebP" })
      return
    }

    const previewUrl = URL.createObjectURL(file)
    setAvatarPreview(previewUrl)
    setUploadingAvatar(true)

    try {
      const formData = new FormData()
      formData.append("file", file)
      const response = await fetch("/api/settings/avatar", { method: "POST", body: formData })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Erro ao fazer upload")
      }
      const data = await response.json()
      setProfile((prev) => prev ? { ...prev, avatar_url: data.avatar_url } : null)
      URL.revokeObjectURL(previewUrl)
      setAvatarPreview(null)
      toast({ title: "Foto atualizada", description: "Sua foto de perfil foi alterada com sucesso." })
    } catch (err) {
      URL.revokeObjectURL(previewUrl)
      setAvatarPreview(null)
      toast({ variant: "destructive", title: "Erro", description: err instanceof Error ? err.message : "Erro ao fazer upload" })
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
      toast({ title: "Foto removida", description: "Sua foto de perfil foi removida." })
    } catch (err) {
      toast({ variant: "destructive", title: "Erro", description: err instanceof Error ? err.message : "Erro ao remover foto" })
    } finally {
      setRemovingAvatar(false)
    }
  }, [toast])

  const handleSaveProfile = async () => {
    if (!profile) return
    if (!profile.name || profile.name.trim().length < 2) {
      toast({ variant: "destructive", title: "Erro", description: "Nome deve ter pelo menos 2 caracteres" })
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
      toast({ title: "Salvo!", description: "Perfil atualizado com sucesso." })
    } catch (err) {
      toast({ variant: "destructive", title: "Erro", description: err instanceof Error ? err.message : "Erro ao salvar alterações" })
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 8) {
      toast({ variant: "destructive", title: "Erro", description: "A nova senha deve ter no mínimo 8 caracteres" })
      return
    }
    if (newPassword !== confirmPassword) {
      toast({ variant: "destructive", title: "Erro", description: "As senhas não coincidem" })
      return
    }
    setChangingPassword(true)
    try {
      const response = await fetch("/api/settings/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Erro ao alterar senha")
      }
      toast({ title: "Senha alterada!", description: "Sua senha foi atualizada com sucesso." })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setShowPasswordChange(false)
    } catch (err) {
      toast({ variant: "destructive", title: "Erro", description: err instanceof Error ? err.message : "Erro ao alterar senha" })
    } finally {
      setChangingPassword(false)
    }
  }

  const handleSaveCompany = async () => {
    setSavingCompany(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from("company_settings").upsert(company, { onConflict: "id" })
      if (error) throw error
      setOriginalCompany({ ...company })
      toast({ title: "Salvo!", description: "Informações da empresa atualizadas." })
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Erro ao salvar dados da empresa." })
    } finally {
      setSavingCompany(false)
    }
  }

  const updateCompanyField = (field: keyof CompanyData, value: string) =>
    setCompany((prev) => ({ ...prev, [field]: value }))

  const hasProfileChanges = profile?.name !== originalName || (profile?.phone ?? null) !== originalPhone
  const hasCompanyChanges = JSON.stringify(company) !== JSON.stringify(originalCompany)
  const displayAvatarUrl = avatarPreview || profile?.avatar_url || undefined

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conta"
        description="Gerencie seus dados pessoais e da empresa."
        breadcrumb={[
          { label: "Configurações", href: "/admin/settings" },
          { label: "Conta" },
        ]}
      />

      <div className="max-w-2xl space-y-6">
        {/* Section 1: Personal Data */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Dados Pessoais</CardTitle>
            <CardDescription>Suas informações de perfil e acesso.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Avatar upload */}
            <div className="flex items-center gap-4">
              <div className="relative group">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={displayAvatarUrl} alt={profile?.name || "Avatar"} />
                  <AvatarFallback className="text-lg">
                    {profile?.name ? getInitials(profile.name) : "?"}
                  </AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-wait"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="h-5 w-5 text-white animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4 text-white" />
                  )}
                </button>
                {profile?.avatar_url && !uploadingAvatar && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={removingAvatar}
                    className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 transition-colors"
                    title="Remover foto"
                  >
                    {removingAvatar ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
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
                <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                  Alterar foto
                </Button>
                <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mt-1">
                  JPG, PNG até 2MB
                </p>
              </div>
            </div>

            {/* Name */}
            <FormField label="Nome" required htmlFor="name">
              <Input
                id="name"
                value={profile?.name || ""}
                onChange={(e) => setProfile((prev) => prev ? { ...prev, name: e.target.value } : null)}
                placeholder="Seu nome completo"
              />
            </FormField>

            {/* Email (read-only) */}
            <FormField label="Email" hint="Para alteração de email, entre em contato com o suporte">
              <Input value={profile?.email || ""} disabled className="bg-muted" />
            </FormField>

            {/* Phone */}
            <FormField label="Telefone" htmlFor="phone">
              <Input
                id="phone"
                type="tel"
                value={profile?.phone || ""}
                onChange={(e) => setProfile((prev) => prev ? { ...prev, phone: e.target.value } : null)}
                placeholder="(11) 99999-9999"
              />
            </FormField>

            {/* Account info */}
            {orgData && (
              <div className="pt-2 border-t border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-400 dark:text-[#5C6378]">Papel</p>
                  <p className="text-sm font-medium text-gray-700 dark:text-[#EAEDF3] capitalize">{profile?.role || "—"}</p>
                </div>
                {orgData.org && (
                  <div>
                    <p className="text-xs text-gray-400 dark:text-[#5C6378]">Organização</p>
                    <p className="text-sm font-medium text-gray-700 dark:text-[#EAEDF3]">{orgData.org.name}</p>
                  </div>
                )}
              </div>
            )}

            {/* Password change — collapsible */}
            <div className="pt-2 border-t border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
              <button
                onClick={() => setShowPasswordChange(!showPasswordChange)}
                className={cn(
                  "flex items-center gap-2 text-sm font-medium",
                  "text-[#4E62D8] dark:text-[#7B8CEA] hover:underline",
                  "focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#4E62D8]",
                  "dark:focus-visible:shadow-[0_0_0_2px_#7B8CEA] rounded-[4px]",
                )}
              >
                <Icon icon={Lock} size={16} />
                Alterar senha
                <Icon icon={showPasswordChange ? ChevronUp : ChevronDown} customSize={14} />
              </button>

              {showPasswordChange && (
                <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
                  <FormField label="Senha atual" required>
                    <div className="relative">
                      <Input
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
                  </FormField>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField label="Nova senha" required hint="Mínimo de 8 caracteres">
                      <div className="relative">
                        <Input
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
                    </FormField>
                    <FormField label="Confirmar nova senha" required>
                      <div className="relative">
                        <Input
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
                    </FormField>
                  </div>
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                  >
                    {changingPassword ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lock className="h-4 w-4 mr-2" />}
                    Alterar Senha
                  </Button>
                </form>
              )}
            </div>

            <SaveBar
              isSaving={saving}
              onSave={handleSaveProfile}
              onCancel={() => {
                if (profile) {
                  setProfile({ ...profile, name: originalName, phone: originalPhone })
                }
              }}
              hasChanges={hasProfileChanges}
            />
          </CardContent>
        </Card>

        {/* Section 2: Company */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Empresa</CardTitle>
            <CardDescription>Informações da organização.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField label="Nome da empresa" required htmlFor="company_name">
              <Input id="company_name" value={company.company_name} onChange={(e) => updateCompanyField("company_name", e.target.value)} placeholder="Convertfy" />
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="CNPJ" htmlFor="cnpj">
                <Input id="cnpj" value={company.cnpj} onChange={(e) => updateCompanyField("cnpj", e.target.value)} placeholder="00.000.000/0001-00" />
              </FormField>
              <FormField label="Telefone comercial" htmlFor="company_phone">
                <Input id="company_phone" type="tel" value={company.phone} onChange={(e) => updateCompanyField("phone", e.target.value)} placeholder="(31) 3333-3333" />
              </FormField>
            </div>

            <FormField label="Email" htmlFor="company_email">
              <Input id="company_email" type="email" value={company.email} onChange={(e) => updateCompanyField("email", e.target.value)} placeholder="contato@convertfy.com.br" />
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Endereço" htmlFor="address">
                <Input id="address" value={company.address} onChange={(e) => updateCompanyField("address", e.target.value)} placeholder="Rua, número, bairro" />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Cidade" htmlFor="city">
                  <Input id="city" value={company.city} onChange={(e) => updateCompanyField("city", e.target.value)} placeholder="São Paulo" />
                </FormField>
                <FormField label="Estado" htmlFor="state">
                  <Input id="state" value={company.state} onChange={(e) => updateCompanyField("state", e.target.value)} placeholder="SP" />
                </FormField>
              </div>
            </div>

            <SaveBar
              isSaving={savingCompany}
              onSave={handleSaveCompany}
              onCancel={() => setCompany({ ...originalCompany })}
              hasChanges={hasCompanyChanges}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
