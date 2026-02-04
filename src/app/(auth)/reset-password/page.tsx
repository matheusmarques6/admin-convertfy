"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/lib/hooks/use-toast"

const baseSchema = z
  .object({
    password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres"),
    confirmPassword: z.string().min(8, "Confirme sua senha"),
    adminEmailConfirmation: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não conferem",
    path: ["confirmPassword"],
  })

type ResetPasswordForm = z.infer<typeof baseSchema>

type ProfileInfo = {
  role?: string | null
  status?: string | null
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isFetchingProfile, setIsFetchingProfile] = useState(true)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [profileInfo, setProfileInfo] = useState<ProfileInfo>({})
  const [isBlocked, setIsBlocked] = useState(false)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(baseSchema),
  })

  const normalizedRole = useMemo(() => {
    if (profileInfo.role) return profileInfo.role
    return "client"
  }, [profileInfo.role])

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient()
      const { data, error } = await supabase.auth.getUser()

      if (error || !data.user) {
        setIsBlocked(true)
        setIsFetchingProfile(false)
        return
      }

      setUserEmail(data.user.email ?? null)

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, status")
        .eq("id", data.user.id)
        .single()

      const role = profile?.role ?? null
      const status = profile?.status ?? "active"
      setProfileInfo({ role, status })

      if (status !== "active") {
        setIsBlocked(true)
      }

      setIsFetchingProfile(false)
    }

    loadProfile()
  }, [])

  async function onSubmit(formData: ResetPasswordForm) {
    if (isBlocked) return

    if (normalizedRole === "admin") {
      if (!userEmail || formData.adminEmailConfirmation?.toLowerCase() !== userEmail.toLowerCase()) {
        setError("adminEmailConfirmation", {
          type: "manual",
          message: "Confirme seu email de administrador para continuar",
        })
        return
      }
    }

    setIsLoading(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({
        password: formData.password,
      })

      if (error) throw error

      await supabase.auth.signOut()

      toast({
        title: "Senha atualizada",
        description: "Faça login com sua nova senha.",
      })

      router.push("/login")
    } catch {
      toast({
        variant: "destructive",
        title: "Erro ao redefinir senha",
        description: "Tente novamente em instantes.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const isAdmin = normalizedRole === "admin"
  const isAgent = normalizedRole !== "admin" && normalizedRole !== "client"

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/login">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Redefinir senha</h1>
            <p className="text-muted-foreground">Escolha uma nova senha segura</p>
          </div>
        </div>

        <Card className="border-border/50">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">Atualize sua senha</CardTitle>
            <CardDescription>
              {isAdmin && "Fluxo reforçado para administradores."}
              {isAgent && "Fluxo para equipe interna (agentes)."}
              {normalizedRole === "client" && "Fluxo para clientes."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isFetchingProfile ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Validando sessão...
              </div>
            ) : isBlocked ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                Não foi possível validar sua conta. Solicite um novo link ou contate o suporte.
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Nova senha</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="********"
                    {...register("password")}
                    disabled={isLoading}
                  />
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar senha</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="********"
                    {...register("confirmPassword")}
                    disabled={isLoading}
                  />
                  {errors.confirmPassword && (
                    <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
                  )}
                </div>

                {isAdmin && (
                  <div className="space-y-2">
                    <Label htmlFor="adminEmailConfirmation">Confirme seu email de admin</Label>
                    <div className="relative">
                      <ShieldCheck className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="adminEmailConfirmation"
                        type="email"
                        placeholder="admin@empresa.com"
                        className="pl-9"
                        {...register("adminEmailConfirmation")}
                        disabled={isLoading}
                      />
                    </div>
                    {errors.adminEmailConfirmation && (
                      <p className="text-sm text-destructive">{errors.adminEmailConfirmation.message}</p>
                    )}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Atualizar senha
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
