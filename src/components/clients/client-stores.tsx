"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Store,
  Plus,
  Trash2,
  Edit,
  ExternalLink,
  Eye,
  Loader2,
  Info,
  Settings,
  AlertTriangle,
  RefreshCw,
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

interface ClientStore {
  id: string
  store_name: string
  store_url?: string
  platform?: string
  currency?: string
  is_active: boolean
  created_at: string
  client_id?: string
  shopify_store_domain?: string
  // Non-sensitive integration fields
  klaviyo_public_key?: string
  klaviyo_list_id?: string
  ga4_property_id?: string
  // Server-computed credential flags (no encrypted data exposed)
  has_shopify_credentials?: boolean
  has_klaviyo_credentials?: boolean
  has_ga4_credentials?: boolean
  // Client relation
  client?: { id: string; name: string; company?: string; email?: string }
}

interface ClientStoresProps {
  clientId: string
  clientName: string
}

export function ClientStores({ clientId, clientName }: ClientStoresProps) {
  const router = useRouter()
  const [stores, setStores] = useState<ClientStore[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteStore, setDeleteStore] = useState<ClientStore | null>(null)
  const [editStore, setEditStore] = useState<ClientStore | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [form, setForm] = useState({
    name: "",
    url: "",
    platform: "Shopify",
    currency: "BRL",
  })

  useEffect(() => {
    loadStores()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  async function loadStores() {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/stores?client_id=${clientId}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Erro ao carregar lojas (${res.status})`)
      }
      const { stores: data } = await res.json()
      setStores(data || [])
    } catch (error) {
      console.error("Error loading stores:", error)
      const msg = error instanceof Error ? error.message : "Erro desconhecido"
      setLoadError(msg)
      toast({
        variant: "destructive",
        title: "Erro ao carregar lojas",
        description: msg,
      })
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
      setForm({
        name: store.store_name,
        url: store.store_url || "",
        platform: platformCapitalized,
        currency: store.currency || "BRL",
      })
    } else {
      setEditStore(null)
      setForm({
        name: "",
        url: "",
        platform: "Shopify",
        currency: "BRL",
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
      // Build store data - only basic metadata fields
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const storeData: Record<string, any> = {
        store_name: form.name,
        is_active: true,
      }

      // Add optional fields only if they have values
      if (form.url) storeData.store_url = form.url
      // Platform is an ENUM - convert to lowercase
      if (form.platform) storeData.platform = form.platform.toLowerCase()
      if (form.currency) storeData.currency = form.currency

      // Save via server-side API
      if (editStore) {
        const response = await fetch("/api/client-stores/credentials", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ store_id: editStore.id, ...storeData }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || "Erro ao atualizar")
        toast({ title: "Loja atualizada!" })
        setDialogOpen(false)
        loadStores()
      } else {
        const response = await fetch("/api/client-stores/credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: clientId, ...storeData }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || "Erro ao criar")
        toast({ title: "Loja criada! Configure as integrações." })
        setDialogOpen(false)
        // Redirect to store settings for credential configuration
        router.push(`/admin/stores/${result.store.id}?tab=settings`)
      }
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
      const res = await fetch(`/api/client-stores/${deleteStore.id}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Erro ao remover loja")
      }

      toast({ title: "Loja removida!" })
      setDeleteStore(null)
      loadStores()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao remover",
        description: error instanceof Error ? error.message : "Não foi possível remover a loja",
      })
    }
  }



  /** Helper: check if any integration is missing credentials */
  function hasPendingIntegrations(store: ClientStore): boolean {
    return !store.has_shopify_credentials || !store.has_klaviyo_credentials || !store.has_ga4_credentials
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
          <h3 className="text-lg font-semibold">
            Lojas do Cliente
            {stores.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({stores.length} {stores.length === 1 ? "loja vinculada" : "lojas vinculadas"})
              </span>
            )}
          </h3>
          <p className="text-sm text-muted-foreground">
            Configure as lojas e integrações Klaviyo de {clientName}
          </p>
        </div>
        <Button onClick={() => openDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Loja
        </Button>
      </div>

      {/* Error State */}
      {loadError && stores.length === 0 && (
        <Card className="border-destructive">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
            <h3 className="text-lg font-medium">Erro ao carregar lojas</h3>
            <p className="text-muted-foreground text-center mt-1">
              {loadError}
            </p>
            <Button variant="secondary" onClick={loadStores} className="mt-4">
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stores List */}
      {!loadError && stores.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Store className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhuma loja vinculada</h3>
            <p className="text-muted-foreground text-center mt-1">
              Adicione uma loja para {clientName} configurar integrações e acompanhar resultados
            </p>
            <div className="flex gap-2 mt-4">
              <Button onClick={() => openDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Loja
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : stores.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {stores.map((store) => (
            <Card key={store.id} className="rounded-xl border bg-card">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg p-2 bg-primary/10">
                      <Store className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{store.store_name}</CardTitle>
                      <CardDescription>
                        {store.platform && <>{store.platform}</>}
                        {store.platform && store.currency && <> &middot; </>}
                        {store.currency && <>{store.currency}</>}
                      </CardDescription>
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
                      className="text-primary hover:underline truncate"
                    >
                      {store.store_url}
                    </a>
                  </div>
                )}

                {/* Compact Integration Status Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${store.has_shopify_credentials ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                      <span className="text-muted-foreground">Shopify</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${store.has_klaviyo_credentials ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                      <span className="text-muted-foreground">Klaviyo</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${store.has_ga4_credentials ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                      <span className="text-muted-foreground">GA4</span>
                    </div>
                  </div>
                  {hasPendingIntegrations(store) && (
                    <Link
                      href={`/admin/stores/${store.id}?tab=settings`}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <Settings className="h-3 w-3" />
                      Configurar
                    </Link>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    className="flex-1"
                    onClick={() => router.push(`/admin/stores/${store.id}`)}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Ir para Loja
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => openDialog(store)}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Editar
                  </Button>
                  <Button
                    variant="secondary"
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
      ) : null}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              {editStore ? "Editar Loja" : "Nova Loja"}
            </DialogTitle>
            <DialogDescription>
              Altere as informações básicas da loja
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
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

            {/* Info banner: credentials are managed in store settings */}
            <div className="rounded-lg border bg-muted/50 p-3 flex items-start gap-3">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-sm text-muted-foreground">
                Para configurar credenciais (Shopify, Klaviyo, GA4), acesse a{" "}
                {editStore ? (
                  <Link
                    href={`/admin/stores/${editStore.id}?tab=settings`}
                    className="text-primary hover:underline font-medium"
                  >
                    página da loja &rarr; Configurações
                  </Link>
                ) : (
                  <span className="font-medium">página da loja &rarr; Configurações</span>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
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
