"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Store,
  ExternalLink,
  AlertCircle,
  TrendingUp,
  Users,
  DollarSign,
  Mail,
  Key,
  Loader2,
  CheckCircle2,
  Settings,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GlowCard } from "@/components/ui/glow-card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
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
import { toast } from "@/lib/hooks/use-toast"

interface StoreData {
  id: string
  store_name: string
  store_url: string
  platform: string
  is_active: boolean
  hasKlaviyo: boolean
  shopify_access_token: boolean
  shopify_store_domain: string
}

interface StoresResponse {
  stores: StoreData[]
}

export default function PortalStoresPage() {
  const [stores, setStores] = useState<StoreData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Credentials dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedStore, setSelectedStore] = useState<StoreData | null>(null)
  const [credForm, setCredForm] = useState({
    klaviyo_private_key: "",
    shopify_store_domain: "",
    shopify_access_token: "",
  })
  const [testing, setTesting] = useState<"klaviyo" | "shopify" | null>(null)
  const [testResult, setTestResult] = useState<{ type: string; success: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchStores = async () => {
    try {
      const response = await fetch("/api/portal/stores")
      if (!response.ok) {
        throw new Error("Erro ao carregar lojas")
      }
      const data: StoresResponse = await response.json()
      setStores(data.stores)
      setError(null)
    } catch (err) {
      console.error("Stores fetch error:", err)
      setError("Não foi possível carregar as lojas")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStores()
  }, [])

  function openCredentialsDialog(store: StoreData) {
    setSelectedStore(store)
    setCredForm({
      klaviyo_private_key: "",
      shopify_store_domain: store.shopify_store_domain || "",
      shopify_access_token: "",
    })
    setTestResult(null)
    setDialogOpen(true)
  }

  async function testKlaviyo() {
    if (!credForm.klaviyo_private_key) {
      toast({ variant: "destructive", title: "Informe a Private API Key do Klaviyo" })
      return
    }
    setTesting("klaviyo")
    setTestResult(null)
    try {
      const res = await fetch("/api/integrations/klaviyo/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: credForm.klaviyo_private_key }),
      })
      const data = await res.json()
      if (data.success) {
        setTestResult({
          type: "klaviyo",
          success: true,
          message: data.account ? `Conectado: ${data.account}` : "Conexão OK!",
        })
      } else {
        setTestResult({
          type: "klaviyo",
          success: false,
          message: data.error || "Falha na autenticação",
        })
      }
    } catch {
      setTestResult({ type: "klaviyo", success: false, message: "Erro ao testar conexão" })
    } finally {
      setTesting(null)
    }
  }

  async function testShopify() {
    if (!credForm.shopify_store_domain || !credForm.shopify_access_token) {
      toast({ variant: "destructive", title: "Informe o domínio e o Access Token da Shopify" })
      return
    }
    setTesting("shopify")
    setTestResult(null)
    try {
      const res = await fetch("/api/integrations/shopify/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_domain: credForm.shopify_store_domain,
          access_token: credForm.shopify_access_token,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setTestResult({
          type: "shopify",
          success: true,
          message: data.shop?.name ? `Conectado: ${data.shop.name}` : "Conexão OK!",
        })
      } else {
        setTestResult({
          type: "shopify",
          success: false,
          message: data.error || "Falha na conexão",
        })
      }
    } catch {
      setTestResult({ type: "shopify", success: false, message: "Erro ao testar conexão" })
    } finally {
      setTesting(null)
    }
  }

  async function handleSaveCredentials() {
    if (!selectedStore) return

    const hasKlaviyo = !!credForm.klaviyo_private_key
    const hasShopify = !!credForm.shopify_access_token

    if (!hasKlaviyo && !hasShopify) {
      toast({ variant: "destructive", title: "Preencha ao menos uma credencial" })
      return
    }

    setSaving(true)
    try {
      const payload: Record<string, string> = { store_id: selectedStore.id }
      if (hasKlaviyo) payload.klaviyo_private_key = credForm.klaviyo_private_key
      if (credForm.shopify_store_domain) payload.shopify_store_domain = credForm.shopify_store_domain
      if (hasShopify) payload.shopify_access_token = credForm.shopify_access_token

      const res = await fetch("/api/portal/stores", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Erro ao salvar")
      }

      toast({ title: "Credenciais salvas com sucesso!" })
      setDialogOpen(false)
      fetchStores()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Tente novamente",
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Erro ao carregar</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={fetchStores}>Tentar novamente</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Suas Lojas</h1>
        <p className="text-muted-foreground">
          Acompanhe os resultados e configure as integrações de cada loja
        </p>
      </div>

      {/* Stores Grid */}
      {stores.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Store className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhuma loja configurada</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Suas lojas serão exibidas aqui assim que forem configuradas pela equipe Convertfy.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => {
            const needsSetup = !store.hasKlaviyo || !store.shopify_access_token
            return (
              <GlowCard key={store.id} color="primary" intensity="subtle">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Store className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{store.store_name}</CardTitle>
                        <CardDescription className="capitalize">{store.platform}</CardDescription>
                      </div>
                    </div>
                    <Badge variant={store.is_active ? "default" : "secondary"}>
                      {store.is_active ? "Ativa" : "Inativa"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Integration Status */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Klaviyo</span>
                      {store.hasKlaviyo ? (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                          Conectado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                          Não conectado
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Shopify</span>
                      {store.shopify_access_token ? (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                          Conectado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                          Não conectado
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button asChild className="flex-1">
                      <Link href={`/portal/stores/${store.id}`}>
                        Ver Relatório
                      </Link>
                    </Button>
                    {needsSetup && (
                      <Button
                        variant="outline"
                        onClick={() => openCredentialsDialog(store)}
                      >
                        <Settings className="h-4 w-4 mr-1" />
                        Configurar
                      </Button>
                    )}
                    {!needsSetup && store.store_url && (
                      <Button variant="outline" size="icon" asChild>
                        <a href={store.store_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </GlowCard>
            )
          })}
        </div>
      )}

      {/* Quick Stats Legend */}
      {stores.length > 0 && (
        <GlowCard color="primary" intensity="subtle">
          <CardHeader>
            <CardTitle className="text-base">Como ler seus relatórios</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-info/10 flex items-center justify-center flex-shrink-0">
                  <Users className="h-4 w-4 text-info" />
                </div>
                <div>
                  <p className="font-medium text-sm">Total de Leads</p>
                  <p className="text-xs text-muted-foreground">
                    Total de contatos cadastrados na sua base
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="h-4 w-4 text-success" />
                </div>
                <div>
                  <p className="font-medium text-sm">Leads Engajados</p>
                  <p className="text-xs text-muted-foreground">
                    Contatos que interagiram nos últimos 90 dias
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <DollarSign className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Receita Atribuída</p>
                  <p className="text-xs text-muted-foreground">
                    Vendas geradas via email marketing
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center flex-shrink-0">
                  <Mail className="h-4 w-4 text-warning" />
                </div>
                <div>
                  <p className="font-medium text-sm">Campanhas</p>
                  <p className="text-xs text-muted-foreground">
                    Emails enviados e suas métricas
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </GlowCard>
      )}

      {/* Credentials Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Configurar Integrações</DialogTitle>
            <DialogDescription>
              {selectedStore?.store_name} &mdash; Insira suas credenciais para conectar as integrações.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Klaviyo Section */}
            {selectedStore && !selectedStore.hasKlaviyo && (
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Key className="h-4 w-4 text-primary" />
                  Klaviyo
                </h4>
                <div className="space-y-2">
                  <Label>Private API Key</Label>
                  <Input
                    type="password"
                    placeholder="pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={credForm.klaviyo_private_key}
                    onChange={(e) => setCredForm({ ...credForm, klaviyo_private_key: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Encontre em Klaviyo &rarr; Settings &rarr; API Keys &rarr; Create Private API Key
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={testKlaviyo}
                  disabled={testing === "klaviyo" || !credForm.klaviyo_private_key}
                >
                  {testing === "klaviyo" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Key className="h-4 w-4 mr-2" />
                  )}
                  Testar Conexão
                </Button>
                {testResult?.type === "klaviyo" && (
                  <div className={`flex items-center gap-2 text-sm ${testResult.success ? "text-success" : "text-destructive"}`}>
                    {testResult.success ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    {testResult.message}
                  </div>
                )}
              </div>
            )}

            {/* Shopify Section */}
            {selectedStore && !selectedStore.shopify_access_token && (
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Store className="h-4 w-4 text-success" />
                  Shopify
                </h4>
                <div className="space-y-2">
                  <Label>Domínio da Loja</Label>
                  <Input
                    placeholder="minhaloja.myshopify.com"
                    value={credForm.shopify_store_domain}
                    onChange={(e) => setCredForm({ ...credForm, shopify_store_domain: e.target.value })}
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
                    value={credForm.shopify_access_token}
                    onChange={(e) => setCredForm({ ...credForm, shopify_access_token: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Settings &rarr; Apps &rarr; Develop apps &rarr; Create app &rarr; Admin API access token
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={testShopify}
                  disabled={testing === "shopify" || !credForm.shopify_store_domain || !credForm.shopify_access_token}
                >
                  {testing === "shopify" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Store className="h-4 w-4 mr-2" />
                  )}
                  Testar Conexão
                </Button>
                {testResult?.type === "shopify" && (
                  <div className={`flex items-center gap-2 text-sm ${testResult.success ? "text-success" : "text-destructive"}`}>
                    {testResult.success ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    {testResult.message}
                  </div>
                )}
              </div>
            )}

            {/* All connected message */}
            {selectedStore?.hasKlaviyo && selectedStore?.shopify_access_token && (
              <div className="flex items-center gap-3 py-4 text-success">
                <CheckCircle2 className="h-6 w-6" />
                <p className="font-medium">Todas as integrações estão conectadas!</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveCredentials}
              disabled={saving || (!credForm.klaviyo_private_key && !credForm.shopify_access_token)}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Credenciais
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
