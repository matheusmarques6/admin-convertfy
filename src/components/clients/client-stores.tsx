"use client"

import { useState, useEffect } from "react"
import {
  Store,
  Plus,
  Trash2,
  Edit,
  Key,
  ExternalLink,
  Loader2,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  Database,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  is_active: boolean
  created_at: string
}

interface ClientStoresProps {
  clientId: string
  clientName: string
}

export function ClientStores({ clientId, clientName }: ClientStoresProps) {
  const [stores, setStores] = useState<ClientStore[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteStore, setDeleteStore] = useState<ClientStore | null>(null)
  const [editStore, setEditStore] = useState<ClientStore | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [testingKlaviyo, setTestingKlaviyo] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: "",
    url: "",
    platform: "Shopify",
    // Shopify
    shopify_store_domain: "",
    shopify_access_token: "",
    // Klaviyo
    klaviyo_public_key: "",
    klaviyo_private_key: "",
    klaviyo_list_id: "",
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
      setForm({
        name: store.store_name,
        url: store.store_url || "",
        platform: store.platform || "Shopify",
        // Shopify
        shopify_store_domain: store.shopify_store_domain || "",
        shopify_access_token: store.shopify_access_token || "",
        // Klaviyo - use new fields or fall back to legacy
        klaviyo_public_key: store.klaviyo_public_key || "",
        klaviyo_private_key: store.klaviyo_private_key || store.klaviyo_api_key || "",
        klaviyo_list_id: store.klaviyo_list_id || "",
      })
    } else {
      setEditStore(null)
      setForm({
        name: "",
        url: "",
        platform: "Shopify",
        shopify_store_domain: "",
        shopify_access_token: "",
        klaviyo_public_key: "",
        klaviyo_private_key: "",
        klaviyo_list_id: "",
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
      const supabase = createClient()

      // Build store data object - only include fields with values
      // Using correct column names: store_name, store_url
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const storeData: Record<string, any> = {
        client_id: clientId,
        store_name: form.name,
        is_active: true,
      }

      // Add optional fields only if they have values
      if (form.url) storeData.store_url = form.url
      if (form.platform) storeData.platform = form.platform

      // Shopify fields
      if (form.shopify_store_domain) storeData.shopify_store_domain = form.shopify_store_domain
      if (form.shopify_access_token) storeData.shopify_access_token = form.shopify_access_token

      // Klaviyo fields - try new column names first
      if (form.klaviyo_public_key) storeData.klaviyo_public_key = form.klaviyo_public_key
      if (form.klaviyo_private_key) {
        storeData.klaviyo_private_key = form.klaviyo_private_key
        // Also set legacy field for backwards compatibility
        storeData.klaviyo_api_key = form.klaviyo_private_key
      }
      if (form.klaviyo_list_id) storeData.klaviyo_list_id = form.klaviyo_list_id

      console.log("Saving store data:", storeData)

      if (editStore) {
        const { error } = await supabase
          .from("client_stores")
          .update(storeData)
          .eq("id", editStore.id)

        if (error) {
          console.error("Supabase update error:", error)
          throw error
        }
        toast({ title: "Loja atualizada!" })
      } else {
        const { error } = await supabase
          .from("client_stores")
          .insert(storeData)

        if (error) {
          console.error("Supabase insert error:", error)
          throw error
        }
        toast({ title: "Loja adicionada!" })
      }

      setDialogOpen(false)
      loadStores()
    } catch (error) {
      console.error("Error saving store:", error)
      // Supabase errors have message, details, hint, code properties
      const supabaseError = error as { message?: string; details?: string; hint?: string; code?: string }
      const errorMsg = supabaseError.message || (error instanceof Error ? error.message : String(error))

      // Check if it's a column not found error
      if (errorMsg.includes("column") && errorMsg.includes("does not exist")) {
        toast({
          variant: "destructive",
          title: "Coluna não encontrada",
          description: `${errorMsg}. Execute a migração SQL no Supabase.`,
        })
      } else {
        toast({
          variant: "destructive",
          title: "Erro ao salvar",
          description: errorMsg,
        })
      }
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

  async function testKlaviyoConnection(store: ClientStore) {
    const apiKey = store.klaviyo_private_key || store.klaviyo_api_key
    if (!apiKey) {
      toast({
        variant: "destructive",
        title: "API Key não configurada",
        description: "Configure a Private API Key do Klaviyo primeiro",
      })
      return
    }

    setTestingKlaviyo(store.id)
    try {
      // Test Klaviyo API connection
      const response = await fetch("https://a.klaviyo.com/api/accounts/", {
        headers: {
          "Authorization": `Klaviyo-API-Key ${apiKey}`,
          "revision": "2024-02-15",
        },
      })

      if (response.ok) {
        toast({
          title: "Conexão bem sucedida!",
          description: "A API do Klaviyo está funcionando corretamente",
        })
      } else {
        throw new Error("Falha na conexão")
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Erro na conexão",
        description: "Verifique se a Private API Key está correta",
      })
    } finally {
      setTestingKlaviyo(null)
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
            <Card key={store.id}>
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
                          Site ID: {store.klaviyo_public_key}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        Private Key: ****{(store.klaviyo_private_key || store.klaviyo_api_key || "").slice(-8)}
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

                {/* Actions */}
                <div className="flex gap-2">
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
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              {editStore ? "Editar Loja" : "Nova Loja"}
            </DialogTitle>
            <DialogDescription>
              Configure os dados da loja e integração Klaviyo
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
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
