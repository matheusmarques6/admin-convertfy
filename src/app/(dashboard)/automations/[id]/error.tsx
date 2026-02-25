"use client"

import { ErrorState } from "@/components/ui/error-state"

export default function AutomationError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorState
      title="Erro ao carregar automação"
      description="Não foi possível carregar os dados da automação. Verifique se a automação existe e tente novamente."
      onRetry={reset}
    />
  )
}
