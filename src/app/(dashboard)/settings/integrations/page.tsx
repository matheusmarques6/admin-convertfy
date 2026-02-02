"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Plug,
  CreditCard,
  Brain,
  Calendar,
  MessageSquare,
  ShoppingBag,
  BarChart3,
  Instagram,
  Mail,
  Check,
  X,
  ExternalLink,
  Settings,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/lib/hooks/use-toast"
import type { IntegrationType } from "@/types"

interface Integration {
  id: string
  type: IntegrationType
  name: string
  is_active: boolean
  last_sync: string | null
}

const integrationConfig: Record<IntegrationType, {
  name: string
  description: string
  icon: React.ElementType
  color: string
  docs?: string
}> = {
  asaas: {
    name: "Asaas",
    description: "Gateway de pagamentos - cobranças, boletos e Pix",
    icon: CreditCard,
    color: "text-emerald-500",
    docs: "https://docs.asaas.com",
  },
  meta_ads: {
    name: "Meta Ads",
    description: "Facebook e Instagram Ads - métricas de campanhas",
    icon: BarChart3,
    color: "text-blue-500",
  },
  google_ads: {
    name: "Google Ads",
    description: "Métricas de campanhas do Google Ads",
    icon: BarChart3,
    color: "text-amber-500",
  },
  klaviyo: {
    name: "Klaviyo",
    description: "Email marketing - métricas e automações",
    icon: Mail,
    color: "text-purple-500",
  },
  shopify: {
    name: "Shopify",
    description: "Dados de lojas e métricas de vendas",
    icon: ShoppingBag,
    color: "text-green-500",
  },
  instagram: {
    name: "Instagram",
    description: "Métricas de contas e posts",
    icon: Instagram,
    color: "text-pink-500",
  },
  whatsapp: {
    name: "WhatsApp Business",
    description: "Envio de mensagens automáticas",
    icon: MessageSquare,
    color: "text-green-500",
  },
  google_calendar: {
    name: "Google Calendar",
    description: "Sincronização de reuniões",
    icon: Calendar,
    color: "text-blue-500",
  },
}

const allIntegrationTypes: IntegrationType[] = [
  "asaas",
  "google_calendar",
  "whatsapp",
  "meta_ads",
  "google_ads",
  "klaviyo",
  "shopify",
  "instagram",
]

export default function IntegrationsSettingsPage() {
  const [integrations, setIntegrations] = useState<Map<IntegrationType, Integration>>(new Map())
  const [isFetching, setIsFetching] = useState(true)

  useEffect(() => {
    async function fetchIntegrations() {
      try {
        const supabase = createClient()

        const { data, error } = await supabase
          .from("integrations")
          .select("*")

        if (error) throw error

        const map = new Map<IntegrationType, Integration>()
        data?.forEach((int) => {
          map.set(int.type as IntegrationType, int)
        })

        setIntegrations(map)
      } catch (error) {
        console.error("Error fetching integrations:", error)
      } finally {
        setIsFetching(false)
      }
    }

    fetchIntegrations()
  }, [])

  async function handleToggle(type: IntegrationType, currentState: boolean) {
    const integration = integrations.get(type)

    try {
      const supabase = createClient()

      if (integration) {
        // Update existing
        const { error } = await supabase
          .from("integrations")
          .update({
            is_active: !currentState,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integration.id)

        if (error) throw error

        setIntegrations(new Map(integrations.set(type, { ...integration, is_active: !currentState })))
      } else {
        // Create new
        const config = integrationConfig[type]
        const { data, error } = await supabase
          .from("integrations")
          .insert({
            type,
            name: config.name,
            is_active: true,
            credentials: {},
          })
          .select()
          .single()

        if (error) throw error

        setIntegrations(new Map(integrations.set(type, data)))
      }

      toast({
        title: currentState ? "Integração desativada" : "Integração ativada",
        description: `${integrationConfig[type].name} foi ${currentState ? "desativada" : "ativada"}.`,
      })
    } catch (error) {
      console.error("Error toggling integration:", error)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível alterar a integração.",
      })
    }
  }

  function formatLastSync(date: string | null): string {
    if (!date) return "Nunca sincronizado"

    const diff = Date.now() - new Date(date).getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))

    if (hours < 1) return "Sincronizado há menos de 1 hora"
    if (hours < 24) return `Sincronizado há ${hours}h`

    const days = Math.floor(hours / 24)
    return `Sincronizado há ${days}d`
  }

  if (isFetching) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Integrações</h1>
          <p className="text-muted-foreground">
            Conecte com serviços externos
          </p>
        </div>
      </div>

      {/* Info Card */}
      <Card className="border-amber-500/50 bg-amber-500/5">
        <CardContent className="flex items-start gap-4 pt-6">
          <div className="rounded-lg p-2 bg-amber-500/10">
            <Plug className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <p className="font-medium">Configuração de Integrações</p>
            <p className="text-sm text-muted-foreground">
              Para ativar uma integração, você precisa configurar as credenciais de API.
              As integrações marcadas como "Ativas" estão funcionando corretamente.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Integrations Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {allIntegrationTypes.map((type) => {
          const config = integrationConfig[type]
          const integration = integrations.get(type)
          const isActive = integration?.is_active || false
          const Icon = config.icon

          return (
            <Card key={type} className={isActive ? "border-primary/50" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-lg p-2 ${isActive ? "bg-primary/10" : "bg-muted"}`}>
                      <Icon className={`h-5 w-5 ${isActive ? config.color : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {config.name}
                        {isActive && (
                          <Badge variant="default" className="text-xs">
                            Ativa
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="text-xs mt-1">
                        {config.description}
                      </CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={isActive}
                    onCheckedChange={() => handleToggle(type, isActive)}
                  />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {integration ? formatLastSync(integration.last_sync) : "Não configurada"}
                  </span>
                  <div className="flex gap-2">
                    {config.docs && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={config.docs} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Docs
                        </a>
                      </Button>
                    )}
                    {isActive && (
                      <Button variant="ghost" size="sm" disabled>
                        <Settings className="h-3 w-3 mr-1" />
                        Configurar
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Status Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status das Integrações</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-emerald-500" />
              <span className="text-sm">
                {Array.from(integrations.values()).filter(i => i.is_active).length} ativas
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-muted-foreground" />
              <span className="text-sm">
                {allIntegrationTypes.length - Array.from(integrations.values()).filter(i => i.is_active).length} inativas
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Back */}
      <div className="flex justify-end">
        <Button variant="outline" asChild>
          <Link href="/settings">Voltar</Link>
        </Button>
      </div>
    </div>
  )
}
