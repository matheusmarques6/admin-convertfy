"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Store,
  Plus,
  Trash2,
  Edit,
  Key,
  ExternalLink,
  Eye,
  Loader2,
  Check,
  X,
  RefreshCw,
  Database,
  BarChart3,
  FileJson,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GlowCard } from "@/components/ui/glow-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "@/lib/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"

interface ClientStore {
  id: string
  // Database uses store_name and store_url
  store_name: string
  store_url?: string
  platform?: string
  currency?: string
  // Generic credentials (from original table)
  api_key?: string
  api_secret?: string
  access_token?: string
  // Shopify credentials
  shopify_store_domain?: string
  shopify_api_key?: string
  shopify_api_secret?: string
  shopify_access_token?: string
  // Klaviyo credentials
  klaviyo_public_key?: string  // Site ID / Public API Key
  klaviyo_private_key?: string // Private API Key
  klaviyo_list_id?: string
  klaviyo_api_key?: string
  // Google Analytics credentials
  ga4_property_id?: string
  ga4_credentials?: Record<string, unknown>
  is_active: boolean
  created_at: string
}

interface ClientStoresProps {
  clientId: string
  clientName: string
}

/**
 * Auto-mark onboarding step as completed when credentials are saved.
 * Uses the existing steps API which handles adminClient, timestamps, and progress recalculation.
 * Fails silently — saving the store should never fail because of onboarding.
 */
async function markOnboardingStepCompleted(
  clientId: string,
  stepName: string
) {
  try {
    const supabase = createClient()

    // Find active onboarding for this client
    const { data: onboarding } = await supabase
      .from("client_onboardings")
      .select("id")
      .eq("client_id", clientId)
      .in("status", ["in_progress", "not_started"])
      .limit(1)
      .single()

    if (!onboarding) return

    // Find the step that matches by name
    const { data: step } = await supabase
      .from("client_onboarding_steps")
      .select("id, status")
      .eq("onboarding_id", onboarding.id)
      .eq("name", stepName)
      .neq("status", "completed")
      .limit(1)
      .single()

    if (!step) return // Already completed or doesn't exist

    // Mark as completed via existing API (handles adminClient + progress recalc)
    await fetch(`/api/onboarding/${onboarding.id}/steps`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step_id: step.id,
        status: "completed",
      }),
    })
  } catch (error) {
    console.error(`[Onboarding] Error auto-marking "${stepName}":`, error)
  }
}

