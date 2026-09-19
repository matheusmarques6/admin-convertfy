"use client"

import { ErrorState } from "@/components/ui/error-state"

export default function ReportError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorState
      title="Erro ao carregar relatório"
      description="Não foi possível carregar o relatório. Verifique se o relatório existe e tente novamente."
      onRetry={reset}
    />
  )
}
