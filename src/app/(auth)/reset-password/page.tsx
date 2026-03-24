"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Eye, EyeOff, Loader2, AlertTriangle, Check, X } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/ui/form-field"
import { toast } from "@/lib/hooks/use-toast"
import { rateLimitService } from "@/lib/services"
import { AuthLayout } from "@/components/auth/auth-layout"
import { cn } from "@/lib/utils"

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
    weak: "bg-[#991B1B] dark:bg-[#FCA5A5]",
    medium: "bg-[#D97706] dark:bg-[#FBBF24]",
    strong: "bg-[#16A34A] dark:bg-[#4ADE80]",
  }

  const strengthTextColors = {
    weak: "text-[#991B1B] dark:text-[#FCA5A5]",
    medium: "text-[#D97706] dark:text-[#FBBF24]",
    strong: "text-[#16A34A] dark:text-[#4ADE80]",
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
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i <= metCount
                  ? strengthColors[strengthLevel]
                  : "bg-gray-100 dark:bg-[#242836]"
              )}
            />
          ))}
        </div>
        <p className="text-xs text-gray-500 dark:text-[#8B92A5]">
          Força da senha:{" "}
          <span className={cn("font-medium", strengthTextColors[strengthLevel])}>
            {strengthLevel === "strong" ? "Forte" : strengthLevel === "medium" ? "Média" : "Fraca"}
          </span>
        </p>
      </div>

      {/* Requirements checklist */}
      <ul className="space-y-1.5">
        {rules.map((rule) => (
          <li
            key={rule.key}
            className={cn(
              "flex items-center gap-2 text-xs",
              rule.met
                ? "text-[#16A34A] dark:text-[#4ADE80]"
                : "text-gray-400 dark:text-[#5C6378]"
            )}
          >
            <Icon icon={rule.met ? Check : X} customSize={12} />
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

  const watchedPassword = watch("password", "")

  useEffect(() => {
    setPassword(watchedPassword)
  }, [watchedPassword])

  useEffect(() => {
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

      await rateLimitService.logPasswordResetAudit({
        email: user.email,
        accountType: "admin",
        action: "complete",
        success: false,
      })

      const { error } = await supabase.auth.updateUser({
        password: data.password,
      })

      if (error) {
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

      await rateLimitService.logPasswordResetAudit({
        email: user.email,
        accountType: "admin",
        action: "complete",
        success: true,
      })

      await rateLimitService.clearRateLimit(user.email, "password_reset")

      setIsSuccess(true)

      toast({
        title: "Senha redefinida!",
        description: "Sua senha foi alterada com sucesso.",
      })

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

  // Expired state
  if (isExpired) {
    return (
      <AuthLayout>
        <div className="text-center space-y-4">
          <Icon
            icon={AlertTriangle}
            size={24}
            className="text-[#D97706] dark:text-[#FBBF24] mx-auto"
          />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-[#EAEDF3]">
            Link Expirado
          </h1>
          <p className="text-sm text-gray-500 dark:text-[#8B92A5]">
            O link de recuperação expirou ou é inválido.
            Os links são válidos por 1 hora.
          </p>
          <Button asChild variant="primary" size="lg" className="w-full">
            <Link href="/forgot-password">Solicitar Novo Link</Link>
          </Button>
        </div>
      </AuthLayout>
    )
  }

  // Success state
  if (isSuccess) {
    return (
      <AuthLayout>
        <div className="text-center space-y-4">
          <div className="w-10 h-10 rounded-full bg-[#DCFCE7] dark:bg-[rgba(74,222,128,0.1)] flex items-center justify-center mx-auto">
            <Icon icon={Check} size={20} className="text-[#16A34A] dark:text-[#4ADE80]" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-[#EAEDF3]">
            Senha Redefinida!
          </h1>
          <p className="text-sm text-gray-500 dark:text-[#8B92A5]">
            Sua senha foi alterada com sucesso. Você será redirecionado para o login em instantes...
          </p>
          <Button asChild variant="primary" size="lg" className="w-full">
            <Link href="/login">Ir para Login</Link>
          </Button>
        </div>
      </AuthLayout>
    )
  }

  // Form state
  return (
    <AuthLayout>
      <div className="text-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-[#EAEDF3]">
          Redefinir Senha
        </h1>
        <p className="text-sm text-gray-500 dark:text-[#8B92A5] mt-1">
          Crie uma senha forte para proteger sua conta
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Nova Senha" required error={errors.password?.message}>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Digite sua nova senha"
              className="h-11 pr-10"
              {...register("password")}
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-[#8B92A5] transition-colors"
              tabIndex={-1}
            >
              <Icon icon={showPassword ? EyeOff : Eye} size={16} />
            </button>
          </div>
          {password.length > 0 && (
            <PasswordStrengthIndicator password={password} />
          )}
        </FormField>

        <FormField label="Confirmar Nova Senha" required error={errors.confirmPassword?.message}>
          <div className="relative">
            <Input
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Confirme sua nova senha"
              className="h-11 pr-10"
              {...register("confirmPassword")}
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-[#8B92A5] transition-colors"
              tabIndex={-1}
            >
              <Icon icon={showConfirmPassword ? EyeOff : Eye} size={16} />
            </button>
          </div>
        </FormField>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={isLoading}
        >
          {isLoading && <Icon icon={Loader2} size={16} className="mr-2 animate-spin" />}
          Redefinir Senha
        </Button>

        <p className="text-sm text-gray-500 dark:text-[#8B92A5] text-center">
          Lembrou a senha?{" "}
          <Link
            href="/login"
            className="text-[#4E62D8] dark:text-[#7B8CEA] hover:underline font-medium"
          >
            Faça login
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}

function ResetPasswordLoading() {
  return (
    <AuthLayout>
      <div className="flex items-center justify-center py-12">
        <Icon icon={Loader2} size={24} className="animate-spin text-gray-400 dark:text-[#5C6378]" />
      </div>
    </AuthLayout>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordLoading />}>
      <ResetPasswordContent />
    </Suspense>
  )
}
