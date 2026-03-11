"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  DollarSign,
  Facebook,
  Search,
  Mail,
  ShoppingBag,
  MessageCircle,
  Calendar,
  Instagram,
  CheckCircle2,
  Loader2,
  ExternalLink,
  Settings,
  RefreshCw,
  Plug,
  ArrowLeft,
  AlertTriangle,
  BarChart3,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import { useIntegrationsStore } from "@/lib/store"
import { INTEGRATION_CONFIGS, getIntegrationConfig } from "@/lib/integrations/config"
import { toast } from "@/lib/hooks/use-toast"
import type { IntegrationType, Integration } from "@/types"

async function testIntegrationConnection(
  type: string,
  credentials: Record<string, string>
): Promise<{ success: boolean; error?: string; details?: Record<string, unknown> }> {
  const response = await fetch("/api/integrations/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, credentials }),
  })
  return response.json()
}

const ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  DollarSign,
  Facebook,
  Search,
  Mail,
  ShoppingBag,
  MessageCircle,
  Calendar,
  Instagram,
}

// Categorias de integrações
const INTEGRATION_CATEGORIES = {
  payments: {
    title: "Pagamentos",
    description: "Gateways de pagamento e cobrança",
    types: ["asaas"],
  },
  ecommerce: {
    title: "E-commerce",
    description: "Plataformas de loja virtual",
    types: ["shopify"],
  },
  marketing: {
    title: "Marketing",
    description: "Email marketing e automações",
    types: ["klaviyo"],
  },
  ads: {
    title: "Anúncios",
    description: "Plataformas de mídia paga",
    types: ["meta_ads", "google_ads"],
  },
  calendar: {
    title: "Calendário",
    description: "Agendamento de reuniões",
    types: ["google_calendar"],
  },
} as const

