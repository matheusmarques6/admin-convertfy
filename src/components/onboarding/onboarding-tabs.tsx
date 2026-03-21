"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useOrigin } from "@/hooks/use-origin"
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
  ShieldCheck,
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
import { OnboardingApprovals } from "./onboarding-approvals"
import type { StoreBriefing } from "@/types/onboarding"

interface ClientItem {
  id: string
  name: string
  company: string | null
  email: string | null
  has_store: boolean
  store_id: string | null
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
  const origin = useOrigin()
  const [clients, setClients] = useState<ClientItem[]>([])
  const [briefings, setBriefings] = useState<BriefingItem[]>([])
  const [loading, setLoading] = useState(false)
  const [briefingsLoading, setBriefingsLoading] = useState(false)

  // Form tab state
  const [selectedClientId, setSelectedClientId] = useState<string>("")
  const [formInitialData, setFormInitialData] = useState<Record<string, unknown> | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [formKey, setFormKey] = useState(0)

  // Briefing dialog state
  const [briefingDialogOpen, setBriefingDialogOpen] = useState(false)
  const [selectedBriefing, setSelectedBriefing] = useState<StoreBriefing | null>(null)
  const [selectedBriefingStoreId, setSelectedBriefingStoreId] = useState<string>("")

  // Track if auto-select already happened
  const autoSelectedRef = useRef(false)

  const fetchClients = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch stores with client info
      const storesRes = await fetch("/api/stores")
      const storesData = await storesRes.json()
      const allStores = storesData.stores || []

      // Build a map of client_id -> store info + form status
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clientStoreMap = new Map<string, any>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const store of allStores as any[]) {
        const cid = store.client_id
        if (!clientStoreMap.has(cid)) {
          clientStoreMap.set(cid, {
            client_name: store.client?.name || "Cliente",
            client_company: store.client?.company || null,
            client_email: store.client?.email || null,
            store_id: store.id,
          })
        }
      }

      // Check form status for all stores in parallel
      const entries = Array.from(clientStoreMap.entries())
      const formStatuses = await Promise.all(
        entries.map(async ([, info]) => {
          try {
            const res = await fetch(`/api/onboarding/store-data?store_id=${info.store_id}`)
            const data = await res.json()
            return data.onboarding_data?.is_complete || false
          } catch {
            return false
          }
        })
      )

      const result: ClientItem[] = entries.map(([cid, info], idx) => ({
        id: cid,
        name: info.client_name,
        company: info.client_company,
        email: info.client_email,
        has_store: true,
        store_id: info.store_id,
        form_complete: formStatuses[idx],
      }))

      // Also include clients without stores from the stores endpoint's client data
      // This is already handled - clients without stores won't appear in allStores
      // For now, those clients can be selected from the client page onboarding

      setClients(result)

      // Auto-select first client only on first load
      if (result.length > 0 && !autoSelectedRef.current) {
        autoSelectedRef.current = true
        setSelectedClientId(result[0].id)
      }
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

      // Fetch briefings in parallel
      const briefingResults = await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        allStores.map(async (store: any) => {
          try {
            const res = await fetch(`/api/onboarding/store-briefing?store_id=${store.id}`)
            const data = await res.json()
            if (data.briefing) {
              return {
                id: data.briefing.id,
                store_id: store.id,
                store_name: store.store_name,
                client_name: store.client?.name || store.clients?.name || "Cliente",
                version: data.briefing.version,
                generated_at: data.briefing.generated_at,
                status: data.briefing.status,
              } as BriefingItem
            }
          } catch {
            // ignore
          }
          return null
        })
      )

      setBriefings(briefingResults.filter((b): b is BriefingItem => b !== null))
    } catch {
      // ignore
    } finally {
      setBriefingsLoading(false)
    }
  }, [])

  // Load form data when selected client changes
  useEffect(() => {
    if (!selectedClientId) return
    setFormLoading(true)

    const selectedClient = clients.find((c) => c.id === selectedClientId)
    const url = selectedClient?.store_id
      ? `/api/onboarding/store-data?store_id=${selectedClient.store_id}`
      : `/api/onboarding/store-data?client_id=${selectedClientId}`

    fetch(url)
      .then((res) => res.json())
      .then((data) => setFormInitialData(data))
      .catch(() => setFormInitialData(null))
      .finally(() => setFormLoading(false))
  // Only re-fetch when selectedClientId changes, not when clients array ref changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClientId])

  const selectedClient = clients.find((c) => c.id === selectedClientId) || null

  function handleFormSaved(isComplete: boolean) {
    if (isComplete) {
      // Full re-fetch only on "Concluir" to update statuses
      fetchClients()
    }
    // Always reload the form data to get updated store_id (if created) and fresh data
    if (selectedClientId) {
      setFormLoading(true)
      const client = clients.find((c) => c.id === selectedClientId)
      const url = client?.store_id
        ? `/api/onboarding/store-data?store_id=${client.store_id}`
        : `/api/onboarding/store-data?client_id=${selectedClientId}`

      fetch(url)
        .then((res) => res.json())
        .then((data) => {
          setFormInitialData(data)
          // Bump form key to force remount with new storeId from API
          setFormKey((k) => k + 1)
        })
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
          <TabsTrigger value="forms" onClick={() => clients.length === 0 && fetchClients()}>
            <FileText className="h-4 w-4 mr-2" />
            Formulários
          </TabsTrigger>
          <TabsTrigger value="briefings" onClick={() => briefings.length === 0 && fetchBriefings()}>
            <BookOpen className="h-4 w-4 mr-2" />
            Briefings
          </TabsTrigger>
          <TabsTrigger value="approvals">
            <ShieldCheck className="h-4 w-4 mr-2" />
            Aprovações
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
          ) : clients.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Nenhum cliente encontrado. Cadastre clientes primeiro.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Seletor de cliente + link + status */}
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-end gap-4">
                    <div className="flex-1 space-y-1.5">
                      <Label>Cliente</Label>
                      <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o cliente..." />
                        </SelectTrigger>
                        <SelectContent>
                          {clients.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              <span className="flex items-center gap-2">
                                {client.name}
                                {client.company && (
                                  <span className="text-muted-foreground text-xs">
                                    ({client.company})
                                  </span>
                                )}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedClient && (
                      <Badge
                        variant={selectedClient.form_complete ? "positive" : "neutral"}
                        className="gap-1 whitespace-nowrap"
                      >
                        {selectedClient.form_complete ? (
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
                        value={`${origin}/cliente/onboarding`}
                        className="text-xs bg-muted/50"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const link = `${window.location.origin}/cliente/onboarding`
                          navigator.clipboard.writeText(link)
                          toast({ title: "Link copiado!", description: "O link do portal foi copiado para a área de transferência." })
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Envie este link público para o cliente preencher o formulário de onboarding.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Formulário direto */}
              {formLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : selectedClient ? (
                <StoreOnboardingForm
                  key={`${selectedClientId}-${formKey}`}
                  storeId={selectedClient.store_id || (formInitialData as { store?: { id?: string } } | null)?.store?.id || undefined}
                  clientId={selectedClient.id}
                  initialData={formInitialData as { store?: Record<string, unknown> | null; onboarding_data?: Record<string, unknown> | null; client?: Record<string, unknown> | null } | undefined}
                  onSave={handleFormSaved}
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
                      variant="secondary"
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

        <TabsContent value="approvals">
          <OnboardingApprovals />
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
              const client = clients.find((c) => c.store_id === selectedBriefingStoreId)
              if (client) {
                setSelectedClientId(client.id)
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
