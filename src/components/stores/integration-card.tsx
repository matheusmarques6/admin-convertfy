"use client"

import { useState, useEffect } from "react"
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Loader2, ExternalLink } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { BrandIcon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "@/lib/hooks/use-toast"

interface IntegrationStatusData {
  connected: boolean
  configured?: boolean
  status?: "not_configured" | "pending_validation" | "connected" | "error"
  connected_at?: string
  validated_at?: string | null
  error?: string | null
  hasReportingAccess?: boolean
  missingScopes?: string[]
}

interface IntegrationCardProps {
  integrationKey: string
  label: string
  brandIcon?: string
  status: IntegrationStatusData | undefined
  storeId: string
  canRevalidate?: boolean
  storeUrl?: string | null
  details?: { label: string; value: string }[]
  onRevalidated?: () => void
}

export function IntegrationCard({
  integrationKey,
  label,
  brandIcon,
  status,
  storeId,
  canRevalidate = false,
  storeUrl,
  details,
  onRevalidated,
}: IntegrationCardProps) {
  const [revalidating, setRevalidating] = useState(false)
  const [localStatus, setLocalStatus] = useState(status)

  useEffect(() => {
    setLocalStatus(status)
  }, [status])

  const connectionStatus = localStatus?.status || (localStatus?.connected ? "connected" : "not_configured")
  const isConnected = connectionStatus === "connected"
  const isError = connectionStatus === "error"
  const isPending = connectionStatus === "pending_validation"

  const handleRevalidate = async () => {
    setRevalidating(true)
    try {
      const res = await fetch("/api/client-stores/credentials/revalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: storeId }),
      })
      const data = await res.json()
      const result = data.validation_results?.[integrationKey]

      if (result) {
        setLocalStatus({
          ...localStatus,
          connected: result.valid,
          configured: true,
          status: result.valid ? "connected" : "error",
          validated_at: result.tested_at,
          error: result.valid ? null : (result.error || "Erro desconhecido"),
          hasReportingAccess: result.hasReportingAccess,
          missingScopes: result.missingScopes,
        })
        onRevalidated?.()
      }
    } catch {
      toast({ title: "Erro ao revalidar", description: "Tente novamente.", variant: "destructive" })
    } finally {
      setRevalidating(false)
    }
  }

  return (
    <Card className="rounded-[8px]">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Brand icon or status icon */}
          {brandIcon ? (
            <BrandIcon src={brandIcon} alt={label} size={24} className="mt-0.5" />
          ) : (
            <div className="w-6 h-6 mt-0.5">
              {isConnected ? (
                <Icon icon={CheckCircle2} size={24} className="text-[#065F46] dark:text-[#6EE7B7]" />
              ) : isError ? (
                <Icon icon={XCircle} size={24} className="text-[#991B1B] dark:text-[#FCA5A5]" />
              ) : (
                <Icon icon={XCircle} size={24} className="text-gray-300 dark:text-[#5C6378]" />
              )}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-foreground">{label}</h4>
              <StatusBadge
                status={isConnected ? "connected" : isError ? "error" : isPending ? "pending" : "inactive"}
              />
            </div>

            {/* Connection details */}
            <p className="text-xs text-muted-foreground mt-1">
              {isConnected
                ? localStatus?.validated_at
                  ? `Conectado em ${new Date(localStatus.validated_at).toLocaleDateString("pt-BR")}`
                  : localStatus?.connected_at
                    ? `Conectado em ${new Date(localStatus.connected_at).toLocaleDateString("pt-BR")}`
                    : "Conectado"
                : isError
                  ? localStatus?.error || "Erro de conexão"
                  : isPending
                    ? "Pendente de validação"
                    : "Não configurado"}
            </p>

            {/* Klaviyo-specific warnings */}
            {integrationKey === "klaviyo" && localStatus?.missingScopes && localStatus.missingScopes.length > 0 && (
              <p className="text-xs text-[#92400E] dark:text-[#FCD34D] flex items-start gap-1 mt-1.5">
                <Icon icon={AlertTriangle} size={16} className="shrink-0 mt-0.5" />
                <span>Scopes faltando: <strong>{localStatus.missingScopes.join(", ")}</strong></span>
              </p>
            )}
            {integrationKey === "klaviyo" && isConnected && localStatus?.hasReportingAccess === true && (
              <Badge variant="positive" className="mt-1.5">Relatórios ativos</Badge>
            )}
            {integrationKey === "klaviyo" && isConnected && localStatus?.hasReportingAccess === false && !localStatus?.missingScopes?.length && (
              <Badge variant="warning" className="mt-1.5">Sem acesso a relatórios</Badge>
            )}

            {/* Extra details */}
            {details && details.length > 0 && (
              <div className="mt-2 space-y-1">
                {details.map((d) => (
                  <div key={d.label} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{d.label}</span>
                    <span className="font-mono text-foreground">{d.value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Store URL link for Shopify */}
            {integrationKey === "shopify" && storeUrl && isConnected && (
              <a
                href={storeUrl.startsWith("http") ? storeUrl : `https://${storeUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[#4E62D8] dark:text-[#7B8CEA] hover:underline mt-1.5"
              >
                {storeUrl}
                <Icon icon={ExternalLink} size={16} />
              </a>
            )}
          </div>

          {/* Revalidate button */}
          {canRevalidate && localStatus?.configured && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleRevalidate}
              disabled={revalidating}
              title="Revalidar conexão"
              className="shrink-0"
            >
              {revalidating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Icon icon={RefreshCw} size={16} />
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Helper component: grid of integration cards for a store
interface IntegrationCardsGridProps {
  storeId: string
  integrationStatus: Record<string, IntegrationStatusData>
  storeUrl?: string | null
}

export function IntegrationCardsGrid({ storeId, integrationStatus, storeUrl }: IntegrationCardsGridProps) {
  const integrations = [
    { key: "shopify", label: "Shopify", brandIcon: "/images/integrations/shopify.svg", canRevalidate: true },
    { key: "klaviyo", label: "Klaviyo", brandIcon: "/images/integrations/klaviyo.svg", canRevalidate: true },
    { key: "omnisend", label: "Omnisend", brandIcon: "/images/integrations/omnisend.svg", canRevalidate: true },
    { key: "ga4", label: "Google Analytics", canRevalidate: false },
    { key: "meta", label: "Meta Ads", canRevalidate: false },
    { key: "google_ads", label: "Google Ads", canRevalidate: false },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {integrations.map((int) => (
        <IntegrationCard
          key={int.key}
          integrationKey={int.key}
          label={int.label}
          brandIcon={int.brandIcon}
          status={integrationStatus[int.key]}
          storeId={storeId}
          canRevalidate={int.canRevalidate}
          storeUrl={int.key === "shopify" ? storeUrl : undefined}
        />
      ))}
    </div>
  )
}
