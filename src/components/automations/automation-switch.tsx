"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Switch } from "@/components/ui/switch"
import { createClient } from "@/lib/supabase/client"
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
      const supabase = createClient()
      const { error } = await supabase
        .from("automations")
        .update({ is_active: newValue })
        .eq("id", automationId)

      if (error) throw error

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
