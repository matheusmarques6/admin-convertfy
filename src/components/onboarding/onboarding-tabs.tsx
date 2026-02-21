"use client"

import { useState, useCallback, useEffect } from "react"
import {
  Kanban,
  FileText,
  BookOpen,
  Loader2,
  ExternalLink,
  Copy,
  Link as LinkIcon,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "@/lib/hooks/use-toast"
import { OnboardingKanban } from "./onboarding-kanban"
import { StoreOnboardingForm } from "./store-onboarding-form"
import { StoreBriefingView } from "./store-briefing-view"
import type { StoreBriefing } from "@/types/onboarding"

interface StoreItem {
  id: string
  store_name: string
  store_url: string | null
  platform: string | null
  client_id: string
  client_name: string
  form_complete: boolean
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
  const [stores, setStores] = useState<StoreItem[]>([])
  const [briefings, setBriefings] = useState<BriefingItem[]>([])
  const [loading, setLoading] = useState(false)
  const [briefingsLoading, setBriefingsLoading] = useState(false)

  // Form tab state
  const [selectedStoreId, setSelectedStoreId] = useState<string>("")
  const [formInitialData, setFormInitialData] = useState<Record<string, unknown> | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  // Briefing dialog state
  const [briefingDialogOpen, setBriefingDialogOpen] = useState(false)
  const [selectedBriefing, setSelectedBriefing] = useState<StoreBriefing | null>(null)
  const [selectedBriefingStoreId, setSelectedBriefingStoreId] = useState<string>("")

  const fetchStores = useCallback(async () => {
    setLoading(true)
    try {
      const storesRes = await fetch("/api/stores")
      const storesData = await storesRes.json()
      const allStores = storesData.stores || []

      const result: StoreItem[] = allStores.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (store: any) => ({
          id: store.id,
          store_name: store.store_name,
          store_url: store.store_url,
          platform: store.platform,
          client_id: store.client_id,
          client_name: store.client?.name || store.clients?.name || "Cliente",
          form_complete: false,
        })
      )

      // Check form status for all stores
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

      // Auto-select first store if none selected
      if (result.length > 0 && !selectedStoreId) {
        setSelectedStoreId(result[0].id)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [selectedStoreId])

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

  // Load form data when selected store changes
  useEffect(() => {
    if (!selectedStoreId) return
    setFormLoading(true)
    fetch(`/api/onboarding/store-data?store_id=${selectedStoreId}`)
      .then((res) => res.json())
      .then((data) => setFormInitialData(data))
      .catch(() => setFormInitialData(null))
      .finally(() => setFormLoading(false))
  }, [selectedStoreId])

  const selectedStore = stores.find((s) => s.id === selectedStoreId) || null

  function handleFormComplete() {
    // Re-fetch to update form_complete status
    fetchStores()
    // Reload form data
    if (selectedStoreId) {
      setFormLoading(true)
      fetch(`/api/onboarding/store-data?store_id=${selectedStoreId}`)
        .then((res) => res.json())
        .then((data) => setFormInitialData(data))
        .catch(() => setFormInitialData(null))
        .finally(() => setFormLoading(false))
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
                Nenhuma loja encontrada. Cadastre lojas primeiro.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Seletor de loja + link + status */}
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-end gap-4">
                    <div className="flex-1 space-y-1.5">
                      <Label>Selecione a loja</Label>
                      <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Escolha uma loja..." />
                        </SelectTrigger>
                        <SelectContent>
                          {stores.map((store) => (
                            <SelectItem key={store.id} value={store.id}>
                              <span className="flex items-center gap-2">
                                {store.store_name}
                                <span className="text-muted-foreground text-xs">
                                  ({store.client_name})
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedStore && (
                      <Badge
                        variant={selectedStore.form_complete ? "success" : "secondary"}
                        className="gap-1 whitespace-nowrap"
                      >
                        {selectedStore.form_complete ? (
                          <><CheckCircle2 className="h-3 w-3" /> Preenchido</>
                        ) : (
                          <><AlertCircle className="h-3 w-3" /> Pendente</>
                        )}
                      </Badge>
                    )}
                  </div>

                  {/* Link compartilhável */}
                  <div className="pt-2 border-t">
                    <div className="flex items-center gap-2 mb-2">
                      <LinkIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Link de acesso do cliente</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={`${typeof window !== "undefined" ? window.location.origin : ""}/portal/onboarding/wizard`}
                        className="text-xs bg-muted/50"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const link = `${window.location.origin}/portal/onboarding/wizard`
                          navigator.clipboard.writeText(link)
                          toast({ title: "Link copiado!", description: "O link do portal foi copiado para a área de transferência." })
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      O cliente acessa este link para preencher o formulário. Você pode editar todos os campos abaixo.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Formulário direto */}
              {formLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : selectedStore ? (
                <StoreOnboardingForm
                  key={selectedStoreId}
                  storeId={selectedStore.id}
                  clientId={selectedStore.client_id}
                  initialData={formInitialData as Record<string, unknown> | undefined}
                  onComplete={handleFormComplete}
                />
              ) : null}
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
              setSelectedStoreId(selectedBriefingStoreId)
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
