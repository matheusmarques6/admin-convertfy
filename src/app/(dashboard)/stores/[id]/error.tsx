"use client"

import { useEffect } from "react"
import { ErrorState } from "@/components/ui/error-state"

export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[StoreDetail] Page error:", error.message, error.digest)
  }, [error])

  // In production, Next.js replaces server error messages with a generic digest.
  // Check for digest to provide a useful message.
  const isServerError = !!error.digest
  const description = isServerError
    ? "Não foi possível carregar os dados da loja. Verifique os logs do servidor para mais detalhes."
    : `Não foi possível carregar os dados da loja. Erro: ${error.message}`

  return (
    <ErrorState
      title="Erro ao carregar loja"
      description={description}
      onRetry={reset}
    />
  )
}
