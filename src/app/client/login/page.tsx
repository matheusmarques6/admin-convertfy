"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/ui/form-field"
import { createClient } from "@/lib/supabase/client"
import { AuthLayout } from "@/components/auth/auth-layout"

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().email("Email invalido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
})

type LoginForm = z.infer<typeof loginSchema>

// ---------------------------------------------------------------------------
// Error messages from URL params
// ---------------------------------------------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
  link_invalido: "Link de acesso invalido. Solicite um novo link.",
  link_expirado: "Link de acesso expirado. Solicite um novo link.",
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ClientLoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  // Check URL params for error messages (e.g. expired magic links)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const errorParam = params.get("error")
    if (errorParam && ERROR_MESSAGES[errorParam]) {
      setError(ERROR_MESSAGES[errorParam])
    }
  }, [])

  async function onSubmit(data: LoginForm) {
    setIsLoading(true)
    setError("")

    try {
      const supabase = createClient()

      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email.toLowerCase().trim(),
        password: data.password,
      })

      if (signInError) {
        setError("Email ou senha incorretos")
        setIsLoading(false)
        return
      }

      // Verify this is a portal user (wizard check disparado em paralelo —
      // só é lido se o verify passar)
      const wizardPromise = fetch("/api/portal/onboarding/wizard").catch(() => null)
      const response = await fetch("/api/portal/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: authData.user.id }),
      })

      const verifyData = await response.json()

      if (!response.ok) {
        await supabase.auth.signOut()
        setError(verifyData.error || "Esta conta nao tem acesso ao portal")
        setIsLoading(false)
        return
      }

      // Must change password?
      if (verifyData.mustChangePassword) {
        router.push("/client/change-password")
        router.refresh()
        return
      }

      // Check if onboarding wizard is incomplete
      try {
        const wizardRes = await wizardPromise
        if (!wizardRes) throw new Error("wizard check indisponível")
        const wizardData = await wizardRes.json()
        if (wizardRes.ok && wizardData.data && !wizardData.data.wizardComplete && !wizardData.data.hasApprovedOnboarding) {
          const steps = wizardData.steps
          if (steps && (!steps.personalInfo?.complete || !steps.storeData?.complete || !steps.klaviyoKeys?.complete)) {
            router.push("/client/onboarding/wizard")
            router.refresh()
            return
          }
        }
      } catch {
        // If wizard check fails, proceed to dashboard
      }

      router.push("/client/dashboard")
      router.refresh()
    } catch {
      setError("Erro de conexao. Tente novamente.")
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="text-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-[#EAEDF3]">
          Acessar Portal
        </h1>
        <p className="text-sm text-gray-500 dark:text-[#8B92A5] mt-1">
          Acompanhe os resultados da sua loja
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
            autoComplete="email"
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
              autoComplete="current-password"
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
            className="text-sm text-[#4E8FFF] dark:text-[#7B8CEA] hover:underline min-h-[44px] flex items-center"
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

      {/* No "Create account" link — clients are created by admin */}
      <p className="text-xs text-gray-400 dark:text-[#5C6378] text-center mt-6">
        Precisa de acesso? Fale com seu agente Convertfy.
      </p>
    </AuthLayout>
  )
}
