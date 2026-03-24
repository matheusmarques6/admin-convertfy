"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Eye, EyeOff } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/ui/form-field"
import { toast } from "@/lib/hooks/use-toast"
import { AuthLayout } from "@/components/auth/auth-layout"

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
        window.location.href = "/admin/dashboard"
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
    <AuthLayout>
      <div className="text-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-[#EAEDF3]">
          Alterar Senha
        </h1>
        <p className="text-sm text-gray-500 dark:text-[#8B92A5] mt-1">
          Por segurança, você precisa criar uma nova senha para acessar o sistema.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Nova Senha" required error={errors.newPassword?.message}>
          <div className="relative">
            <Input
              type={showNewPassword ? "text" : "password"}
              placeholder="Digite sua nova senha"
              className="h-11 pr-10"
              {...register("newPassword")}
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-[#8B92A5] transition-colors"
              tabIndex={-1}
            >
              <Icon icon={showNewPassword ? EyeOff : Eye} size={16} />
            </button>
          </div>
          <p className="text-xs text-gray-400 dark:text-[#5C6378] mt-1">
            Mínimo 6 caracteres. Recomendamos usar letras, números e símbolos.
          </p>
        </FormField>

        <FormField label="Confirmar Senha" required error={errors.confirmPassword?.message}>
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
          Alterar Senha
        </Button>
      </form>
    </AuthLayout>
  )
}
