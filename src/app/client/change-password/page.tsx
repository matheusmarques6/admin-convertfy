"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Loader2, Lock, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function ChangePasswordPage() {
  const router = useRouter()
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/portal/auth")
        const data = await response.json()

        if (!response.ok || !data.authenticated) {
          router.push("/client/login")
          return
        }

        if (!data.user?.mustChangePassword) {
          router.push("/client/dashboard")
          return
        }
      } catch (err) {
        console.error("Auth check error:", err)
        router.push("/client/login")
      } finally {
        setChecking(false)
      }
    }

    checkAuth()
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 8) {
      setError("A senha deve ter no mínimo 8 caracteres")
      return
    }

    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem")
      return
    }

    setLoading(true)

    try {
      const response = await fetch("/api/portal/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword, confirmPassword }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Erro ao alterar senha")
        return
      }

      setSuccess(true)

      setTimeout(() => {
        window.location.href = "/client/dashboard"
      }, 2000)
    } catch (err) {
      console.error("Change password error:", err)
      setError("Erro de conexão. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  const hasMinLength = newPassword.length >= 8
  const hasUpperCase = /[A-Z]/.test(newPassword)
  const hasLowerCase = /[a-z]/.test(newPassword)
  const hasNumber = /[0-9]/.test(newPassword)
  const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FB] dark:bg-[#0B0E14]">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FB] dark:bg-[#0B0E14] px-4">
        <div className="bg-white dark:bg-[#151922] rounded-2xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-10 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">Senha alterada com sucesso!</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Você será redirecionado para o dashboard em instantes...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FB] dark:bg-[#0B0E14] px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-lg shadow-primary/25">
            <Lock className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Criar Nova Senha</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm text-center mt-1">
            Por segurança, crie uma nova senha para continuar
          </p>
        </div>

        <div className="bg-white dark:bg-[#151922] rounded-2xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
          <div className="px-8 pt-8 pb-4 text-center">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Primeira vez acessando?</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Escolha uma senha segura para proteger sua conta</p>
          </div>
          <div className="px-8 pb-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive" className="bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20">
                  <AlertDescription className="text-red-700 dark:text-red-400 text-[13px]">{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-[13px] font-medium text-slate-700 dark:text-slate-200">Nova Senha</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Digite sua nova senha"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="new-password"
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

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-[13px] font-medium text-slate-700 dark:text-slate-200">Confirmar Senha</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirme sua nova senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="new-password"
                    className="h-11 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-primary focus:ring-primary/20 pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    disabled={loading}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Password Requirements */}
              <div className="space-y-2 text-sm">
                <p className="font-medium text-slate-500 dark:text-slate-400 text-[13px]">Requisitos da senha:</p>
                <ul className="space-y-1.5">
                  <RequirementItem met={hasMinLength}>Mínimo de 8 caracteres</RequirementItem>
                  <RequirementItem met={hasUpperCase}>Uma letra maiúscula</RequirementItem>
                  <RequirementItem met={hasLowerCase}>Uma letra minúscula</RequirementItem>
                  <RequirementItem met={hasNumber}>Um número</RequirementItem>
                  <RequirementItem met={passwordsMatch}>Senhas coincidem</RequirementItem>
                </ul>
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-primary hover:bg-primary/85 text-white font-medium shadow-lg shadow-primary/20"
                disabled={loading || !hasMinLength || !passwordsMatch}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Alterando...
                  </>
                ) : (
                  "Criar Senha"
                )}
              </Button>
            </form>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
          &copy; {new Date().getFullYear()} Convertfy. Todos os direitos reservados.
        </p>
      </div>
    </div>
  )
}

function RequirementItem({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-2 text-[13px] ${met ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${met ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} />
      {children}
    </li>
  )
}
