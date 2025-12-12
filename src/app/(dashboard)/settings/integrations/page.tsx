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
import { testIntegrationConnection } from "@/lib/integrations"
import { toast } from "@/lib/hooks/use-toast"
import type { IntegrationType, Integration } from "@/types"

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
    const existing = integrations.find((i) => i.type === type)
    setSelectedType(type)
    setCredentials(existing?.credentials || {})
    setConfigDialogOpen(true)
  }

  async function handleTestConnection() {
    if (!selectedType) return

    setTesting(selectedType)
    try {
      const result = await testIntegrationConnection(selectedType, credentials)

      if (result.success) {
        setStatus(selectedType, { connected: true, error: undefined })
        toast({
          title: "Conexão bem sucedida!",
          description: "A integração está funcionando corretamente.",
        })
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
      const supabase = createClient()
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

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from("integrations")
          .update({
            credentials,
            is_active: testResult.success,
            last_sync: testResult.success ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)

        if (error) throw error

        updateIntegration(existing.id, {
          credentials,
          is_active: testResult.success,
          last_sync: testResult.success ? new Date().toISOString() : undefined,
        })
      } else {
        // Create new
        const newIntegration = {
          type: selectedType,
          name: config?.name || selectedType,
          credentials,
          is_active: testResult.success,
          last_sync: testResult.success ? new Date().toISOString() : null,
        }

        const { data, error } = await supabase
          .from("integrations")
          .insert(newIntegration)
          .select()
          .single()

        if (error) throw error
        addIntegration(data as Integration)
      }

      setStatus(selectedType, {
        connected: testResult.success,
        lastSync: testResult.success ? new Date().toISOString() : undefined,
        error: testResult.error,
      })

      toast({
        title: testResult.success ? "Integração salva!" : "Integração salva (desconectada)",
        description: testResult.success
          ? "A integração foi configurada e está ativa."
          : testResult.error || "Verifique suas credenciais",
        variant: testResult.success ? "default" : "destructive",
      })

      setConfigDialogOpen(false)
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
      const supabase = createClient()
      const { error } = await supabase
        .from("integrations")
        .delete()
        .eq("id", integration.id)

      if (error) throw error

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

      const result = await testIntegrationConnection(type, integration.credentials)

      if (result.success) {
        const supabase = createClient()
        await supabase
          .from("integrations")
          .update({ last_sync: new Date().toISOString() })
          .eq("id", integration.id)

        updateIntegration(integration.id, {
          last_sync: new Date().toISOString(),
        })

        toast({
          title: "Sincronização concluída",
          description: "Dados atualizados com sucesso.",
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
        <div>
          <h1 className="text-2xl font-bold">Integrações</h1>
          <p className="text-muted-foreground">
            Conecte suas ferramentas favoritas ao Convertfy
          </p>
        </div>
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
                className={`relative overflow-hidden transition-all hover:shadow-md ${
                  isConnected ? "border-green-500/50" : ""
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
                        <div className="flex items-center gap-2 mt-1">
                          {isConnected ? (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Conectado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              <XCircle className="h-3 w-3 mr-1" />
                              Desconectado
                            </Badge>
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
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
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
