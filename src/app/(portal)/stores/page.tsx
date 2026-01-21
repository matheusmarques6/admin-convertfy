"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Store,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  Users,
  DollarSign,
  Mail,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

interface StoreData {
  id: string
  store_name: string
  store_url: string
  platform: string
  is_active: boolean
  klaviyo_api_key?: string
  shopify_access_token?: string
  lastSync?: string
}

interface StoresResponse {
  stores: StoreData[]
}

const platformIcons = {
  shopify: "https://cdn.shopify.com/shopifycloud/brochure/assets/brand-assets/shopify-logo-primary-logo-456baa801ee66a0a435671082365958316831c9960c480451dd0330bcdae304f.svg",
  nuvemshop: "https://d26lpennugtm8s.cloudfront.net/assets/common/nuvemshop-logo-0d8d2e52a52b2f4cb47a38f52dd54aa04b7a0f83ecfbee3b3d6b3f6e3c0e0e0c.svg",
  woocommerce: "https://woocommerce.com/wp-content/themes/flavor-developer/assets/images/logo-woocommerce@2x.png",
}

export default function PortalStoresPage() {
  const [stores, setStores] = useState<StoreData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
          Acompanhe os resultados de cada loja configurada na plataforma
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
          {stores.map((store) => (
            <Card key={store.id} className="hover:shadow-md transition-shadow">
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
                    {store.klaviyo_api_key ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        Conectado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-50">
                        Não conectado
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Shopify</span>
                    {store.shopify_access_token ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        Conectado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-50">
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
                  {store.store_url && (
                    <Button variant="outline" size="icon" asChild>
                      <a href={store.store_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Quick Stats Legend */}
      {stores.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Como ler seus relatórios</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Users className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">Total de Leads</p>
                  <p className="text-xs text-muted-foreground">
                    Total de contatos cadastrados na sua base
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">Leads Engajados</p>
                  <p className="text-xs text-muted-foreground">
                    Contatos que interagiram nos últimos 90 dias
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <DollarSign className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">Receita Atribuída</p>
                  <p className="text-xs text-muted-foreground">
                    Vendas geradas via email marketing
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                  <Mail className="h-4 w-4 text-orange-600" />
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
        </Card>
      )}
    </div>
  )
}