export function ClientStores({ clientId, clientName }: ClientStoresProps) {
  const router = useRouter()
  const [stores, setStores] = useState<ClientStore[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteStore, setDeleteStore] = useState<ClientStore | null>(null)
  const [editStore, setEditStore] = useState<ClientStore | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [testingKlaviyo, setTestingKlaviyo] = useState<string | null>(null)
  const [testingShopify, setTestingShopify] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: "",
    url: "",
    platform: "Shopify",
    currency: "BRL",
    // Shopify
    shopify_store_domain: "",
    shopify_access_token: "",
    // Klaviyo
    klaviyo_public_key: "",
    klaviyo_private_key: "",
    klaviyo_list_id: "",
    // Google Analytics
    ga4_property_id: "",
    ga4_credentials_json: "",
  })

  useEffect(() => {
    loadStores()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  async function loadStores() {
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("client_stores")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })

      if (error) throw error
      setStores(data || [])
    } catch (error) {
      console.error("Error loading stores:", error)
      // If table doesn't exist, just show empty
      setStores([])
    } finally {
      setIsLoading(false)
    }
  }

  function openDialog(store?: ClientStore) {
    if (store) {
      setEditStore(store)
      // Capitalize platform for form display (database stores as lowercase)
      const platformCapitalized = store.platform
        ? store.platform.charAt(0).toUpperCase() + store.platform.slice(1)
        : "Shopify"
      // Don't pre-fill encrypted credential fields — they show as enc:v1:...
      // User must re-enter credentials when editing. Non-sensitive fields are safe.
      const isEncrypted = (val?: string) => val?.startsWith("enc:v1:") ?? false
      setForm({
        name: store.store_name,
        url: store.store_url || "",
        platform: platformCapitalized,
        currency: store.currency || "BRL",
        // Shopify - domain is safe, token may be encrypted
        shopify_store_domain: store.shopify_store_domain || "",
        shopify_access_token: isEncrypted(store.shopify_access_token) ? "" : (store.shopify_access_token || ""),
        // Klaviyo - public key may be encrypted, private key likely encrypted
        klaviyo_public_key: isEncrypted(store.klaviyo_public_key) ? "" : (store.klaviyo_public_key || ""),
        klaviyo_private_key: isEncrypted(store.klaviyo_private_key || store.klaviyo_api_key) ? "" : (store.klaviyo_private_key || store.klaviyo_api_key || ""),
        klaviyo_list_id: store.klaviyo_list_id || "",
        // Google Analytics
        ga4_property_id: store.ga4_property_id || "",
        ga4_credentials_json: store.ga4_credentials ? JSON.stringify(store.ga4_credentials, null, 2) : "",
      })
    } else {
      setEditStore(null)
      setForm({
        name: "",
        url: "",
        platform: "Shopify",
        currency: "BRL",
        shopify_store_domain: "",
        shopify_access_token: "",
        klaviyo_public_key: "",
        klaviyo_private_key: "",
        klaviyo_list_id: "",
        ga4_property_id: "",
        ga4_credentials_json: "",
      })
    }
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name) {
      toast({
        variant: "destructive",
        title: "Nome obrigatório",
        description: "Informe o nome da loja",
      })
      return
    }

    setIsSaving(true)
    try {
      // Build store data - credentials will be encrypted server-side
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const storeData: Record<string, any> = {
        store_name: form.name,
        is_active: true,
      }

      // Add optional fields only if they have values
      if (form.url) storeData.store_url = form.url
      // Platform is an ENUM - convert to lowercase
      if (form.platform) storeData.platform = form.platform.toLowerCase()

      // Shopify fields
      if (form.shopify_store_domain) storeData.shopify_store_domain = form.shopify_store_domain
      if (form.shopify_access_token) storeData.shopify_access_token = form.shopify_access_token

      // Klaviyo fields
      if (form.klaviyo_public_key) storeData.klaviyo_public_key = form.klaviyo_public_key
      if (form.klaviyo_private_key) {
        storeData.klaviyo_private_key = form.klaviyo_private_key
        // Also set legacy field for backwards compatibility
        storeData.klaviyo_api_key = form.klaviyo_private_key
      }
      if (form.klaviyo_list_id) storeData.klaviyo_list_id = form.klaviyo_list_id

      // Google Analytics fields
      if (form.ga4_property_id) storeData.ga4_property_id = form.ga4_property_id
      if (form.ga4_credentials_json) {
        try {
          storeData.ga4_credentials = JSON.parse(form.ga4_credentials_json)
        } catch {
          toast({
            variant: "destructive",
            title: "JSON inválido",
            description: "As credenciais do Google Analytics devem ser um JSON válido",
          })
          setIsSaving(false)
          return
        }
      }

      // Save via server-side API (encrypts credentials)
      if (editStore) {
        const response = await fetch("/api/client-stores/credentials", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ store_id: editStore.id, ...storeData }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || "Erro ao atualizar")
        toast({ title: "Loja atualizada!" })
      } else {
        const response = await fetch("/api/client-stores/credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: clientId, ...storeData }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || "Erro ao criar")
        toast({ title: "Loja adicionada!" })
      }

      // Auto-mark onboarding steps when integration credentials are saved
      if (form.klaviyo_private_key) {
        markOnboardingStepCompleted(clientId, "Klaviyo Conectado")
      }
      if (form.shopify_access_token) {
        markOnboardingStepCompleted(clientId, "Acesso à Loja Configurado")
      }

      setDialogOpen(false)
      loadStores()
    } catch (error) {
      console.error("Error saving store:", error)
      const errorMsg = error instanceof Error ? error.message : String(error)
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: errorMsg,
      })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteStore) return

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("client_stores")
        .delete()
        .eq("id", deleteStore.id)

      if (error) throw error

      toast({ title: "Loja removida!" })
      setDeleteStore(null)
      loadStores()
    } catch {
      toast({
        variant: "destructive",
        title: "Erro ao remover",
        description: "Não foi possível remover a loja",
      })
    }
  }

  function isCredentialEncrypted(value?: string) {
    return value?.startsWith("enc:v1:") ?? false
  }

  async function testKlaviyoConnection(store: ClientStore) {
    const apiKey = store.klaviyo_private_key || store.klaviyo_api_key
    if (!apiKey || isCredentialEncrypted(apiKey)) {
      toast({
        variant: "destructive",
        title: "Teste via edição",
        description: "Edite a loja e re-insira a Private Key para testar a conexão",
      })
      return
    }

    setTestingKlaviyo(store.id)
    try {
      const response = await fetch("/api/integrations/klaviyo/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey }),
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Conexão bem sucedida!",
          description: data.account ? `Conectado a: ${data.account}` : "A API do Klaviyo está funcionando corretamente",
        })
      } else {
        throw new Error(data.error || "Falha na conexão")
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro na conexão",
        description: error instanceof Error ? error.message : "Verifique se a Private API Key está correta",
      })
    } finally {
      setTestingKlaviyo(null)
    }
  }

  async function testShopifyConnection(store: ClientStore) {
    if (!store.shopify_store_domain || !store.shopify_access_token) {
      toast({
        variant: "destructive",
        title: "Credenciais não configuradas",
        description: "Configure o domínio e o Access Token da Shopify primeiro",
      })
      return
    }

    if (isCredentialEncrypted(store.shopify_access_token)) {
      toast({
        variant: "destructive",
        title: "Teste via edição",
        description: "Edite a loja e re-insira o Access Token para testar a conexão",
      })
      return
    }

    setTestingShopify(store.id)
    try {
      const response = await fetch("/api/integrations/shopify/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_domain: store.shopify_store_domain,
          access_token: store.shopify_access_token,
        }),
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Conexão Shopify bem sucedida!",
          description: data.shop?.name
            ? `Conectado a: ${data.shop.name} (${data.shop.currency})`
            : "A API da Shopify está funcionando corretamente",
        })
      } else {
        const errorMsg = data.error || "Falha na conexão"
        const details = data.details?.domain
          ? ` (Domínio: ${data.details.domain})`
          : ""
        throw new Error(errorMsg + details)
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro na conexão Shopify",
        description: error instanceof Error ? error.message : "Verifique as credenciais da Shopify",
      })
    } finally {
      setTestingShopify(null)
    }
  }

  async function checkDatabaseStatus() {
    try {
      const response = await fetch("/api/setup/database")
      const data = await response.json()

      if (data.tables?.client_stores?.exists) {
        toast({
          title: "Tabelas OK",
          description: "As tabelas do banco de dados estão configuradas corretamente.",
        })
        loadStores()
      } else {
        toast({
          variant: "destructive",
          title: "Tabela não encontrada",
          description: "Execute o SQL de migração no Supabase SQL Editor. Arquivo: supabase/migrations/20241213_add_store_credentials.sql",
        })
      }
    } catch (error) {
      console.error("Error checking database:", error)
      toast({
        variant: "destructive",
        title: "Erro ao verificar",
        description: "Não foi possível verificar o status do banco de dados",
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Lojas do Cliente</h3>
          <p className="text-sm text-muted-foreground">
            Configure as lojas e integrações Klaviyo de {clientName}
          </p>
        </div>
        <Button onClick={() => openDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Loja
        </Button>
      </div>

      {/* Stores List */}
      {stores.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Store className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhuma loja cadastrada</h3>
            <p className="text-muted-foreground text-center mt-1">
              Adicione as lojas deste cliente para configurar integrações
            </p>
            <div className="flex gap-2 mt-4">
              <Button onClick={() => openDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Loja
              </Button>
              <Button variant="outline" onClick={checkDatabaseStatus}>
                <Database className="mr-2 h-4 w-4" />
                Verificar BD
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {stores.map((store) => (
            <GlowCard key={store.id} color="primary" intensity="subtle">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg p-2 bg-primary/10">
                      <Store className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{store.store_name}</CardTitle>
                      {store.platform && (
                        <CardDescription>{store.platform}</CardDescription>
                      )}
                    </div>
                  </div>
                  <Badge variant={store.is_active ? "success" : "secondary"}>
                    {store.is_active ? "Ativa" : "Inativa"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {store.store_url && (
                  <div className="flex items-center gap-2 text-sm">
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={store.store_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline truncate"
                    >
                      {store.store_url}
                    </a>
                  </div>
                )}

                {/* Shopify Integration Status */}
                {store.platform?.toLowerCase() === "shopify" && (
                  <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Store className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium">Shopify</span>
                      </div>
                      {store.shopify_access_token ? (
                        <Badge variant="success" className="flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          Configurado
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <X className="h-3 w-3" />
                          Não configurado
                        </Badge>
                      )}
                    </div>
                    {store.shopify_store_domain && (
                      <div className="text-xs text-muted-foreground">
                        Domínio: {store.shopify_store_domain}
                      </div>
                    )}
                    {store.currency && (
                      <div className="text-xs text-muted-foreground">
                        Moeda: {store.currency}
                      </div>
                    )}
                    {store.shopify_access_token && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testShopifyConnection(store)}
                        disabled={testingShopify === store.id}
                      >
                        {testingShopify === store.id ? (
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-3 w-3" />
                        )}
                        Testar Conexão
                      </Button>
                    )}
                  </div>
                )}

                {/* Klaviyo Integration Status */}
                <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-purple-500" />
                      <span className="text-sm font-medium">Klaviyo</span>
                    </div>
                    {(store.klaviyo_private_key || store.klaviyo_api_key) ? (
                      <Badge variant="success" className="flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        Configurado
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <X className="h-3 w-3" />
                        Não configurado
                      </Badge>
                    )}
                  </div>
                  {(store.klaviyo_private_key || store.klaviyo_api_key) && (
                    <>
                      {store.klaviyo_public_key && (
                        <div className="text-xs text-muted-foreground">
                          Site ID: {store.klaviyo_public_key.startsWith("enc:v1:") ? "••••••" : store.klaviyo_public_key}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        Private Key: ••••••••
                      </div>
                      {store.klaviyo_list_id && (
                        <div className="text-xs text-muted-foreground">
                          List ID: {store.klaviyo_list_id}
                        </div>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testKlaviyoConnection(store)}
                        disabled={testingKlaviyo === store.id}
                      >
                        {testingKlaviyo === store.id ? (
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-3 w-3" />
                        )}
                        Testar Conexão
                      </Button>
                    </>
                  )}
                </div>

                {/* Google Analytics Integration Status */}
                <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-orange-500" />
                      <span className="text-sm font-medium">Google Analytics</span>
                    </div>
                    {store.ga4_property_id ? (
                      <Badge variant="success" className="flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        Configurado
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <X className="h-3 w-3" />
                        Não configurado
                      </Badge>
                    )}
                  </div>
                  {store.ga4_property_id && (
                    <div className="text-xs text-muted-foreground">
                      Property ID: {store.ga4_property_id}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1"
                    onClick={() => router.push(`/stores/${store.id}`)}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Ir para Loja
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openDialog(store)}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteStore(store)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </GlowCard>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              {editStore ? "Editar Loja" : "Nova Loja"}
            </DialogTitle>
            <DialogDescription>
              Configure os dados da loja e integrações
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 overflow-y-auto flex-1 pr-2">
            <div className="space-y-2">
              <Label>Nome da Loja *</Label>
              <Input
                placeholder="Ex: Loja Principal"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>URL</Label>
              <Input
                placeholder="https://minhaloja.com.br"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Plataforma</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
              >
                <option value="Shopify">Shopify</option>
                <option value="VTEX">VTEX</option>
                <option value="Nuvemshop">Nuvemshop</option>
                <option value="WooCommerce">WooCommerce</option>
                <option value="Magento">Magento</option>
                <option value="Outro">Outro</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label>Moeda</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                <option value="BRL">BRL - Real Brasileiro</option>
                <option value="USD">USD - Dólar Americano</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - Libra Esterlina</option>
                <option value="ARS">ARS - Peso Argentino</option>
                <option value="CLP">CLP - Peso Chileno</option>
                <option value="COP">COP - Peso Colombiano</option>
                <option value="MXN">MXN - Peso Mexicano</option>
                <option value="PEN">PEN - Sol Peruano</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Moeda usada para exibir valores nos relatórios
              </p>
            </div>

            {/* Shopify Integration */}
            {form.platform === "Shopify" && (
              <div className="border-t pt-4 mt-4">
                <h4 className="font-medium flex items-center gap-2 mb-4">
                  <Store className="h-4 w-4 text-green-500" />
                  Integração Shopify
                </h4>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Domínio da Loja</Label>
                    <Input
                      placeholder="minhaloja.myshopify.com"
                      value={form.shopify_store_domain}
                      onChange={(e) => setForm({ ...form, shopify_store_domain: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Domínio .myshopify.com da sua loja
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Admin API Access Token</Label>
                    <Input
                      type="password"
                      placeholder="shpat_xxxxxxxxxxxxxxxx"
                      value={form.shopify_access_token}
                      onChange={(e) => setForm({ ...form, shopify_access_token: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Crie em Settings → Apps → Develop apps → Create app → Admin API access token
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Klaviyo Integration */}
            <div className="border-t pt-4 mt-4">
              <h4 className="font-medium flex items-center gap-2 mb-4">
                <Key className="h-4 w-4 text-purple-500" />
                Integração Klaviyo
              </h4>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Public API Key / Site ID</Label>
                  <Input
                    placeholder="XXXXXX (6 caracteres)"
                    value={form.klaviyo_public_key}
                    onChange={(e) => setForm({ ...form, klaviyo_public_key: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Encontre em Klaviyo → Settings → API Keys → Public API Key (Site ID)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Private API Key *</Label>
                  <Input
                    type="password"
                    placeholder="pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={form.klaviyo_private_key}
                    onChange={(e) => setForm({ ...form, klaviyo_private_key: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Encontre em Klaviyo → Settings → API Keys → Create Private API Key
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>List ID (opcional)</Label>
                  <Input
                    placeholder="ID da lista principal"
                    value={form.klaviyo_list_id}
                    onChange={(e) => setForm({ ...form, klaviyo_list_id: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Google Analytics Integration */}
            <div className="border-t pt-4 mt-4">
              <h4 className="font-medium flex items-center gap-2 mb-4">
                <BarChart3 className="h-4 w-4 text-orange-500" />
                Integração Google Analytics (GA4)
              </h4>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Property ID</Label>
                  <Input
                    placeholder="123456789"
                    value={form.ga4_property_id}
                    onChange={(e) => setForm({ ...form, ga4_property_id: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Encontre em GA4 → Admin → Property Settings → Property ID
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <FileJson className="h-4 w-4" />
                    Service Account Credentials (JSON)
                  </Label>
                  <textarea
                    className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono text-xs"
                    placeholder='{"type": "service_account", "project_id": "...", "private_key_id": "...", "private_key": "...", "client_email": "...", ...}'
                    value={form.ga4_credentials_json}
                    onChange={(e) => setForm({ ...form, ga4_credentials_json: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Cole o JSON completo da service account. Crie em Google Cloud Console → IAM → Service Accounts → Create → Keys → Add Key → JSON
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editStore ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteStore} onOpenChange={() => setDeleteStore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover loja</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover a loja &quot;{deleteStore?.store_name}&quot;?
              As configurações de integração serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