export default function IntegrationsPage() {
  const router = useRouter()
  const {
    integrations,
    statuses,
    isLoading,
    isTesting,
    setIntegrations,
    addIntegration,
    updateIntegration,
    removeIntegration,
    setStatus,
    setLoading,
    setTesting,
  } = useIntegrationsStore()

  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [selectedType, setSelectedType] = useState<IntegrationType | null>(null)
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    loadIntegrations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadIntegrations() {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("integrations")
        .select("*")
        .order("created_at", { ascending: true })

      if (error) throw error
      setIntegrations(data || [])
    } catch (error) {
      console.error("Error loading integrations:", error)
      toast({
        variant: "destructive",
        title: "Erro ao carregar integrações",
        description: "Tente novamente mais tarde",
      })
    } finally {
      setLoading(false)
    }
  }

  function openConfigDialog(type: IntegrationType) {
    setSelectedType(type)
    setCredentials({})
    setConfigDialogOpen(true)
  }

  async function handleTestConnection() {
    if (!selectedType) return

    setTesting(selectedType)
    try {
      const result = await testIntegrationConnection(selectedType, credentials)

      if (result.success) {
        setStatus(selectedType, { connected: true, error: undefined, details: result.details })

        if (selectedType === "klaviyo" && result.details) {
          if (result.details.hasReportingAccess) {
            toast({
              title: "Conexão completa!",
              description: "Relatórios disponíveis.",
            })
          } else {
            toast({
              title: "Conectado, mas sem acesso a relatórios",
              description: "Verifique os scopes da API Key no Klaviyo.",
              variant: "destructive",
            })
          }
        } else {
          toast({
            title: "Conexão bem sucedida!",
            description: "A integração está funcionando corretamente.",
          })
        }
      } else {
        setStatus(selectedType, { connected: false, error: result.error })
        toast({
          variant: "destructive",
          title: "Falha na conexão",
          description: result.error || "Verifique suas credenciais",
        })
      }
    } catch (error) {
      setStatus(selectedType, {
        connected: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      })
      toast({
        variant: "destructive",
        title: "Erro ao testar conexão",
        description: error instanceof Error ? error.message : "Erro desconhecido",
      })
    } finally {
      setTesting(null)
    }
  }

  async function handleSaveIntegration() {
    if (!selectedType) return

    setIsSaving(true)
    try {
      const config = getIntegrationConfig(selectedType)
      const existing = integrations.find((i) => i.type === selectedType)

      const missingFields = config?.requiredCredentials.filter(
        (field) => !credentials[field.key]
      )

      if (missingFields && missingFields.length > 0) {
        toast({
          variant: "destructive",
          title: "Campos obrigatórios",
          description: `Preencha: ${missingFields.map((f) => f.label).join(", ")}`,
        })
        setIsSaving(false)
        return
      }

      const testResult = await testIntegrationConnection(selectedType, credentials)
      const now = new Date().toISOString()

      const response = await fetch("/api/integrations/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integration_id: existing?.id,
          type: selectedType,
          name: config?.name || selectedType,
          credentials,
          is_active: testResult.success,
          last_sync: testResult.success ? now : null,
        }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Erro ao salvar")

      if (existing) {
        updateIntegration(existing.id, {
          is_active: testResult.success,
          last_sync: testResult.success ? now : undefined,
        })
      } else if (result.data?.integration) {
        addIntegration(result.data.integration as Integration)
      }

      setStatus(selectedType, {
        connected: testResult.success,
        lastSync: testResult.success ? now : undefined,
        error: testResult.error,
        details: testResult.details,
      })

      toast({
        title: testResult.success ? "Integração salva!" : "Integração salva (desconectada)",
        description: testResult.success
          ? "A integração foi configurada e está ativa."
          : testResult.error || "Verifique suas credenciais",
        variant: testResult.success ? "default" : "destructive",
      })

      setConfigDialogOpen(false)
      loadIntegrations()
    } catch (error) {
      console.error("Error saving integration:", error)
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Tente novamente",
      })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDisconnect(type: IntegrationType) {
    const integration = integrations.find((i) => i.type === type)
    if (!integration) return

    try {
      const response = await fetch(`/api/integrations/save?id=${integration.id}`, {
        method: "DELETE",
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Erro ao desconectar")

      removeIntegration(integration.id)
      toast({
        title: "Integração desconectada",
        description: "A integração foi removida com sucesso.",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao desconectar",
        description: error instanceof Error ? error.message : "Tente novamente",
      })
    }
  }

  async function handleSync(type: IntegrationType) {
    setTesting(type)
    try {
      const integration = integrations.find((i) => i.type === type)
      if (!integration) return

      let syncUrl = ""
      switch (type) {
        case "asaas":
          syncUrl = "/api/integrations/asaas/sync"
          break
        default:
          toast({
            title: "Use Configurar para testar",
            description: "Abra o diálogo de configuração para testar a conexão.",
          })
          return
      }

      const response = await fetch(syncUrl, { method: "POST" })
      const result = await response.json()

      if (result.success) {
        updateIntegration(integration.id, {
          last_sync: new Date().toISOString(),
        })
        setStatus(type, { connected: true, lastSync: new Date().toISOString() })

        toast({
          title: "Sincronização concluída!",
          description: `${result.stats?.synced || 0} novos, ${result.stats?.updated || 0} atualizados`,
        })
      } else {
        toast({
          variant: "destructive",
          title: "Falha na sincronização",
          description: result.error,
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro na sincronização",
        description: error instanceof Error ? error.message : "Erro desconhecido",
      })
    } finally {
      setTesting(null)
    }
  }

  const selectedConfig = selectedType ? getIntegrationConfig(selectedType) : null

  // Contagem de integrações conectadas
  const connectedCount = Object.values(statuses).filter((s) => s?.connected).length
  const totalCount = Object.keys(INTEGRATION_CONFIGS).length

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Integrações</h1>
            <p className="text-sm text-muted-foreground">
              Conecte suas ferramentas favoritas ao Convertfy
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {connectedCount} de {totalCount} conectadas
          </span>
          <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-success transition-all duration-300"
              style={{ width: `${(connectedCount / totalCount) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Carregando integrações...</p>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Categories */}
          {Object.entries(INTEGRATION_CATEGORIES).map(([categoryKey, category]) => {
            const categoryIntegrations = category.types
              .map((type) => INTEGRATION_CONFIGS[type as keyof typeof INTEGRATION_CONFIGS])
              .filter(Boolean)

            if (categoryIntegrations.length === 0) return null

            return (
              <div key={categoryKey} className="space-y-4">
                {/* Category Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-medium text-foreground">{category.title}</h2>
                    <p className="text-sm text-muted-foreground">{category.description}</p>
                  </div>
                </div>

                {/* Integration Cards */}
                <div className="grid gap-3">
                  {categoryIntegrations.map((config) => {
                    const status = statuses[config.type]
                    const Icon = ICONS[config.icon] || Plug
                    const isConnected = status?.connected

                    return (
                      <div
                        key={config.type}
                        className={`
                          group relative flex items-center justify-between
                          rounded-lg border bg-card p-4
                          transition-all duration-200
                          hover:border-border/80 hover:shadow-sm
                          ${isConnected ? "border-success/30" : "border-border"}
                        `}
                      >
                        {/* Left side: Icon + Info */}
                        <div className="flex items-center gap-4">
                          {/* Icon */}
                          <div
                            className="flex h-10 w-10 items-center justify-center rounded-lg"
                            style={{ backgroundColor: `${config.color}15` }}
                          >
                            <Icon className="h-5 w-5" style={{ color: config.color }} />
                          </div>

                          {/* Info */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-medium text-foreground">
                                {config.name}
                              </h3>
                              {/* Status Badge */}
                              {isConnected ? (
                                <Badge
                                  variant="outline"
                                  className="h-5 border-success/50 bg-success/10 text-success text-xs font-normal"
                                >
                                  <CheckCircle2 className="mr-1 h-3 w-3" />
                                  Conectado
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="h-5 border-muted-foreground/30 text-muted-foreground text-xs font-normal"
                                >
                                  Desconectado
                                </Badge>
                              )}
                              {/* Klaviyo Reports Badge */}
                              {isConnected && config.type === "klaviyo" && status?.details && (
                                status.details.hasReportingAccess ? (
                                  <Badge
                                    variant="outline"
                                    className="h-5 border-success/50 bg-success/10 text-success text-xs font-normal"
                                  >
                                    <BarChart3 className="mr-1 h-3 w-3" />
                                    Relatórios
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="h-5 border-warning/50 bg-warning/10 text-warning text-xs font-normal"
                                  >
                                    <AlertTriangle className="mr-1 h-3 w-3" />
                                    Sem relatórios
                                  </Badge>
                                )
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {config.description}
                            </p>
                            {/* Last sync */}
                            {status?.lastSync && (
                              <p className="text-xs text-muted-foreground/70">
                                Sync: {new Date(status.lastSync).toLocaleDateString("pt-BR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Right side: Actions */}
                        <div className="flex items-center gap-2">
                          {isConnected ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSync(config.type)}
                                disabled={isTesting === config.type}
                                className="h-8 px-2 text-muted-foreground hover:text-foreground"
                              >
                                {isTesting === config.type ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openConfigDialog(config.type)}
                                className="h-8"
                              >
                                <Settings className="mr-1.5 h-3.5 w-3.5" />
                                Configurar
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => openConfigDialog(config.type)}
                              className="h-8"
                            >
                              <Plug className="mr-1.5 h-3.5 w-3.5" />
                              Conectar
                            </Button>
                          )}
                          {config.docsUrl && (
                            <Button variant="ghost" size="sm" asChild className="h-8 px-2 text-muted-foreground hover:text-foreground">
                              <a
                                href={config.docsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          <ChevronRight className="h-4 w-4 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Features Summary */}
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Plug className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-medium text-foreground">
                  Integrações disponíveis
                </h3>
                <p className="text-sm text-muted-foreground">
                  Conecte suas ferramentas para sincronizar dados automaticamente,
                  acompanhar métricas em tempo real e automatizar processos.
                </p>
                <ul className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    Sincronização automática de pedidos
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    Métricas de email marketing
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    Gestão de cobranças e pagamentos
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    Relatórios de performance de ads
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Config Dialog */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedConfig && (
                <>
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${selectedConfig.color}15` }}
                  >
                    {(() => {
                      const Icon = ICONS[selectedConfig.icon] || Plug
                      return <Icon className="h-4 w-4" style={{ color: selectedConfig.color }} />
                    })()}
                  </div>
                  <span>Configurar {selectedConfig.name}</span>
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedConfig?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Required Credentials */}
            {selectedConfig?.requiredCredentials.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key} className="text-sm">
                  {field.label}
                  <span className="text-destructive ml-1">*</span>
                </Label>
                {field.type === "select" ? (
                  <Select
                    value={credentials[field.key] || ""}
                    onValueChange={(value) =>
                      setCredentials({ ...credentials, [field.key]: value })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={field.placeholder || `Selecione...`} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options?.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={field.key}
                    type={field.type === "password" ? "password" : "text"}
                    placeholder={field.placeholder}
                    value={credentials[field.key] || ""}
                    onChange={(e) =>
                      setCredentials({ ...credentials, [field.key]: e.target.value })
                    }
                    className="h-9"
                  />
                )}
                {field.helpText && (
                  <p className="text-xs text-muted-foreground">{field.helpText}</p>
                )}
              </div>
            ))}

            {/* Optional Credentials */}
            {selectedConfig?.optionalCredentials && selectedConfig.optionalCredentials.length > 0 && (
              <>
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-foreground mb-3">Configurações opcionais</p>
                </div>
                {selectedConfig.optionalCredentials.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={field.key} className="text-sm">{field.label}</Label>
                    {field.type === "select" ? (
                      <Select
                        value={credentials[field.key] || ""}
                        onValueChange={(value) =>
                          setCredentials({ ...credentials, [field.key]: value })
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder={field.placeholder || `Selecione...`} />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options?.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id={field.key}
                        type={field.type === "password" ? "password" : "text"}
                        placeholder={field.placeholder}
                        value={credentials[field.key] || ""}
                        onChange={(e) =>
                          setCredentials({ ...credentials, [field.key]: e.target.value })
                        }
                        className="h-9"
                      />
                    )}
                    {field.helpText && (
                      <p className="text-xs text-muted-foreground">{field.helpText}</p>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {selectedType && statuses[selectedType]?.connected && (
              <Button
                variant="outline"
                onClick={() => {
                  handleDisconnect(selectedType)
                  setConfigDialogOpen(false)
                }}
                className="w-full text-destructive hover:bg-destructive hover:text-destructive-foreground sm:w-auto"
              >
                Desconectar
              </Button>
            )}
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={isTesting !== null || isSaving}
                className="flex-1 sm:flex-initial"
              >
                {isTesting === selectedType && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Testar
              </Button>
              <Button
                onClick={handleSaveIntegration}
                disabled={isTesting !== null || isSaving}
                className="flex-1 sm:flex-initial"
              >
                {isSaving && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
