"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Eye, EyeOff, Loader2, CheckCircle, AlertTriangle, Check, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { GlowCard } from "@/components/ui/glow-card"
import { toast } from "@/lib/hooks/use-toast"
import { rateLimitService } from "@/lib/services"

// Password validation rules
const passwordRules = {
  minLength: 8,
  hasUppercase: /[A-Z]/,
  hasLowercase: /[a-z]/,
  hasNumber: /[0-9]/,
  hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
}

const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(passwordRules.minLength, `Senha deve ter pelo menos ${passwordRules.minLength} caracteres`)
    .regex(passwordRules.hasUppercase, "Senha deve ter pelo menos uma letra maiúscula")
    .regex(passwordRules.hasLowercase, "Senha deve ter pelo menos uma letra minúscula")
    .regex(passwordRules.hasNumber, "Senha deve ter pelo menos um número")
    .regex(passwordRules.hasSpecial, "Senha deve ter pelo menos um caractere especial"),
  confirmPassword: z.string().min(1, "Confirme sua senha"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
})

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>

interface PasswordStrength {
  minLength: boolean
  hasUppercase: boolean
  hasLowercase: boolean
  hasNumber: boolean
  hasSpecial: boolean
}

function PasswordStrengthIndicator({ password }: { password: string }) {
  const strength: PasswordStrength = {
    minLength: password.length >= passwordRules.minLength,
    hasUppercase: passwordRules.hasUppercase.test(password),
    hasLowercase: passwordRules.hasLowercase.test(password),
    hasNumber: passwordRules.hasNumber.test(password),
    hasSpecial: passwordRules.hasSpecial.test(password),
  }

  const metCount = Object.values(strength).filter(Boolean).length
  const strengthLevel = metCount === 5 ? "strong" : metCount >= 3 ? "medium" : "weak"
  const strengthColors = {
    weak: "bg-destructive",
    medium: "bg-warning",
    strong: "bg-success",
  }

  const rules = [
    { key: "minLength", label: `Mínimo ${passwordRules.minLength} caracteres`, met: strength.minLength },
    { key: "hasUppercase", label: "Uma letra maiúscula", met: strength.hasUppercase },
    { key: "hasLowercase", label: "Uma letra minúscula", met: strength.hasLowercase },
    { key: "hasNumber", label: "Um número", met: strength.hasNumber },
    { key: "hasSpecial", label: "Um caractere especial (!@#$...)", met: strength.hasSpecial },
  ]

  return (
    <div className="space-y-3 mt-3">
      {/* Strength bar */}
      <div className="space-y-1">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= metCount ? strengthColors[strengthLevel] : "bg-muted"
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Força da senha:{" "}
          <span className={`font-medium ${
            strengthLevel === "strong" ? "text-success" :
            strengthLevel === "medium" ? "text-warning" : "text-destructive"
          }`}>
            {strengthLevel === "strong" ? "Forte" : strengthLevel === "medium" ? "Média" : "Fraca"}
          </span>
        </p>
      </div>

      {/* Requirements checklist */}
      <ul className="space-y-1.5">
        {rules.map((rule) => (
          <li
            key={rule.key}
            className={`flex items-center gap-2 text-xs ${
              rule.met ? "text-success" : "text-muted-foreground"
            }`}
          >
            {rule.met ? (
              <Check className="h-3 w-3" />
            ) : (
              <X className="h-3 w-3" />
            )}
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isExpired, setIsExpired] = useState(false)
  const [password, setPassword] = useState("")

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
  })

  // Watch password for strength indicator
  const watchedPassword = watch("password", "")

  useEffect(() => {
    setPassword(watchedPassword)
  }, [watchedPassword])

  // Check if token is present (Supabase handles token validation)
  useEffect(() => {
    // If there's an error in URL params, the token might be expired
    const error = searchParams.get("error")
    const errorDescription = searchParams.get("error_description")

    if (error || errorDescription?.includes("expired")) {
      setIsExpired(true)
    }
  }, [searchParams])

  async function onSubmit(data: ResetPasswordForm) {
    setIsLoading(true)

    try {
      const supabase = createClient()

      // Get current user session (from the recovery token)
      const { data: { user } } = await supabase.auth.getUser()

      if (!user?.email) {
        setIsExpired(true)
        toast({
          variant: "destructive",
          title: "Link expirado",
          description: "O link de recuperação expirou ou é inválido.",
        })
        return
      }

      // Log the reset attempt
      await rateLimitService.logPasswordResetAudit({
        email: user.email,
        accountType: "admin",
        action: "complete",
        success: false, // Will be updated if successful
      })

      const { error } = await supabase.auth.updateUser({
        password: data.password,
      })

      if (error) {
        // Log the failure
        await rateLimitService.logPasswordResetAudit({
          email: user.email,
          accountType: "admin",
          action: "fail",
          success: false,
          errorMessage: error.message,
        })

        toast({
          variant: "destructive",
          title: "Erro ao redefinir senha",
          description: error.message,
        })
        return
      }

      // Log success
      await rateLimitService.logPasswordResetAudit({
        email: user.email,
        accountType: "admin",
        action: "complete",
        success: true,
      })

      // Clear any rate limits for this user
      await rateLimitService.clearRateLimit(user.email, "password_reset")

      setIsSuccess(true)

      toast({
        title: "Senha redefinida!",
        description: "Sua senha foi alterada com sucesso.",
      })

      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push("/login")
      }, 3000)
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

        {isExpired ? (
          <GlowCard color="primary" intensity="subtle" className="border-border/50">
            <CardHeader className="space-y-1 text-center">
              <div className="flex justify-center mb-4">
                <div className="rounded-full bg-warning/10 p-4">
                  <AlertTriangle className="h-8 w-8 text-warning" />
                </div>
              </div>
              <CardTitle className="text-2xl">Link Expirado</CardTitle>
              <CardDescription className="text-base">
                O link de recuperação expirou ou é inválido.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-sm text-muted-foreground">
                Os links de recuperação são válidos por 1 hora. Solicite um novo link para redefinir sua senha.
              </p>
            </CardContent>
            <CardFooter>
              <Button asChild className="w-full" variant="gradient">
                <Link href="/forgot-password">Solicitar Novo Link</Link>
              </Button>
            </CardFooter>
          </GlowCard>
        ) : isSuccess ? (
          <GlowCard color="primary" intensity="subtle" className="border-border/50">
            <CardHeader className="space-y-1 text-center">
              <div className="flex justify-center mb-4">
                <div className="rounded-full bg-success/10 p-4">
                  <CheckCircle className="h-8 w-8 text-success" />
                </div>
              </div>
              <CardTitle className="text-2xl">Senha Redefinida!</CardTitle>
              <CardDescription className="text-base">
                Sua senha foi alterada com sucesso.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-sm text-muted-foreground">
                Você será redirecionado para o login em instantes...
              </p>
            </CardContent>
            <CardFooter>
              <Button asChild className="w-full" variant="gradient">
                <Link href="/login">Ir para Login</Link>
              </Button>
            </CardFooter>
          </GlowCard>
        ) : (
          <GlowCard color="primary" intensity="subtle" className="border-border/50">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl">Redefinir Senha</CardTitle>
              <CardDescription>
                Crie uma senha forte para proteger sua conta
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit(onSubmit)}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Nova Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Digite sua nova senha"
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

                  {/* Password strength indicator */}
                  {password.length > 0 && (
                    <PasswordStrengthIndicator password={password} />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Confirme sua nova senha"
                      {...register("confirmPassword")}
                      disabled={isLoading}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      disabled={isLoading}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
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
                  Redefinir Senha
                </Button>

                <p className="text-sm text-center text-muted-foreground">
                  Lembrou a senha?{" "}
                  <Link href="/login" className="text-primary hover:underline">
                    Faça login
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

function ResetPasswordLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-convertfy-purple via-convertfy-blue to-convertfy-cyan flex items-center justify-center">
              <span className="text-2xl font-bold text-white">C</span>
            </div>
          </div>
          <h1 className="text-2xl font-bold gradient-text">Convertfy Admin</h1>
          <p className="text-muted-foreground mt-1">Sistema de Gestão para Agências</p>
        </div>
        <Card className="border-border/50">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordLoading />}>
      <ResetPasswordContent />
    </Suspense>
  )
}
