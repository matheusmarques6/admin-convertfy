"use client"

import { ErrorState } from "@/components/ui/error-state"

export default function NewReportError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorState
      title="Erro ao criar relatório"
      description="Não foi possível carregar o formulário de criação. Tente novamente."
      onRetry={reset}
    />
  )
}
