"use client"

import { useState, useCallback } from "react"
import {
  Kanban,
  FileText,
  BookOpen,
  Loader2,
  ExternalLink,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { OnboardingKanban } from "./onboarding-kanban"
import { StoreOnboardingCard } from "./store-onboarding-card"
import { StoreOnboardingForm } from "./store-onboarding-form"
import { StoreBriefingView } from "./store-briefing-view"
import type { StoreBriefing } from "@/types/onboarding"

interface StoreWithOnboarding {
  id: string
  store_name: string
  store_url: string | null
  platform: string | null
  client_id: string
  client_name: string
  onboarding_status: string | null
  progress_percent: number
  form_complete: boolean
  last_feedback_at: string | null
}

interface BriefingItem {
  id: string
  store_id: string
  store_name: string
  client_name: string
  version: number
  generated_at: string
  status: string
}

export function OnboardingTabs() {
  const [stores, setStores] = useState<StoreWithOnboarding[]>([])
  const [briefings, setBriefings] = useState<BriefingItem[]>([])
  const [loading, setLoading] = useState(false)
  const [briefingsLoading, setBriefingsLoading] = useState(false)

  // Dialog state for form
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [selectedStore, setSelectedStore] = useState<{ id: string; clientId: string } | null>(null)
  const [formInitialData, setFormInitialData] = useState<Record<string, unknown> | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  // Dialog state for briefing
  const [briefingDialogOpen, setBriefingDialogOpen] = useState(false)
  const [selectedBriefing, setSelectedBriefing] = useState<StoreBriefing | null>(null)
  const [selectedBriefingStoreId, setSelectedBriefingStoreId] = useState<string>("")

  const fetchStores = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch all onboardings to cross-reference
      const [onbRes, storesRes] = await Promise.all([
        fetch("/api/onboarding"),
        fetch("/api/stores"),
      ])
      const onbData = await onbRes.json()
      const storesData = await storesRes.json()

      const onboardings = onbData.onboardings || []
      const allStores = storesData.stores || []

      // Cross-reference stores with their onboarding data
      const result: StoreWithOnboarding[] = []

      for (const store of allStores) {
        const onboarding = onboardings.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (o: any) => o.store_id === store.id && o.status !== "cancelled"
        )
        if (onboarding) {
          result.push({
            id: store.id,
            store_name: store.store_name,
            store_url: store.store_url,
            platform: store.platform,
            client_id: store.client_id,
            client_name: store.client?.name || store.clients?.name || "Cliente",
            onboarding_status: onboarding.status,
            progress_percent: onboarding.progress_percent || 0,
            form_complete: false, // Will be updated
            last_feedback_at: null,
          })
        }
      }

      // Check form status for these stores
      for (const s of result) {
        try {
          const res = await fetch(`/api/onboarding/store-data?store_id=${s.id}`)
          const data = await res.json()
          if (data.onboarding_data) {
            s.form_complete = data.onboarding_data.is_complete || false
          }
        } catch {
          // ignore
        }
      }

      setStores(result)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchBriefings = useCallback(async () => {
    setBriefingsLoading(true)
    try {
      const storesRes = await fetch("/api/stores")
      const storesData = await storesRes.json()
      const allStores = storesData.stores || []

      const items: BriefingItem[] = []
      for (const store of allStores) {
        try {
          const res = await fetch(`/api/onboarding/store-briefing?store_id=${store.id}`)
          const data = await res.json()
          if (data.briefing) {
            items.push({
              id: data.briefing.id,
              store_id: store.id,
              store_name: store.store_name,
              client_name: store.client?.name || store.clients?.name || "Cliente",
              version: data.briefing.version,
              generated_at: data.briefing.generated_at,
              status: data.briefing.status,
            })
          }
        } catch {
          // ignore
        }
      }

      setBriefings(items)
    } catch {
      // ignore
    } finally {
      setBriefingsLoading(false)
    }
  }, [])

  async function openFormDialog(storeId: string, clientId: string) {
    setSelectedStore({ id: storeId, clientId })
    setFormLoading(true)
    setFormDialogOpen(true)

    try {
      const res = await fetch(`/api/onboarding/store-data?store_id=${storeId}`)
      const data = await res.json()
      setFormInitialData(data)
    } catch {
      setFormInitialData(null)
    } finally {
      setFormLoading(false)
    }
  }

  async function openBriefingDialog(storeId: string) {
    setSelectedBriefingStoreId(storeId)
    setBriefingDialogOpen(true)

    try {
      const res = await fetch(`/api/onboarding/store-briefing?store_id=${storeId}`)
      const data = await res.json()
      setSelectedBriefing(data.briefing || null)
    } catch {
      setSelectedBriefing(null)
    }
  }

  return (
    <>
      <Tabs defaultValue="kanban" className="space-y-4">
        <TabsList>
          <TabsTrigger value="kanban">
            <Kanban className="h-4 w-4 mr-2" />
            Kanban
          </TabsTrigger>
          <TabsTrigger value="forms" onClick={() => stores.length === 0 && fetchStores()}>
            <FileText className="h-4 w-4 mr-2" />
            Formulários
          </TabsTrigger>
          <TabsTrigger value="briefings" onClick={() => briefings.length === 0 && fetchBriefings()}>
            <BookOpen className="h-4 w-4 mr-2" />
            Briefings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kanban">
          <OnboardingKanban />
        </TabsContent>

        <TabsContent value="forms">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : stores.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Nenhuma loja com onboarding ativo encontrada.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Pending */}
              {stores.filter((s) => !s.form_complete).length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm text-muted-foreground mb-3">
                    Formulários Pendentes ({stores.filter((s) => !s.form_complete).length})
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {stores
                      .filter((s) => !s.form_complete)
                      .map((store) => (
                        <div key={store.id} className="space-y-2">
                          <StoreOnboardingCard
                            storeId={store.id}
                            storeName={store.store_name}
                            storeUrl={store.store_url}
                            platform={store.platform}
                            clientId={store.client_id}
                            clientName={store.client_name}
                            onboardingStatus={store.onboarding_status || undefined}
                            progressPercent={store.progress_percent}
                            formComplete={store.form_complete}
                            lastFeedbackAt={store.last_feedback_at}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => openFormDialog(store.id, store.client_id)}
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            Preencher Formulário
                          </Button>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Completed */}
              {stores.filter((s) => s.form_complete).length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm text-muted-foreground mb-3">
                    Formulários Preenchidos ({stores.filter((s) => s.form_complete).length})
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {stores
                      .filter((s) => s.form_complete)
                      .map((store) => (
                        <div key={store.id} className="space-y-2">
                          <StoreOnboardingCard
                            storeId={store.id}
                            storeName={store.store_name}
                            storeUrl={store.store_url}
                            platform={store.platform}
                            clientId={store.client_id}
                            clientName={store.client_name}
                            onboardingStatus={store.onboarding_status || undefined}
                            progressPercent={store.progress_percent}
                            formComplete={store.form_complete}
                            lastFeedbackAt={store.last_feedback_at}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => openFormDialog(store.id, store.client_id)}
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            Editar Formulário
                          </Button>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="briefings">
          {briefingsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : briefings.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Nenhum briefing gerado ainda. Preencha formulários de onboarding para gerar briefings.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {briefings.map((b) => (
                <Card key={b.id} className="hover:border-primary/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium">{b.store_name}</h3>
                        <p className="text-xs text-muted-foreground">{b.client_name}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">v{b.version}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Gerado em {new Date(b.generated_at).toLocaleDateString("pt-BR")}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-3"
                      onClick={() => openBriefingDialog(b.store_id)}
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Ver Briefing
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Form Dialog */}
      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Formulário de Onboarding</DialogTitle>
          </DialogHeader>
          {formLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : selectedStore ? (
            <StoreOnboardingForm
              storeId={selectedStore.id}
              clientId={selectedStore.clientId}
              initialData={formInitialData as Record<string, unknown> | undefined}
              onComplete={() => {
                setFormDialogOpen(false)
                fetchStores()
                fetchBriefings()
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Briefing Dialog */}
      <Dialog open={briefingDialogOpen} onOpenChange={setBriefingDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Briefing da Loja</DialogTitle>
          </DialogHeader>
          <StoreBriefingView
            storeId={selectedBriefingStoreId}
            briefing={selectedBriefing}
            onRefresh={() => openBriefingDialog(selectedBriefingStoreId)}
            onEditForm={() => {
              setBriefingDialogOpen(false)
              const store = stores.find((s) => s.id === selectedBriefingStoreId)
              if (store) {
                openFormDialog(store.id, store.client_id)
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
