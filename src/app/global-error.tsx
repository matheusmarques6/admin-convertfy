"use client"

import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[GlobalError]", error.message, error.digest)
  }, [error])

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", backgroundColor: "#0B0E14", color: "#e2e8f0" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "2rem", textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1.5rem" }}>&#9888;</div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "0.5rem" }}>Erro Inesperado</h1>
          <p style={{ color: "#94a3b8", marginBottom: "2rem", maxWidth: "32rem" }}>
            Ocorreu um erro ao carregar a aplicacao. Se o problema persistir, entre em contato com o suporte.
          </p>
          {error.digest && (
            <p style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "1rem", fontFamily: "monospace" }}>
              Codigo: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              padding: "0.625rem 1.25rem",
              backgroundColor: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "0.5rem",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  )
}
