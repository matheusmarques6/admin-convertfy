"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowLeft, Loader2, Mail, CheckCircle, AlertTriangle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/lib/hooks/use-toast"
import { rateLimitService } from "@/lib/services"

const forgotPasswordSchema = z.object({
  email: z.string().email("Email inválido"),
})

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [sentEmail, setSentEmail] = useState("")
  const [isRateLimited, setIsRateLimited] = useState(false)
  const [isDailyLimited, setIsDailyLimited] = useState(false)
  const [retryAfter, setRetryAfter] = useState(0)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  async function onSubmit(data: ForgotPasswordForm) {
    setIsLoading(true)

    try {
      const supabase = createClient()
      const normalizedEmail = data.email.toLowerCase().trim()

      // Step 1: Check daily email limit (low & slow attack protection)
      // This prevents attackers from spreading attempts over 24h
      let dailyCheck
      try {
        dailyCheck = await rateLimitService.checkAndRecord(
          normalizedEmail,
          "daily_email"
        )
        console.log("Daily check result:", dailyCheck)
      } catch (rateLimitError) {
        console.error("Daily rate limit check failed:", rateLimitError)
        // Continue without daily limit if check fails
        dailyCheck = { isLimited: false, remainingAttempts: 10, retryAfterSeconds: 0 }
      }

      if (dailyCheck.isLimited) {
        setIsDailyLimited(true)
        setRetryAfter(dailyCheck.retryAfterSeconds)

        // Log the blocked attempt (generic - don't reveal daily vs per-minute)
        await rateLimitService.logPasswordResetAudit({
          email: normalizedEmail,
          accountType: "admin",
          action: "fail",
          success: false,
          errorMessage: "Daily limit exceeded",
          metadata: { limitType: "daily_email" }
        })

        toast({
          variant: "destructive",
          title: "Limite diário atingido",
          description: "Tente novamente amanhã.",
        })
        return
      }

      // Step 2: Check password_reset rate limit (burst protection)
      // Uses atomic checkAndRecord for single DB call
      let rateLimitResult
      try {
        rateLimitResult = await rateLimitService.checkAndRecord(
          normalizedEmail,
          "password_reset"
        )
        console.log("Password reset rate limit result:", rateLimitResult)
      } catch (rateLimitError) {
        console.error("Password reset rate limit check failed:", rateLimitError)
        // Continue without rate limit if check fails
        rateLimitResult = { isLimited: false, remainingAttempts: 3, retryAfterSeconds: 0 }
      }

      if (rateLimitResult.isLimited) {
        setIsRateLimited(true)
        setRetryAfter(rateLimitResult.retryAfterSeconds)

        // Log the blocked attempt
        await rateLimitService.logPasswordResetAudit({
          email: normalizedEmail,
          accountType: "admin",
          action: "fail",
          success: false,
          errorMessage: "Rate limited",
          metadata: {
            retryAfterSeconds: rateLimitResult.retryAfterSeconds,
            limitType: "password_reset"
          }
        })

        toast({
          variant: "destructive",
          title: "Muitas tentativas",
          description: `Aguarde ${rateLimitService.formatRetryTime(rateLimitResult.retryAfterSeconds)} antes de tentar novamente.`,
        })
        return
      }

      // Log the reset request
      await rateLimitService.logPasswordResetAudit({
        email: normalizedEmail,
        accountType: "admin",
        action: "request",
        success: true,
      })

      // Always attempt to send the reset email
      // We don't check if email exists to avoid email enumeration
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (resetError) {
        console.error("Supabase reset email error:", resetError)
        toast({
          variant: "destructive",
          title: "Erro ao enviar email",
          description: resetError.message,
        })
        return
      }

      // Always show success message (security: don't reveal if email exists)
      setSentEmail(normalizedEmail)
      setEmailSent(true)

      // Show remaining attempts if getting close to limit
      if (rateLimitResult.remainingAttempts <= 2 && rateLimitResult.remainingAttempts > 0) {
        toast({
          title: "Verificando...",
          description: `Se este email estiver cadastrado, você receberá instruções. Tentativas restantes: ${rateLimitResult.remainingAttempts}`,
        })
      } else {
        toast({
          title: "Verificando...",
          description: "Se este email estiver cadastrado, você receberá um link de recuperação.",
        })
      }
    } catch (error) {
      console.error("Forgot password error:", error)
      toast({
        variant: "destructive",
        title: "Erro inesperado",
        description: "Tente novamente mais tarde",
      })
    } finally {
      setIsLoading(false)
    }
  }

  async function handleResend() {
    if (sentEmail) {
      // Check daily limit first (don't record, just check)
      const dailyCheck = await rateLimitService.checkAndRecord(
        sentEmail,
        "daily_email"
      )

      if (dailyCheck.isLimited) {
        setIsDailyLimited(true)
        setRetryAfter(dailyCheck.retryAfterSeconds)
        toast({
          variant: "destructive",
          title: "Limite diário atingido",
          description: "Tente novamente amanhã.",
        })
        return
      }

      // Check password_reset rate limit
      const rateLimitCheck = await rateLimitService.checkAndRecord(
        sentEmail,
        "password_reset"
      )

      if (rateLimitCheck.isLimited) {
        setIsRateLimited(true)
        setRetryAfter(rateLimitCheck.retryAfterSeconds)
        toast({
          variant: "destructive",
          title: "Muitas tentativas",
          description: `Aguarde ${rateLimitService.formatRetryTime(rateLimitCheck.retryAfterSeconds)} antes de tentar novamente.`,
        })
        return
      }
    }

    setEmailSent(false)
    setIsRateLimited(false)
    setIsDailyLimited(false)
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

        {isDailyLimited ? (
          <Card className="border-border/50">
            <CardHeader className="space-y-1 text-center">
              <div className="flex justify-center mb-4">
                <div className="rounded-full bg-amber-500/10 p-4">
                  <AlertTriangle className="h-8 w-8 text-amber-500" />
                </div>
              </div>
              <CardTitle className="text-2xl">Limite Diário Atingido</CardTitle>
              <CardDescription className="text-base">
                Você atingiu o limite de solicitações de recuperação por hoje.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                Por segurança, tente novamente amanhã.
              </p>
              <p className="text-xs text-muted-foreground">
                Se você não solicitou a recuperação de senha, pode ignorar este aviso.
              </p>
            </CardContent>
            <CardFooter>
              <Button asChild variant="ghost" className="w-full">
                <Link href="/login">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar ao login
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ) : isRateLimited ? (
          <Card className="border-border/50">
            <CardHeader className="space-y-1 text-center">
              <div className="flex justify-center mb-4">
                <div className="rounded-full bg-amber-500/10 p-4">
                  <AlertTriangle className="h-8 w-8 text-amber-500" />
                </div>
              </div>
              <CardTitle className="text-2xl">Muitas Tentativas</CardTitle>
              <CardDescription className="text-base">
                Você excedeu o limite de tentativas de recuperação de senha.
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
                Se você não solicitou a recuperação de senha, pode ignorar este aviso.
              </p>
            </CardContent>
            <CardFooter>
              <Button asChild variant="ghost" className="w-full">
                <Link href="/login">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar ao login
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ) : emailSent ? (
          <Card className="border-border/50">
            <CardHeader className="space-y-1 text-center">
              <div className="flex justify-center mb-4">
                <div className="rounded-full bg-emerald-500/10 p-4">
                  <CheckCircle className="h-8 w-8 text-emerald-500" />
                </div>
              </div>
              <CardTitle className="text-2xl">Verifique seu Email</CardTitle>
              <CardDescription className="text-base">
                Se houver uma conta associada a este email, você receberá um link de recuperação.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="font-medium text-lg">{sentEmail}</p>
              <p className="text-sm text-muted-foreground">
                Verifique sua caixa de entrada e spam. O link expira em 1 hora.
              </p>
              <p className="text-xs text-muted-foreground">
                Não recebeu? Verifique se o email está correto ou tente novamente.
              </p>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleResend}
              >
                <Mail className="mr-2 h-4 w-4" />
                Tentar novamente
              </Button>
              <Button asChild variant="ghost" className="w-full">
                <Link href="/login">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar ao login
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ) : (
          <Card className="border-border/50">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl">Recuperar Senha</CardTitle>
              <CardDescription>
                Digite seu email para receber um link de recuperação
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
              </CardContent>

              <CardFooter className="flex flex-col space-y-4">
                <Button
                  type="submit"
                  className="w-full"
                  variant="gradient"
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enviar Link de Recuperação
                </Button>

                <Button asChild variant="ghost" className="w-full">
                  <Link href="/login">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar ao login
                  </Link>
                </Button>
              </CardFooter>
            </form>
          </Card>
        )}
      </div>
    </div>
  )
}
