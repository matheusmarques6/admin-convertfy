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
  XCircle,
  Loader2,
  ExternalLink,
  Settings,
  RefreshCw,
  Plug,
  ArrowLeft,
  AlertTriangle,
  BarChart3,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

// Call backend API to test connection (avoids CORS issues)
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
    // Don't pre-fill credentials — they're encrypted in the DB
    // User must re-enter credentials when editing
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

        // Klaviyo: differentiated toast based on reporting access
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

      // Validate required fields
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

      // Test connection first
      const testResult = await testIntegrationConnection(selectedType, credentials)
      const now = new Date().toISOString()

      // Save via server-side API (encrypts credentials)
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

      // Update local store
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
      // Reload to get fresh data
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

      // Call the sync API based on integration type
      let syncUrl = ""
      switch (type) {
        case "asaas":
          syncUrl = "/api/integrations/asaas/sync"
          break
        default:
          // For other integrations, inform user to use config dialog to test
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <p className="text-muted-foreground">
          Conecte suas ferramentas favoritas ao Convertfy
        </p>
      </div>

      {/* Integration Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Object.values(INTEGRATION_CONFIGS).map((config) => {
            const status = statuses[config.type]
            const Icon = ICONS[config.icon] || Plug
            const isConnected = status?.connected

            return (
              <Card
                key={config.type}
                className={`rounded-xl border bg-card relative overflow-hidden ${
                  isConnected ? "border-success/50" : ""
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="rounded-lg p-2"
                        style={{ backgroundColor: `${config.color}20` }}
                      >
                        <Icon
                          className="h-6 w-6"
                          style={{ color: config.color }}
                        />
                      </div>
                      <div>
                        <CardTitle className="text-base">{config.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {isConnected ? (
                            <Badge variant="outline" className="text-success border-success">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Conectado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              <XCircle className="h-3 w-3 mr-1" />
                              Desconectado
                            </Badge>
                          )}
                          {isConnected && config.type === "klaviyo" && status?.details && (
                            status.details.hasReportingAccess ? (
                              <Badge variant="outline" className="text-success border-success">
                                <BarChart3 className="h-3 w-3 mr-1" />
                                Relatórios OK
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-warning border-warning">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Sem relatórios
                              </Badge>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <CardDescription className="mt-2">
                    {config.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Features */}
                    <div className="text-xs text-muted-foreground">
                      <ul className="space-y-1">
                        {config.features.slice(0, 2).map((feature, i) => (
                          <li key={i} className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 text-success" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Last sync */}
                    {status?.lastSync && (
                      <p className="text-xs text-muted-foreground">
                        Última sync:{" "}
                        {new Date(status.lastSync).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      {isConnected ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => openConfigDialog(config.type)}
                          >
                            <Settings className="h-4 w-4 mr-1" />
                            Configurar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSync(config.type)}
                            disabled={isTesting === config.type}
                          >
                            {isTesting === config.type ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => openConfigDialog(config.type)}
                        >
                          <Plug className="h-4 w-4 mr-1" />
                          Conectar
                        </Button>
                      )}
                      {config.docsUrl && (
                        <Button variant="ghost" size="sm" asChild>
                          <a
                            href={config.docsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Config Dialog */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedConfig && (
                <>
                  {(() => {
                    const Icon = ICONS[selectedConfig.icon] || Plug
                    return (
                      <Icon
                        className="h-5 w-5"
                        style={{ color: selectedConfig.color }}
                      />
                    )
                  })()}
                  Configurar {selectedConfig.name}
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
                <Label htmlFor={field.key}>
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
                    <SelectTrigger>
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
                  <p className="text-sm font-medium mb-3">Configurações opcionais</p>
                </div>
                {selectedConfig.optionalCredentials.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={field.key}>{field.label}</Label>
                    {field.type === "select" ? (
                      <Select
                        value={credentials[field.key] || ""}
                        onValueChange={(value) =>
                          setCredentials({ ...credentials, [field.key]: value })
                        }
                      >
                        <SelectTrigger>
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

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {selectedType && statuses[selectedType]?.connected && (
              <Button
                variant="destructive"
                onClick={() => {
                  handleDisconnect(selectedType)
                  setConfigDialogOpen(false)
                }}
                className="w-full sm:w-auto"
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
                {isTesting === selectedType ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Testar Conexão
              </Button>
              <Button
                onClick={handleSaveIntegration}
                disabled={isTesting !== null || isSaving}
                className="flex-1 sm:flex-initial"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
