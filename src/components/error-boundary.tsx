"use client"

import React from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          <Icon icon={AlertTriangle} customSize={48} className="text-destructive mb-4" />
          <h2 className="text-xl font-semibold mb-2">Algo deu errado</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            Ocorreu um erro inesperado. Tente recarregar a página.
          </p>
          <Button
            onClick={() => this.setState({ hasError: false, error: null })}
            variant="secondary"
          >
            <Icon icon={RefreshCw} size={16} className="mr-2" />
            Tentar novamente
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
