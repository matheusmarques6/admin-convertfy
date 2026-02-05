<<<<<<< HEAD
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, User } from "lucide-react"
import Link from "next/link"

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/settings">
            <ArrowLeft className="h-5 w-5" />
=======
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowLeft, Loader2, User } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/lib/hooks/use-toast"

const profileSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  avatar_url: z.string().url("URL inválida").optional().or(z.literal("")),
})

type ProfileForm = z.infer<typeof profileSchema>

interface Profile {
  id: string
  name: string
  email: string
  avatar_url: string | null
  role: string
  created_at: string
}

export default function ProfileSettingsPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(true)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
  })

  useEffect(() => {
    async function fetchProfile() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push("/login")
          return
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single()

        if (error) throw error

        setProfile(data)
        reset({
          name: data.name,
          email: data.email,
          avatar_url: data.avatar_url || "",
        })
      } catch (error) {
        console.error("Error fetching profile:", error)
        toast({
          variant: "destructive",
          title: "Erro ao carregar perfil",
          description: "Tente novamente mais tarde.",
        })
      } finally {
        setIsFetching(false)
      }
    }

    fetchProfile()
  }, [reset, router])

  async function onSubmit(data: ProfileForm) {
    if (!profile) return

    setIsLoading(true)

    try {
      const supabase = createClient()

      const { error } = await supabase
        .from("profiles")
        .update({
          name: data.name,
          avatar_url: data.avatar_url || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id)

      if (error) throw error

      toast({
        title: "Perfil atualizado!",
        description: "Suas informações foram salvas com sucesso.",
      })

      router.refresh()
    } catch (error) {
      console.error("Error updating profile:", error)
      toast({
        variant: "destructive",
        title: "Erro ao atualizar perfil",
        description: "Tente novamente mais tarde.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const roleLabels: Record<string, string> = {
    admin: "Administrador",
    manager: "Gerente",
    sdr: "SDR",
    closer: "Closer",
    cs: "Customer Success",
    financial: "Financeiro",
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
            <div className="flex items-center gap-6">
              <Skeleton className="h-24 w-24 rounded-full" />
              <Skeleton className="h-10 w-32" />
            </div>
            {[1, 2, 3].map((i) => (
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
>>>>>>> origin/claude/analyze-admin-convertfy-QeqY4
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Perfil</h1>
<<<<<<< HEAD
          <p className="text-muted-foreground">Gerencie suas informações pessoais</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Informações da Conta
          </CardTitle>
          <CardDescription>Seus dados de acesso ao sistema</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="font-medium">{user?.email || "Não disponível"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">ID do Usuário</p>
            <p className="font-medium text-xs font-mono">{user?.id || "Não disponível"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Último login</p>
            <p className="font-medium">
              {user?.last_sign_in_at
                ? new Date(user.last_sign_in_at).toLocaleString("pt-BR")
                : "Não disponível"}
            </p>
          </div>
        </CardContent>
      </Card>
=======
          <p className="text-muted-foreground">
            Gerencie suas informações pessoais
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Informações Pessoais</CardTitle>
            <CardDescription>
              Atualize seus dados de perfil
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar */}
            <div className="flex items-center gap-6">
              <Avatar className="h-24 w-24">
                <AvatarImage src={profile?.avatar_url || ""} />
                <AvatarFallback className="text-2xl">
                  {profile?.name?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <Label htmlFor="avatar_url">URL do Avatar</Label>
                <Input
                  id="avatar_url"
                  placeholder="https://exemplo.com/avatar.jpg"
                  {...register("avatar_url")}
                  disabled={isLoading}
                />
                {errors.avatar_url && (
                  <p className="text-sm text-destructive">{errors.avatar_url.message}</p>
                )}
              </div>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                placeholder="Seu nome"
                {...register("name")}
                disabled={isLoading}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            {/* Email (read-only) */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                {...register("email")}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                O email não pode ser alterado
              </p>
            </div>

            {/* Role (read-only) */}
            <div className="space-y-2">
              <Label>Cargo</Label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{roleLabels[profile?.role || "cs"] || profile?.role}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                O cargo é definido pelo administrador
              </p>
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
>>>>>>> origin/claude/analyze-admin-convertfy-QeqY4
    </div>
  )
}
