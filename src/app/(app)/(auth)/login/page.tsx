"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/ui/form-field"
import { toast } from "@/lib/hooks/use-toast"
import { rateLimitService } from "@/lib/services"
import { AuthLayout } from "@/components/auth/auth-layout"

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
  const [error, setError] = useState("")

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: LoginForm) {
    setIsLoading(true)
    setError("")

    try {
      const supabase = createClient()
      const normalizedEmail = data.email.toLowerCase().trim()

      const rateLimitResult = await rateLimitService.checkAndRecord(
        normalizedEmail,
        "login_attempt"
      )

      if (rateLimitResult.isLimited) {
        setIsRateLimited(true)
        setRetryAfter(rateLimitResult.retryAfterSeconds)
        setError("Email ou senha incorretos")
        return
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (authError) {
        setError("Email ou senha incorretos")
        return
      }

      await rateLimitService.clearRateLimit(normalizedEmail, "login_attempt")

      toast({
        title: "Login realizado com sucesso!",
        description: "Redirecionando para o dashboard...",
      })

      router.push("/admin/dashboard")
      router.refresh()
    } catch {
      setError("Erro inesperado. Tente novamente mais tarde.")
    } finally {
      setIsLoading(false)
    }
  }

  if (isRateLimited) {
    return (
      <AuthLayout>
        <div className="text-center space-y-4">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-[#EAEDF3]">
            Conta Temporariamente Bloqueada
          </h1>
          <p className="text-sm text-gray-500 dark:text-[#8B92A5]">
            Muitas tentativas de login. Aguarde{" "}
            <span className="font-semibold text-gray-900 dark:text-[#EAEDF3]">
              {rateLimitService.formatRetryTime(retryAfter)}
            </span>{" "}
            antes de tentar novamente.
          </p>
          <div className="space-y-2 pt-4">
            <Button asChild variant="secondary" size="lg" className="w-full">
              <Link href="/forgot-password">Recuperar Senha</Link>
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="w-full"
              onClick={() => setIsRateLimited(false)}
            >
              <Icon icon={ArrowLeft} size={16} className="mr-2" />
              Tentar novamente
            </Button>
          </div>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div className="text-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-[#EAEDF3]">
          Entrar na sua conta
        </h1>
        <p className="text-sm text-gray-500 dark:text-[#8B92A5] mt-1">
          Acesse o painel da Convertfy
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-[6px] bg-[#FEF2F2] dark:bg-[#3B1111] text-sm text-[#991B1B] dark:text-[#FCA5A5]">
          {error}
        </div>
      )}

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

        <FormField label="Senha" required error={errors.password?.message}>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
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
        </FormField>

        <div className="flex items-center justify-end">
          <Link
            href="/forgot-password"
            className="text-sm text-[#4E62D8] dark:text-[#7B8CEA] hover:underline min-h-[44px] flex items-center"
          >
            Esqueci a senha
          </Link>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={isLoading}
        >
          {isLoading && <Icon icon={Loader2} size={16} className="mr-2 animate-spin" />}
          Entrar
        </Button>
      </form>

      <p className="text-sm text-gray-500 dark:text-[#8B92A5] text-center mt-6">
        Não tem conta?{" "}
        <Link
          href="/register"
          className="text-[#4E62D8] dark:text-[#7B8CEA] hover:underline font-medium"
        >
          Criar conta
        </Link>
      </p>
    </AuthLayout>
  )
}
