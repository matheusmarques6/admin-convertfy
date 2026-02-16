"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/lib/hooks/use-toast"

interface AutomationSwitchProps {
  automationId: string
  isActive: boolean
}

export function AutomationSwitch({ automationId, isActive }: AutomationSwitchProps) {
  const router = useRouter()
  const [checked, setChecked] = useState(isActive)
  const [isLoading, setIsLoading] = useState(false)

  async function handleToggle(newValue: boolean) {
    setIsLoading(true)
    setChecked(newValue)

    try {
      const res = await fetch("/api/automations/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: automationId, is_active: newValue }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erro ao atualizar automação")
      }

      toast({
        title: newValue ? "Automação ativada" : "Automação pausada",
        description: newValue
          ? "A automação está rodando normalmente."
          : "A automação foi pausada.",
      })

      router.refresh()
    } catch {
      setChecked(!newValue)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível alterar o status da automação.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Switch
      checked={checked}
      onCheckedChange={handleToggle}
      disabled={isLoading}
    />
  )
}
