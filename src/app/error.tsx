"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw, Home } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[GlobalError]", error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-8 text-center">
      <AlertTriangle className="h-16 w-16 text-destructive mb-6" />
      <h1 className="text-2xl font-bold mb-2">Erro Inesperado</h1>
      <p className="text-muted-foreground mb-8 max-w-lg">
        Ocorreu um erro ao carregar esta página. Se o problema persistir, entre em contato com o suporte.
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground mb-4 font-mono">
          Código: {error.digest}
        </p>
      )}
      <div className="flex gap-3">
        <Button onClick={reset} variant="default">
          <RefreshCw className="h-4 w-4 mr-2" />
          Tentar novamente
        </Button>
        <Button variant="outline" asChild>
          <a href="/admin/dashboard">
            <Home className="h-4 w-4 mr-2" />
            Voltar ao início
          </a>
        </Button>
      </div>
    </div>
  )
}
