"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Loader2, Lock, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GlowCard } from "@/components/ui/glow-card"
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

  // Check if user is authenticated and needs to change password
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/portal/auth")
        const data = await response.json()

        if (!response.ok || !data.authenticated) {
          // Not authenticated, redirect to login
          router.push("/portal/login")
          return
        }

        // If user doesn't need to change password, redirect to dashboard
        if (!data.user?.mustChangePassword) {
          router.push("/portal/dashboard")
          return
        }
      } catch (err) {
        console.error("Auth check error:", err)
        router.push("/portal/login")
      } finally {
        setChecking(false)
      }
    }

    checkAuth()
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate passwords
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ newPassword, confirmPassword }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Erro ao alterar senha")
        return
      }

      setSuccess(true)

      // Redirect to dashboard after short delay with hard navigation
      setTimeout(() => {
        window.location.href = "/portal/dashboard"
      }, 2000)
    } catch (err) {
      console.error("Change password error:", err)
      setError("Erro de conexão. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  // Password strength indicators
  const hasMinLength = newPassword.length >= 8
  const hasUpperCase = /[A-Z]/.test(newPassword)
  const hasLowerCase = /[a-z]/.test(newPassword)
  const hasNumber = /[0-9]/.test(newPassword)
  const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <GlowCard color="primary" intensity="subtle" className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
                <CheckCircle className="h-8 w-8 text-success" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Senha alterada com sucesso!</h2>
              <p className="text-muted-foreground">
                Você será redirecionado para o dashboard em instantes...
              </p>
            </div>
          </CardContent>
        </GlowCard>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-4">
            <Lock className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Criar Nova Senha</h1>
          <p className="text-muted-foreground text-center">
            Por segurança, crie uma nova senha para continuar
          </p>
        </div>

        <GlowCard color="primary" intensity="subtle">
          <CardHeader className="text-center">
            <CardTitle>Primeira vez acessando?</CardTitle>
            <CardDescription>
              Escolha uma senha segura para proteger sua conta
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="newPassword">Nova Senha</Label>
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
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={loading}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Senha</Label>
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
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    disabled={loading}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Password Requirements */}
              <div className="space-y-2 text-sm">
                <p className="font-medium text-muted-foreground">Requisitos da senha:</p>
                <ul className="space-y-1">
                  <li className={`flex items-center gap-2 ${hasMinLength ? "text-success" : "text-muted-foreground"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${hasMinLength ? "bg-success" : "bg-muted-foreground"}`} />
                    Mínimo de 8 caracteres
                  </li>
                  <li className={`flex items-center gap-2 ${hasUpperCase ? "text-success" : "text-muted-foreground"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${hasUpperCase ? "bg-success" : "bg-muted-foreground"}`} />
                    Uma letra maiúscula
                  </li>
                  <li className={`flex items-center gap-2 ${hasLowerCase ? "text-success" : "text-muted-foreground"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${hasLowerCase ? "bg-success" : "bg-muted-foreground"}`} />
                    Uma letra minúscula
                  </li>
                  <li className={`flex items-center gap-2 ${hasNumber ? "text-success" : "text-muted-foreground"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${hasNumber ? "bg-success" : "bg-muted-foreground"}`} />
                    Um número
                  </li>
                  <li className={`flex items-center gap-2 ${passwordsMatch ? "text-success" : "text-muted-foreground"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${passwordsMatch ? "bg-success" : "bg-muted-foreground"}`} />
                    Senhas coincidem
                  </li>
                </ul>
              </div>

              <Button
                type="submit"
                className="w-full"
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
          </CardContent>
        </GlowCard>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Convertfy. Todos os direitos reservados.
        </p>
      </div>
    </div>
  )
}
