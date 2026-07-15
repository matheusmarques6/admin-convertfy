"use client"

/**
 * Secao de Configuracoes "integrations" — corpo extraido de
 * src/app/admin/settings/integrations/page.tsx (jul/2026) para ser
 * renderizavel tanto na pagina cheia (rota preservada) quanto no
 * SettingsModal global. Conteudo movido, nao reescrito.
 */

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { mutate as globalMutate } from "swr"
import {
  DollarSign,
  Facebook,
  Search,
  Mail,
  ShoppingBag,
  MessageCircle,
  Calendar,
  Instagram,
  Loader2,
  ExternalLink,
  Settings,
  RefreshCw,
  Plug,
  AlertTriangle,
  BarChart3,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/ui/page-header"
import { Skeleton } from "@/components/ui/skeleton"
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
import { GoogleCalendarCard } from "@/components/settings/google-calendar-card"
import { OrgGoogleCalendarCard } from "@/components/settings/org-google-calendar-card"
import type { IntegrationType, Integration } from "@/types"
import { cn } from "@/lib/utils"

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
  DollarSign, Facebook, Search, Mail, ShoppingBag, MessageCircle, Calendar, Instagram,
}

export function IntegrationsSection() {
  const {
    integrations, statuses, isLoading, isTesting,
    setIntegrations, addIntegration, updateIntegration, removeIntegration,
    setStatus, setLoading, setTesting,
  } = useIntegrationsStore()

  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [selectedType, setSelectedType] = useState<IntegrationType | null>(null)
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => { loadIntegrations() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Confirmacao visual do retorno do OAuth (success/error na URL) + revalida
  // o status do Google Calendar. Limpa os params depois para nao repetir.
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  useEffect(() => {
    const success = searchParams.get("success")
    const errorParam = searchParams.get("error")
    if (!success && !errorParam) return

    if (success === "google_org_calendar_connected") {
      toast({ title: "Conta central conectada", description: "A agenda da Convertfy está sincronizando as reuniões de clientes." })
    } else if (success === "google_calendar_connected") {
      toast({ title: "Google Calendar conectado", description: "Sua agenda pessoal foi conectada com sucesso." })
    } else if (errorParam === "forbidden_org_connect") {
      toast({ variant: "destructive", title: "Sem permissão", description: "Apenas admin/gestão pode conectar a conta central." })
    } else if (errorParam === "no_org") {
      toast({ variant: "destructive", title: "Organização não encontrada", description: "Seu usuário não está vinculado a uma organização ativa." })
    } else if (errorParam) {
      toast({ variant: "destructive", title: "Falha ao conectar", description: `Erro: ${errorParam}` })
    }

    // Revalida o card pessoal (SWR) e recarrega para atualizar o card central
    globalMutate("/api/integrations/google/calendar/status")

    // Remove success/error da URL preservando o resto (ex.: settings=integrations)
    const params = new URLSearchParams(searchParams.toString())
    params.delete("success")
    params.delete("error")
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [searchParams, router, pathname])

  async function loadIntegrations() {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.from("integrations").select("*").order("created_at", { ascending: true })
      if (error) throw error
      setIntegrations(data || [])
    } catch (error) {
      console.error("Error loading integrations:", error)
      toast({ variant: "destructive", title: "Erro ao carregar integrações", description: "Tente novamente mais tarde" })
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
          toast({
            title: result.details.hasReportingAccess ? "Conexão completa!" : "Conectado, mas sem acesso a relatórios",
            description: result.details.hasReportingAccess ? "Relatórios disponíveis." : "Verifique os scopes da API Key no Klaviyo.",
            variant: result.details.hasReportingAccess ? "default" : "destructive",
          })
        } else {
          toast({ title: "Conexão bem sucedida!", description: "A integração está funcionando corretamente." })
        }
      } else {
        setStatus(selectedType, { connected: false, error: result.error })
        toast({ variant: "destructive", title: "Falha na conexão", description: result.error || "Verifique suas credenciais" })
      }
    } catch (error) {
      setStatus(selectedType, { connected: false, error: error instanceof Error ? error.message : "Erro desconhecido" })
      toast({ variant: "destructive", title: "Erro ao testar conexão", description: error instanceof Error ? error.message : "Erro desconhecido" })
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
      const missingFields = config?.requiredCredentials.filter((field) => !credentials[field.key])
      if (missingFields && missingFields.length > 0) {
        toast({ variant: "destructive", title: "Campos obrigatórios", description: `Preencha: ${missingFields.map((f) => f.label).join(", ")}` })
        setIsSaving(false)
        return
      }

      const testResult = await testIntegrationConnection(selectedType, credentials)
      const now = new Date().toISOString()
      const response = await fetch("/api/integrations/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integration_id: existing?.id, type: selectedType, name: config?.name || selectedType,
          credentials, is_active: testResult.success, last_sync: testResult.success ? now : null,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Erro ao salvar")

      if (existing) {
        updateIntegration(existing.id, { is_active: testResult.success, last_sync: testResult.success ? now : undefined })
      } else if (result.data?.integration) {
        addIntegration(result.data.integration as Integration)
      }
      setStatus(selectedType, { connected: testResult.success, lastSync: testResult.success ? now : undefined, error: testResult.error, details: testResult.details })
      toast({
        title: testResult.success ? "Integração salva!" : "Integração salva (desconectada)",
        description: testResult.success ? "A integração foi configurada e está ativa." : testResult.error || "Verifique suas credenciais",
        variant: testResult.success ? "default" : "destructive",
      })
      setConfigDialogOpen(false)
      loadIntegrations()
    } catch (error) {
      console.error("Error saving integration:", error)
      toast({ variant: "destructive", title: "Erro ao salvar", description: error instanceof Error ? error.message : "Tente novamente" })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDisconnect(type: IntegrationType) {
    const integration = integrations.find((i) => i.type === type)
    if (!integration) return
    try {
      const response = await fetch(`/api/integrations/save?id=${integration.id}`, { method: "DELETE" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Erro ao desconectar")
      removeIntegration(integration.id)
      toast({ title: "Integração desconectada", description: "A integração foi removida com sucesso." })
    } catch (error) {
      toast({ variant: "destructive", title: "Erro ao desconectar", description: error instanceof Error ? error.message : "Tente novamente" })
    }
  }

  async function handleSync(type: IntegrationType) {
    setTesting(type)
    try {
      const integration = integrations.find((i) => i.type === type)
      if (!integration) return
      let syncUrl = ""
      switch (type) {
        case "asaas": syncUrl = "/api/integrations/asaas/sync"; break
        default:
          toast({ title: "Use Configurar para testar", description: "Abra o diálogo de configuração para testar a conexão." })
          return
      }
      const response = await fetch(syncUrl, { method: "POST" })
      const result = await response.json()
      if (result.success) {
        updateIntegration(integration.id, { last_sync: new Date().toISOString() })
        setStatus(type, { connected: true, lastSync: new Date().toISOString() })
        toast({ title: "Sincronização concluída!", description: `${result.stats?.synced || 0} novos, ${result.stats?.updated || 0} atualizados` })
      } else {
        toast({ variant: "destructive", title: "Falha na sincronização", description: result.error })
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Erro na sincronização", description: error instanceof Error ? error.message : "Erro desconhecido" })
    } finally {
      setTesting(null)
    }
  }

  const selectedConfig = selectedType ? getIntegrationConfig(selectedType) : null

  // Separate active and available
  const _activeTypes = new Set(integrations.filter(i => i.is_active).map(i => i.type))
  const allConfigs = Object.values(INTEGRATION_CONFIGS)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrações"
        description="Conecte suas ferramentas e plataformas."
      />

      {isLoading ? (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48 rounded-[8px]" />)}
        </div>
      ) : (
        <>
          {/* Per-user integrations */}
          <div>
            <p className="text-xs font-semibold text-gray-400 dark:text-[#5C6378] uppercase tracking-[0.04em] mb-3">
              Conexões pessoais
            </p>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              <GoogleCalendarCard />
            </div>
          </div>

          {/* Org-level integrations */}
          <div>
            <p className="text-xs font-semibold text-gray-400 dark:text-[#5C6378] uppercase tracking-[0.04em] mb-3">
              Integrações da organização
            </p>
            <div className={cn("grid gap-3", "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}>
              <OrgGoogleCalendarCard />
              {allConfigs.map((config) => {
                const status = statuses[config.type]
                const IconComp = ICONS[config.icon] || Plug
                const isConnected = status?.connected

                return (
                  <Card key={config.type} className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Icon — naked inline (Rule 1) */}
                      <div className="shrink-0 mt-0.5">
                        <IconComp className="h-5 w-5" style={{ color: config.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3]">
                            {config.name}
                          </h4>
                          {isConnected ? (
                            <Badge variant="positive" showDot={false} className="text-[10px]">Conectado</Badge>
                          ) : (
                            <Badge variant="neutral" showDot={false} className="text-[10px]">Desconectado</Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-[#8B92A5] mt-0.5 line-clamp-1">
                          {config.description}
                        </p>
                        {isConnected && config.type === "klaviyo" && status?.details && (
                          <div className="mt-1">
                            {status.details.hasReportingAccess ? (
                              <Badge variant="positive" showDot={false} className="text-[10px]">
                                <BarChart3 className="h-3 w-3 mr-1" />Relatórios OK
                              </Badge>
                            ) : (
                              <Badge variant="warning" showDot={false} className="text-[10px]">
                                <AlertTriangle className="h-3 w-3 mr-1" />Sem relatórios
                              </Badge>
                            )}
                          </div>
                        )}
                        {status?.lastSync && isConnected && (
                          <p className="text-[11px] font-mono text-gray-400 dark:text-[#5C6378] mt-1">
                            Sync: {new Date(status.lastSync).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-[rgba(0,0,0,0.04)] dark:border-[rgba(255,255,255,0.04)] flex gap-2">
                      {isConnected ? (
                        <>
                          <Button variant="secondary" size="sm" className="flex-1" onClick={() => openConfigDialog(config.type)}>
                            <Settings className="h-3.5 w-3.5 mr-1" /> Configurar
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => handleSync(config.type)} disabled={isTesting === config.type}>
                            {isTesting === config.type ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" className="flex-1" onClick={() => openConfigDialog(config.type)}>
                          <Plug className="h-3.5 w-3.5 mr-1" /> Conectar
                        </Button>
                      )}
                      {config.docsUrl && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={config.docsUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Config Dialog — preserved from original */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedConfig && (() => {
                const IconComp = ICONS[selectedConfig.icon] || Plug
                return <><IconComp className="h-5 w-5" style={{ color: selectedConfig.color }} /> Configurar {selectedConfig.name}</>
              })()}
            </DialogTitle>
            <DialogDescription>{selectedConfig?.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {selectedConfig?.requiredCredentials.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>
                  {field.label}<span className="text-[#991B1B] dark:text-[#FCA5A5] ml-1">*</span>
                </Label>
                {field.type === "select" ? (
                  <Select value={credentials[field.key] || ""} onValueChange={(value) => setCredentials({ ...credentials, [field.key]: value })}>
                    <SelectTrigger><SelectValue placeholder={field.placeholder || "Selecione..."} /></SelectTrigger>
                    <SelectContent>
                      {field.options?.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input id={field.key} type={field.type === "password" ? "password" : "text"} placeholder={field.placeholder} value={credentials[field.key] || ""} onChange={(e) => setCredentials({ ...credentials, [field.key]: e.target.value })} />
                )}
                {field.helpText && <p className="text-xs text-gray-400 dark:text-[#5C6378]">{field.helpText}</p>}
              </div>
            ))}
            {selectedConfig?.optionalCredentials && selectedConfig.optionalCredentials.length > 0 && (
              <>
                <div className="border-t border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] pt-4">
                  <p className="text-sm font-medium mb-3">Configurações opcionais</p>
                </div>
                {selectedConfig.optionalCredentials.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={field.key}>{field.label}</Label>
                    {field.type === "select" ? (
                      <Select value={credentials[field.key] || ""} onValueChange={(value) => setCredentials({ ...credentials, [field.key]: value })}>
                        <SelectTrigger><SelectValue placeholder={field.placeholder || "Selecione..."} /></SelectTrigger>
                        <SelectContent>
                          {field.options?.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input id={field.key} type={field.type === "password" ? "password" : "text"} placeholder={field.placeholder} value={credentials[field.key] || ""} onChange={(e) => setCredentials({ ...credentials, [field.key]: e.target.value })} />
                    )}
                    {field.helpText && <p className="text-xs text-gray-400 dark:text-[#5C6378]">{field.helpText}</p>}
                  </div>
                ))}
              </>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {selectedType && statuses[selectedType]?.connected && (
              <Button variant="destructive" onClick={() => { handleDisconnect(selectedType); setConfigDialogOpen(false) }} className="w-full sm:w-auto">
                Desconectar
              </Button>
            )}
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="secondary" onClick={handleTestConnection} disabled={isTesting !== null || isSaving} className="flex-1 sm:flex-initial">
                {isTesting === selectedType && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Testar Conexão
              </Button>
              <Button onClick={handleSaveIntegration} disabled={isTesting !== null || isSaving} className="flex-1 sm:flex-initial">
                {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
