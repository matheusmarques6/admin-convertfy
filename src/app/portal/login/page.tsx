"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { createClient } from "@/lib/supabase/client"

const ERROR_MESSAGES: Record<string, string> = {
  link_invalido: "Link de acesso inválido. Solicite um novo link.",
  link_expirado: "Link de acesso expirado. Solicite um novo link.",
}

export default function PortalLoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const errorParam = params.get("error")
    if (errorParam && ERROR_MESSAGES[errorParam]) {
      setError(ERROR_MESSAGES[errorParam])
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const supabase = createClient()

      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase(),
        password,
      })

      if (signInError) {
        console.error("Sign in error:", signInError)
        setError("Email ou senha incorretos")
        setLoading(false)
        return
      }

      const response = await fetch("/api/portal/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: authData.user.id }),
      })

      const data = await response.json()

      if (!response.ok) {
        await supabase.auth.signOut()
        setError(data.error || "Esta conta não tem acesso ao portal")
        setLoading(false)
        return
      }

      if (data.mustChangePassword) {
        window.location.href = "/portal/change-password"
        return
      }

      try {
        const wizardRes = await fetch("/api/portal/onboarding/wizard")
        const wizardData = await wizardRes.json()
        if (wizardRes.ok && wizardData.data && !wizardData.data.wizardComplete && !wizardData.data.hasApprovedOnboarding) {
          const steps = wizardData.steps
          if (steps && (!steps.personalInfo?.complete || !steps.storeData?.complete || !steps.klaviyoKeys?.complete)) {
            window.location.href = "/portal/onboarding/wizard"
            return
          }
        }
      } catch {
        // If wizard check fails, proceed to dashboard
      }

      window.location.href = "/portal/dashboard"
    } catch (err) {
      console.error("Login error:", err)
      setError("Erro de conexão. Tente novamente.")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Brand */}
      <div className="hidden lg:flex lg:w-[480px] bg-[#0B0E14] flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-primary/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-[#05AFF2]/15 rounded-full blur-[100px]" />

        <div className="relative z-10 px-12 text-center">
          <Image
            src="/images/logo da convertfy com escrito branco.png"
            alt="Convertfy"
            width={220}
            height={50}
            className="mx-auto mb-8"
            priority
          />
          <h2 className="text-2xl font-bold text-white mb-3">Portal do Cliente</h2>
          <p className="text-slate-400 text-[15px] leading-relaxed max-w-sm">
            Acompanhe suas métricas, campanhas e resultados de email marketing em tempo real.
          </p>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center bg-[#F8F9FB] dark:bg-[#0B0E14] px-6">
        <div className="w-full max-w-[400px]">
          {/* Mobile Logo */}
          <div className="lg:hidden flex flex-col items-center mb-10">
            <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-lg shadow-primary/25">
              <span className="text-white font-bold text-xl">C</span>
            </div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Convertfy</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Portal do Cliente</p>
          </div>

          {/* Form Card */}
          <div className="bg-white dark:bg-[#151922] rounded-2xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-8">
            <div className="mb-6">
              <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-1">Bem-vindo de volta</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Entre com suas credenciais para acessar o portal</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <Alert variant="destructive" className="bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400">
                  <AlertDescription className="text-[13px]">{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-[13px] font-medium text-slate-700 dark:text-slate-200">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="email"
                  className="h-11 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-primary focus:ring-primary/20"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-[13px] font-medium text-slate-700 dark:text-slate-200">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Sua senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="current-password"
                    className="h-11 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-primary focus:ring-primary/20 pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={loading}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-primary hover:bg-primary/85 text-white font-medium shadow-lg shadow-primary/20 transition-all duration-200"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-[13px] text-slate-500 dark:text-slate-400">
                Problemas para acessar?{" "}
                <a href="mailto:suporte@convertfy.com.br" className="text-primary hover:text-primary/85 font-medium">
                  Entre em contato
                </a>
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
            &copy; {new Date().getFullYear()} Convertfy. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  )
}
