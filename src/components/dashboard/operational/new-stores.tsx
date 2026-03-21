"use client"

import Link from "next/link"
import { Store } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
  shopify: { label: "Shopify", color: "bg-green-500/10 text-green-600 dark:text-green-400" },
  nuvemshop: { label: "Nuvemshop", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  woocommerce: { label: "WooCommerce", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  other: { label: "Outra", color: "bg-gray-500/10 text-gray-600 dark:text-gray-400" },
}

const ONBOARDING_STATUS: Record<string, { label: string; color: string }> = {
  not_started: { label: "Não Iniciado", color: "bg-gray-500/10 text-gray-500" },
  in_progress: { label: "Em Progresso", color: "bg-blue-500/10 text-blue-500" },
  paused: { label: "Pausado", color: "bg-yellow-500/10 text-yellow-500" },
  completed: { label: "Concluído", color: "bg-green-500/10 text-green-500" },
  cancelled: { label: "Cancelado", color: "bg-red-500/10 text-red-500" },
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date

  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "agora"
  if (minutes < 60) return `${minutes} min atrás`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h atrás`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d atrás`

  return new Date(dateStr).toLocaleDateString("pt-BR")
}

interface NewStoresProps {
  stores: Array<{
    id: string
    store_name: string
    store_url: string
    platform: string
    is_active: boolean
    created_at: string
    client: { id: string; name: string; status: string } | { id: string; name: string; status: string }[] | null
    onboardings: Array<{
      id: string
      status: string
      progress_percent: number
      target_completion_date: string | null
    }> | null
  }>
}

export function NewStores({ stores }: NewStoresProps) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <CardHeader className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon icon={Store} size={16} className="text-success" />
            <CardTitle className="text-sm font-medium text-foreground">Lojas para Implementação</CardTitle>
          </div>
          {stores.length > 0 && (
            <Badge variant="neutral" className="text-xs">
              {stores.length}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {stores.length > 0 ? (
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-2">
              {stores.map((store) => {
                const client = Array.isArray(store.client) ? store.client[0] : store.client
                const onboarding = store.onboardings?.[0]
                const platform = PLATFORM_CONFIG[store.platform] || PLATFORM_CONFIG.other
                const onboardingStatus = onboarding
                  ? ONBOARDING_STATUS[onboarding.status] || ONBOARDING_STATUS.not_started
                  : null
                const hasNoOnboarding = !onboarding

                return (
                  <Link
                    key={store.id}
                    href={`/admin/stores/${store.id}`}
                    className={cn(
                      "block p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors",
                      hasNoOnboarding && "border-warning/30"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-md p-1.5 bg-success/10 shrink-0">
                        <Icon icon={Store} customSize={14} className="text-success" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate text-foreground">{store.store_name}</p>
                          <Badge
                            variant="neutral"
                            className={cn("text-[10px] h-5 px-2 shrink-0", platform.color)}
                          >
                            {platform.label}
                          </Badge>
                        </div>
                        {client && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {client.name}
                          </p>
                        )}

                        {onboarding ? (
                          <div className="mt-1.5 space-y-1">
                            <div className="flex items-center justify-between">
                              <Badge
                                variant="neutral"
                                className={cn("text-[10px] h-5 px-2", onboardingStatus?.color)}
                              >
                                {onboardingStatus?.label} {onboarding.progress_percent}%
                              </Badge>
                              {onboarding.target_completion_date && (
                                <span className="text-[10px] text-muted-foreground">
                                  Meta: {new Date(onboarding.target_completion_date).toLocaleDateString("pt-BR")}
                                </span>
                              )}
                            </div>
                            <Progress value={onboarding.progress_percent} className="h-1" />
                          </div>
                        ) : (
                          <div className="mt-1.5">
                            <Badge variant="neutral" className="text-[10px] h-5 px-2 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                              Sem onboarding
                            </Badge>
                            <span className="text-[10px] text-muted-foreground ml-2">
                              {timeAgo(store.created_at)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Icon icon={Store} customSize={32} className="mb-2 opacity-50" />
            <p className="text-sm">Nenhuma loja pendente de implementacao</p>
          </div>
        )}
      </CardContent>
    </div>
  )
}
