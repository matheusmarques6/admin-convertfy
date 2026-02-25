"use client"

import { ErrorState } from "@/components/ui/error-state"

export default function ClientError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorState
      title="Erro ao carregar cliente"
      description="Não foi possível carregar os dados do cliente. Verifique se o cliente existe e tente novamente."
      onRetry={reset}
    />
  )
}
