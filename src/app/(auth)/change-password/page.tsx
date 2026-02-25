"use client"

import { useState } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Lock, Loader2, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/lib/hooks/use-toast"

const changePasswordSchema = z
  .object({
    newPassword: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "As senhas não conferem",
    path: ["confirmPassword"],
  })

type ChangePasswordForm = z.infer<typeof changePasswordSchema>

export default function ChangePasswordPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const { toast } = useToast()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
  })

  async function onSubmit(data: ChangePasswordForm) {
    setIsLoading(true)

    try {
      // Try the general auth endpoint first (for org members/agents)
      // Falls back to portal-users endpoint for portal users
      let response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_password: data.newPassword }),
      })

      // If not found or unauthorized, try portal users endpoint
      if (response.status === 404) {
        response = await fetch("/api/portal-users/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ new_password: data.newPassword }),
        })
      }

      const result = await response.json()

      if (response.ok) {
        toast({
          title: "Senha alterada com sucesso!",
          description: "Você será redirecionado para o dashboard.",
        })
        // Use window.location for full page reload to ensure session cookies are refreshed
        window.location.href = "/dashboard"
      } else {
        toast({
          title: "Erro ao alterar senha",
          description: result.error || "Tente novamente",
          variant: "destructive",
        })
      }
    } catch {
      toast({
        title: "Erro ao alterar senha",
        description: "Ocorreu um erro. Tente novamente.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md rounded-xl border-border">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-4 rounded-full bg-primary/10 p-3 w-fit">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Alterar Senha</CardTitle>
          <CardDescription>
            Por segurança, você precisa criar uma nova senha para acessar o sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nova Senha</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Digite sua nova senha"
                  {...register("newPassword")}
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              {errors.newPassword && (
                <p className="text-sm text-destructive">{errors.newPassword.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Senha</Label>
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

            <div className="text-sm text-muted-foreground">
              <p>Sua senha deve ter:</p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Pelo menos 6 caracteres</li>
                <li>Recomendamos usar letras, números e símbolos</li>
              </ul>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Alterando...
                </>
              ) : (
                "Alterar Senha"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
