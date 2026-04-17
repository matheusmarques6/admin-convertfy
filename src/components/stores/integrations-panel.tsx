"use client"

import { useState, useCallback, useEffect } from "react"
import useSWR from "swr"
import {
  CheckCircle2, XCircle, AlertTriangle, Plus, Pencil, Trash2,
  RefreshCw, Loader2, ExternalLink, Zap,
} from "lucide-react"
import { Icon, BrandIcon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useToast } from "@/lib/hooks/use-toast"
import {
  IntegrationConfigModal,
  INTEGRATION_META,
  type IntegrationKey,
  type IntegrationCredentials,
  type IntegrationStatusData,
} from "./integration-config-modal"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface IntegrationsPanelProps {
  storeId: string
  storeUrl?: string | null
}

// Ordem das integracoes nos cards
const INTEGRATIONS: IntegrationKey[] = ["shopify", "klaviyo", "omnisend", "ga4", "meta"]

// ──────────────────────────────────────────────────────────────
// Painel principal
// ──────────────────────────────────────────────────────────────

export function IntegrationsPanel({ storeId, storeUrl }: IntegrationsPanelProps) {
  const [modalOpen, setModalOpen] = useState<IntegrationKey | null>(null)
  const { toast } = useToast()
  const [revalidatingAll, setRevalidatingAll] = useState(false)

  const { data, isLoading, mutate } = useSWR(
    storeId ? `/api/client-stores/credentials?store_id=${storeId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  const credentials: IntegrationCredentials | null = data?.credentials ?? null
  const status: Record<string, IntegrationStatusData> = data?.status ?? {}

  const handleSaved = useCallback(() => {
    mutate()
  }, [mutate])

  const handleRevalidateAll = useCallback(async () => {
    setRevalidatingAll(true)
    try {
      const res = await fetch("/api/client-stores/credentials/revalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: storeId }),
      })
      if (!res.ok) throw new Error("Falha ao revalidar")
      toast({ title: "Integrações revalidadas" })
      mutate()
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Tente novamente." })
    } finally {
      setRevalidatingAll(false)
    }
  }, [storeId, toast, mutate])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white">Integrações</h3>
          <p className="text-[12px] text-gray-500 dark:text-white/50 mt-0.5">
            Conecte as plataformas desta loja. Credenciais são criptografadas com AES-256-GCM.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRevalidateAll}
          disabled={revalidatingAll || isLoading}
        >
          {revalidatingAll ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Icon icon={RefreshCw} size={16} className="mr-1.5" />
          )}
          Revalidar todas
        </Button>
      </div>

      {/* Grid de cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        {INTEGRATIONS.map((key) => (
          <IntegrationCard
            key={key}
            integrationKey={key}
            credentials={credentials}
            status={status[key]}
            isLoading={isLoading}
            storeUrl={key === "shopify" ? storeUrl : null}
            onClick={() => setModalOpen(key)}
          />
        ))}
      </div>

      {/* Modal de configuração (único, muda conforme integrationKey) */}
      {modalOpen && (
        <IntegrationConfigModal
          open
          onClose={() => setModalOpen(null)}
          integration={modalOpen}
          storeId={storeId}
          credentials={credentials?.[modalOpen] ?? null}
          status={status[modalOpen]}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Card individual
// ──────────────────────────────────────────────────────────────

interface IntegrationCardProps {
  integrationKey: IntegrationKey
  credentials: IntegrationCredentials | null
  status: IntegrationStatusData | undefined
  isLoading: boolean
  storeUrl?: string | null
  onClick: () => void
}

function IntegrationCard({ integrationKey, credentials, status, isLoading, storeUrl, onClick }: IntegrationCardProps) {
  const meta = INTEGRATION_META[integrationKey]

  const cred = credentials?.[integrationKey] as IntegrationCredentials[IntegrationKey] | undefined
  const configured = cred ? (
    integrationKey === "shopify" ? (cred as IntegrationCredentials["shopify"]).configured :
    integrationKey === "klaviyo" ? (cred as IntegrationCredentials["klaviyo"]).configured :
    integrationKey === "omnisend" ? (cred as IntegrationCredentials["omnisend"]).configured :
    integrationKey === "ga4" ? (cred as IntegrationCredentials["ga4"]).credentials_configured :
    integrationKey === "meta" ? (cred as IntegrationCredentials["meta"]).configured :
    false
  ) : false

  const connStatus = status?.status || (configured ? "pending_validation" : "not_configured")
  const isConnected = connStatus === "connected"
  const isError = connStatus === "error"
  const isPending = connStatus === "pending_validation"

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className={cn(
        "group relative flex items-start gap-3 rounded-[10px] border bg-white dark:bg-[#1A1D27] p-4 text-left",
        "border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
        "hover:shadow-md hover:border-[rgba(0,0,0,0.14)] dark:hover:border-[rgba(255,255,255,0.14)]",
        "focus:outline-none focus:ring-2 focus:ring-[#4E62D8]/30",
        "transition-all duration-150",
        isError && "border-red-200/60 dark:border-red-900/30 bg-red-50/30 dark:bg-red-900/[0.04]"
      )}
    >
      {/* Icone */}
      {meta.brandIcon ? (
        <BrandIcon src={meta.brandIcon} alt={meta.label} size={28} className="shrink-0 mt-0.5" />
      ) : (
        <div
          className="w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: `${meta.color}18`, color: meta.color }}
        >
          <Icon icon={Zap} size={16} />
        </div>
      )}

      {/* Conteudo */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[13px] font-semibold text-gray-900 dark:text-white truncate">
            {meta.label}
          </span>
          <StatusPill status={connStatus} />
        </div>

        <p className={cn(
          "text-[11px] leading-tight truncate",
          isError ? "text-red-600 dark:text-red-400" :
          isConnected ? "text-emerald-600 dark:text-emerald-400" :
          "text-gray-500 dark:text-white/50"
        )}>
          {isConnected && status?.validated_at
            ? `Conectado · validado ${new Date(status.validated_at).toLocaleDateString("pt-BR")}`
            : isError
              ? status?.error || "Erro na conexão"
              : isPending
                ? "Aguardando validação"
                : "Não configurado"}
        </p>

        {/* Klaviyo scopes warning */}
        {integrationKey === "klaviyo" && status?.missingScopes && status.missingScopes.length > 0 && (
          <div className="flex items-start gap-1 mt-1.5 text-[10px] text-amber-600 dark:text-amber-400">
            <Icon icon={AlertTriangle} customSize={12} className="shrink-0 mt-0.5" />
            <span className="truncate">Scopes faltando: {status.missingScopes.join(", ")}</span>
          </div>
        )}

        {/* Klaviyo reporting badge */}
        {integrationKey === "klaviyo" && isConnected && status?.hasReportingAccess === true && (
          <Badge variant="positive" className="mt-1.5 text-[9px]">Reports ativos</Badge>
        )}
        {integrationKey === "klaviyo" && isConnected && status?.hasReportingAccess === false && (
          <Badge variant="warning" className="mt-1.5 text-[9px]">Sem acesso a reports</Badge>
        )}

        {/* Link da loja shopify */}
        {integrationKey === "shopify" && storeUrl && isConnected && (
          <span className="inline-flex items-center gap-1 text-[10px] text-[#4E62D8] dark:text-[#7B8CEA] mt-1.5">
            {storeUrl}
            <Icon icon={ExternalLink} customSize={10} />
          </span>
        )}

        {/* Acao */}
        <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-gray-500 dark:text-white/50 opacity-0 group-hover:opacity-100 transition-opacity">
          {configured ? (
            <>
              <Icon icon={Pencil} customSize={11} />
              <span>Editar credenciais</span>
            </>
          ) : (
            <>
              <Icon icon={Plus} customSize={11} />
              <span>Conectar</span>
            </>
          )}
        </div>
      </div>
    </button>
  )
}

// ──────────────────────────────────────────────────────────────
// Status pill
// ──────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const variants: Record<string, { label: string; className: string; icon?: typeof CheckCircle2 }> = {
    connected: {
      label: "Conectado",
      icon: CheckCircle2,
      className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/30",
    },
    error: {
      label: "Erro",
      icon: XCircle,
      className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/30",
    },
    pending_validation: {
      label: "Pendente",
      icon: Loader2,
      className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/30",
    },
    not_configured: {
      label: "Inativo",
      className: "bg-gray-100 text-gray-500 border-gray-200 dark:bg-white/[0.06] dark:text-white/50 dark:border-white/10",
    },
  }
  const v = variants[status] || variants.not_configured
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0",
      v.className
    )}>
      {v.icon && <Icon icon={v.icon} customSize={10} />}
      {v.label}
    </span>
  )
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unusedIcons = { Trash2, useEffect } // mantem imports uteis para edicoes futuras
