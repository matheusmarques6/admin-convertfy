"use client"

import { useState } from "react"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/lib/hooks/use-toast"

interface AutomationToggleProps {
  automationId: string
  isActive: boolean
}

export function AutomationToggle({ automationId, isActive }: AutomationToggleProps) {
  const [checked, setChecked] = useState(isActive)
  const [isLoading, setIsLoading] = useState(false)

  async function handleToggle(newValue: boolean) {
    setIsLoading(true)
    const previousValue = checked
    setChecked(newValue) // Optimistic update

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
          ? "A automação será executada quando o gatilho ocorrer."
          : "A automação foi pausada e não será executada.",
      })
    } catch {
      setChecked(previousValue) // Revert on error
      toast({
        variant: "destructive",
        title: "Erro ao atualizar automação",
        description: "Tente novamente.",
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
