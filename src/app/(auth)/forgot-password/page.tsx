"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowLeft, Loader2, Mail, AlertTriangle } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/ui/form-field"
import { toast } from "@/lib/hooks/use-toast"
import { rateLimitService } from "@/lib/services"
import { AuthLayout } from "@/components/auth/auth-layout"

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
      let dailyCheck
      try {
        dailyCheck = await rateLimitService.checkAndRecord(
          normalizedEmail,
          "daily_email"
        )
      } catch (rateLimitError) {
        console.error("Daily rate limit check failed:", rateLimitError)
        dailyCheck = { isLimited: false, remainingAttempts: 10, retryAfterSeconds: 0 }
      }

      if (dailyCheck.isLimited) {
        setIsDailyLimited(true)
        setRetryAfter(dailyCheck.retryAfterSeconds)

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
      let rateLimitResult
      try {
        rateLimitResult = await rateLimitService.checkAndRecord(
          normalizedEmail,
          "password_reset"
        )
      } catch (rateLimitError) {
        console.error("Password reset rate limit check failed:", rateLimitError)
        rateLimitResult = { isLimited: false, remainingAttempts: 3, retryAfterSeconds: 0 }
      }

      if (rateLimitResult.isLimited) {
        setIsRateLimited(true)
        setRetryAfter(rateLimitResult.retryAfterSeconds)

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

      // Always attempt to send — don't reveal if email exists
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

      setSentEmail(normalizedEmail)
      setEmailSent(true)

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

  // Daily limit state
  if (isDailyLimited) {
    return (
      <AuthLayout>
        <div className="text-center space-y-4">
          <Icon
            icon={AlertTriangle}
            size={24}
            className="text-[#D97706] dark:text-[#FBBF24] mx-auto"
          />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-[#EAEDF3]">
            Limite Diário Atingido
          </h1>
          <p className="text-sm text-gray-500 dark:text-[#8B92A5]">
            Você atingiu o limite de solicitações de recuperação por hoje.
            Por segurança, tente novamente amanhã.
          </p>
          <p className="text-xs text-gray-400 dark:text-[#5C6378]">
            Se você não solicitou a recuperação de senha, pode ignorar este aviso.
          </p>
          <Button asChild variant="ghost" size="lg" className="w-full">
            <Link href="/login">
              <Icon icon={ArrowLeft} size={16} className="mr-2" />
              Voltar ao login
            </Link>
          </Button>
        </div>
      </AuthLayout>
    )
  }

  // Rate limited state
  if (isRateLimited) {
    return (
      <AuthLayout>
        <div className="text-center space-y-4">
          <Icon
            icon={AlertTriangle}
            size={24}
            className="text-[#D97706] dark:text-[#FBBF24] mx-auto"
          />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-[#EAEDF3]">
            Muitas Tentativas
          </h1>
          <p className="text-sm text-gray-500 dark:text-[#8B92A5]">
            Por segurança, aguarde{" "}
            <span className="font-semibold text-gray-900 dark:text-[#EAEDF3]">
              {rateLimitService.formatRetryTime(retryAfter)}
            </span>{" "}
            antes de tentar novamente.
          </p>
          <Button asChild variant="ghost" size="lg" className="w-full">
            <Link href="/login">
              <Icon icon={ArrowLeft} size={16} className="mr-2" />
              Voltar ao login
            </Link>
          </Button>
        </div>
      </AuthLayout>
    )
  }

  // Email sent state
  if (emailSent) {
    return (
      <AuthLayout>
        <div className="text-center space-y-4">
          <Icon
            icon={Mail}
            size={24}
            className="text-[#4E62D8] dark:text-[#7B8CEA] mx-auto"
          />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-[#EAEDF3]">
            Verifique seu Email
          </h1>
          <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3]">
            {sentEmail}
          </p>
          <p className="text-sm text-gray-500 dark:text-[#8B92A5]">
            Se houver uma conta associada a este email, você receberá um link de recuperação.
            Verifique sua caixa de entrada e spam. O link expira em 1 hora.
          </p>
          <div className="space-y-2 pt-2">
            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={handleResend}
            >
              <Icon icon={Mail} size={16} className="mr-2" />
              Tentar novamente
            </Button>
            <Button asChild variant="ghost" size="lg" className="w-full">
              <Link href="/login">
                <Icon icon={ArrowLeft} size={16} className="mr-2" />
                Voltar ao login
              </Link>
            </Button>
          </div>
        </div>
      </AuthLayout>
    )
  }

  // Default form state
  return (
    <AuthLayout>
      <div className="text-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-[#EAEDF3]">
          Recuperar Senha
        </h1>
        <p className="text-sm text-gray-500 dark:text-[#8B92A5] mt-1">
          Digite seu email para receber um link de recuperação
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Email" required error={errors.email?.message}>
          <Input
            type="email"
            placeholder="seu@email.com"
            className="h-11"
            {...register("email")}
            disabled={isLoading}
          />
        </FormField>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={isLoading}
        >
          {isLoading && <Icon icon={Loader2} size={16} className="mr-2 animate-spin" />}
          Enviar Link de Recuperação
        </Button>

        <Button asChild variant="ghost" size="lg" className="w-full">
          <Link href="/login">
            <Icon icon={ArrowLeft} size={16} className="mr-2" />
            Voltar ao login
          </Link>
        </Button>
      </form>
    </AuthLayout>
  )
}
