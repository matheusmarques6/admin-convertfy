"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Eye, EyeOff, Loader2, AlertTriangle, ArrowLeft } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { GlowCard } from "@/components/ui/glow-card"
import { toast } from "@/lib/hooks/use-toast"
import { rateLimitService } from "@/lib/services"

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isRateLimited, setIsRateLimited] = useState(false)
  const [retryAfter, setRetryAfter] = useState(0)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: LoginForm) {
    setIsLoading(true)

    try {
      const supabase = createClient()
      const normalizedEmail = data.email.toLowerCase().trim()

      // Check login attempt rate limit
      const rateLimitResult = await rateLimitService.checkAndRecord(
        normalizedEmail,
        "login_attempt"
      )

      if (rateLimitResult.isLimited) {
        setIsRateLimited(true)
        setRetryAfter(rateLimitResult.retryAfterSeconds)

        // Show generic error to prevent user enumeration
        toast({
          variant: "destructive",
          title: "Erro ao fazer login",
          description: "Email ou senha incorretos",
        })
        return
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (error) {
        // Generic error message - don't reveal if email exists
        toast({
          variant: "destructive",
          title: "Erro ao fazer login",
          description: "Email ou senha incorretos",
        })
        return
      }

      // Clear rate limit on successful login
      await rateLimitService.clearRateLimit(normalizedEmail, "login_attempt")

      toast({
        title: "Login realizado com sucesso!",
        description: "Redirecionando para o dashboard...",
      })

      router.push("/dashboard")
      router.refresh()
    } catch {
      toast({
        variant: "destructive",
        title: "Erro inesperado",
        description: "Tente novamente mais tarde",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-convertfy-purple via-convertfy-blue to-convertfy-cyan flex items-center justify-center">
              <span className="text-2xl font-bold text-white">C</span>
            </div>
          </div>
          <h1 className="text-2xl font-bold gradient-text">Convertfy Admin</h1>
          <p className="text-muted-foreground mt-1">Sistema de Gestão para Agências</p>
        </div>

        {isRateLimited ? (
          <GlowCard color="primary" intensity="subtle" className="border-border/50">
            <CardHeader className="space-y-1 text-center">
              <div className="flex justify-center mb-4">
                <div className="rounded-full bg-warning/10 p-4">
                  <AlertTriangle className="h-8 w-8 text-warning" />
                </div>
              </div>
              <CardTitle className="text-2xl">Conta Temporariamente Bloqueada</CardTitle>
              <CardDescription className="text-base">
                Muitas tentativas de login incorretas.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                Por segurança, aguarde{" "}
                <span className="font-semibold text-foreground">
                  {rateLimitService.formatRetryTime(retryAfter)}
                </span>{" "}
                antes de tentar novamente.
              </p>
              <p className="text-xs text-muted-foreground">
                Se você esqueceu sua senha, use a opção de recuperação.
              </p>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <Button asChild variant="outline" className="w-full">
                <Link href="/forgot-password">
                  Recuperar Senha
                </Link>
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setIsRateLimited(false)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Tentar novamente
              </Button>
            </CardFooter>
          </GlowCard>
        ) : (
          <GlowCard color="primary" intensity="subtle" className="border-border/50">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl">Entrar</CardTitle>
              <CardDescription>
                Digite suas credenciais para acessar o sistema
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit(onSubmit)}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    {...register("email")}
                    disabled={isLoading}
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Senha</Label>
                    <Link
                      href="/forgot-password"
                      className="text-sm text-primary hover:underline"
                    >
                      Esqueceu a senha?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="******"
                      {...register("password")}
                      disabled={isLoading}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isLoading}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password.message}</p>
                  )}
                </div>
              </CardContent>

              <CardFooter className="flex flex-col space-y-4">
                <Button
                  type="submit"
                  className="w-full"
                  variant="gradient"
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Entrar
                </Button>

                <p className="text-sm text-center text-muted-foreground">
                  Não tem uma conta?{" "}
                  <Link href="/register" className="text-primary hover:underline">
                    Cadastre-se
                  </Link>
                </p>
              </CardFooter>
            </form>
          </GlowCard>
        )}
      </div>
    </div>
  )
}
