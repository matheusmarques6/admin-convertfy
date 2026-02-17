"use client"

import { ErrorState } from "@/components/ui/error-state"

export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorState
      title="Erro ao carregar loja"
      description="Não foi possível carregar os dados da loja. Verifique se a loja existe e tente novamente."
      onRetry={reset}
    />
  )
}
