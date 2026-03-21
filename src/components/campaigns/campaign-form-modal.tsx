"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { X, Loader2, Search, Store } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface StoreItem {
  id: string
  store_name: string
  platform: string
  language: string
  client_id: string
  client?: {
    id: string
    name: string
    company: string
  }
}

interface CampaignFormModalProps {
  stores?: StoreItem[]
  initialDate?: string
  onClose: () => void
  onSave: () => void
}

const channelOptions = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "push", label: "Push Notification" },
  { value: "whatsapp", label: "WhatsApp" },
]

const typeOptions = [
  { value: "promotional", label: "Promocional" },
  { value: "newsletter", label: "Newsletter" },
  { value: "transactional", label: "Transacional" },
  { value: "automation", label: "Automação" },
  { value: "seasonal", label: "Sazonal" },
  { value: "launch", label: "Lançamento" },
  { value: "other", label: "Outro" },
]

const statusOptions = [
  { value: "draft", label: "Rascunho" },
  { value: "scheduled", label: "Agendada" },
  { value: "sent", label: "Enviada" },
  { value: "cancelled", label: "Cancelada" },
]

const colorOptions = [
  { value: "#3b82f6", label: "Azul" },
  { value: "#10b981", label: "Verde" },
  { value: "#f59e0b", label: "Amarelo" },
  { value: "#ef4444", label: "Vermelho" },
  { value: "#8b5cf6", label: "Roxo" },
  { value: "#ec4899", label: "Rosa" },
  { value: "#06b6d4", label: "Ciano" },
  { value: "#f97316", label: "Laranja" },
]

const languageFlags: Record<string, string> = {
  "pt-BR": "🇧🇷",
  "en-US": "🇺🇸",
  "es": "🇪🇸",
  "es-ES": "🇪🇸",
  "es-MX": "🇲🇽",
  "fr": "🇫🇷",
  "de": "🇩🇪",
  "it": "🇮🇹",
}

export function CampaignFormModal({
  stores: initialStores,
  initialDate,
  onClose,
  onSave,
}: CampaignFormModalProps) {
  const [loading, setLoading] = useState(false)
  const [loadingStores, setLoadingStores] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Store data
  const [allStores, setAllStores] = useState<StoreItem[]>(initialStores || [])
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState("")

  // Compute languages and counts from stores using useMemo (prevents infinite loops)
  const { languages, languageCounts } = useMemo(() => {
    if (!allStores || !Array.isArray(allStores) || allStores.length === 0) {
      return { languages: [], languageCounts: {} }
    }

    const langs = new Set<string>()
    const counts: Record<string, number> = {}

    allStores.forEach(store => {
      if (!store) return
      const lang = store.language || "pt-BR"
      langs.add(lang)
      counts[lang] = (counts[lang] || 0) + 1
    })

    return {
      languages: Array.from(langs).sort(),
      languageCounts: counts,
    }
  }, [allStores])

  // Form data
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    scheduled_date: initialDate || "",
    scheduled_time: "10:00",
    channel: "email",
    campaign_type: "promotional",
    status: "scheduled",
    subject_line: "",
    segment_name: "",
    color: "#3b82f6",
    notes: "",
  })

  // Fetch stores from API if not provided
  const fetchStores = useCallback(async () => {
    if (initialStores && initialStores.length > 0) {
      setAllStores(initialStores)
      return
    }

    setLoadingStores(true)
    try {
      const response = await fetch("/api/admin/stores")
      if (response.ok) {
        const data = await response.json()
        setAllStores(data.stores || [])
      }
    } catch (err) {
      console.error("Error fetching stores:", err)
    } finally {
      setLoadingStores(false)
    }
  }, [initialStores])

  useEffect(() => {
    fetchStores()
  }, [fetchStores])

  // Filter stores by search query (with defensive null checks)
  const filteredStores = useMemo(() => {
    if (!allStores || !Array.isArray(allStores)) return []
    const query = searchQuery?.toLowerCase() || ""
    if (!query) return allStores

    return allStores.filter(store => {
      if (!store) return false
      const storeName = store.store_name?.toLowerCase() || ""
      // Handle client as object or array (Supabase can return either)
      const client = Array.isArray(store.client) ? store.client[0] : store.client
      const clientName = client?.name?.toLowerCase() || ""
      const clientCompany = client?.company?.toLowerCase() || ""

      return (
        storeName.includes(query) ||
        clientName.includes(query) ||
        clientCompany.includes(query)
      )
    })
  }, [allStores, searchQuery])

  // Quick filter handlers (with defensive checks)
  const selectByLanguage = useCallback((language: string) => {
    if (!allStores || !Array.isArray(allStores) || allStores.length === 0) return
    try {
      const storeIds = allStores
        .filter(s => s && (s.language || "pt-BR") === language)
        .map(s => s.id)
        .filter(Boolean)
      setSelectedStoreIds(storeIds)
    } catch (err) {
      console.error("Error selecting by language:", err)
    }
  }, [allStores])

  const selectAll = useCallback(() => {
    if (!allStores || !Array.isArray(allStores) || allStores.length === 0) return
    try {
      const storeIds = allStores.map(s => s?.id).filter(Boolean) as string[]
      setSelectedStoreIds(storeIds)
    } catch (err) {
      console.error("Error selecting all:", err)
    }
  }, [allStores])

  const clearSelection = useCallback(() => {
    setSelectedStoreIds([])
  }, [])

  const toggleStore = useCallback((storeId: string) => {
    if (!storeId) return
    setSelectedStoreIds(prev => {
      const prevArray = Array.isArray(prev) ? prev : []
      return prevArray.includes(storeId)
        ? prevArray.filter(id => id !== storeId)
        : [...prevArray, storeId]
    })
  }, [])

  // Helper function to get flag
  const getFlag = (lang: string) => {
    return languageFlags[lang] || "🌐"
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Validations
    if (!formData.name || formData.name.trim().length < 3) {
      setError("Nome da campanha deve ter pelo menos 3 caracteres")
      setLoading(false)
      return
    }

    if (!formData.scheduled_date) {
      setError("Selecione a data de envio")
      setLoading(false)
      return
    }

    if (selectedStoreIds.length === 0) {
      setError("Selecione pelo menos uma loja")
      setLoading(false)
      return
    }

    // Build scheduled_at datetime
    const scheduledAt = new Date(`${formData.scheduled_date}T${formData.scheduled_time}:00`)

    try {
      const response = await fetch("/api/admin/campaign-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          campaign_type: formData.channel, // Using channel as campaign_type for the API
          scheduled_at: scheduledAt.toISOString(),
          store_ids: selectedStoreIds,
          notes: formData.notes?.trim() || null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Erro ao criar campanha")
        return
      }

      onSave()
    } catch (err) {
      console.error("Error saving campaign:", err)
      setError("Erro ao salvar campanha")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between sticky top-0 bg-card z-10 border-b">
          <CardTitle>Nova Campanha</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <Icon icon={X} size={16} />
          </Button>
        </CardHeader>
        <CardContent className="overflow-y-auto flex-1 p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Campaign Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Campanha *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Black Friday 2024"
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descreva a campanha..."
                rows={2}
              />
            </div>

            {/* Date, Time and Channel */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="scheduled_date">Data *</Label>
                <Input
                  id="scheduled_date"
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduled_time">Horário</Label>
                <Input
                  id="scheduled_time"
                  type="time"
                  value={formData.scheduled_time}
                  onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Canal *</Label>
                <Select
                  value={formData.channel}
                  onValueChange={(value) => setFormData({ ...formData, channel: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {channelOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Type, Status and Color */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={formData.campaign_type}
                  onValueChange={(value) => setFormData({ ...formData, campaign_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cor</Label>
                <Select
                  value={formData.color}
                  onValueChange={(value) => setFormData({ ...formData, color: value })}
                >
                  <SelectTrigger>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: formData.color }}
                      />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {colorOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded"
                            style={{ backgroundColor: option.value }}
                          />
                          {option.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Email specific fields */}
            {formData.channel === "email" && (
              <div className="space-y-2">
                <Label htmlFor="subject_line">Assunto do Email</Label>
                <Input
                  id="subject_line"
                  value={formData.subject_line}
                  onChange={(e) => setFormData({ ...formData, subject_line: e.target.value })}
                  placeholder="Ex: 🔥 Últimas horas! Até 70% OFF"
                />
              </div>
            )}

            {/* Segment info */}
            <div className="space-y-2">
              <Label htmlFor="segment_name">Segmento/Lista</Label>
              <Input
                id="segment_name"
                value={formData.segment_name}
                onChange={(e) => setFormData({ ...formData, segment_name: e.target.value })}
                placeholder="Ex: Compradores VIP"
              />
            </div>

            {/* Quick Filters for Stores */}
            <div className="space-y-2">
              <Label>Filtros Rápidos</Label>
              <div className="flex flex-wrap gap-2">
                {languages.length > 0 ? languages.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      selectByLanguage(lang)
                    }}
                  >
                    {getFlag(lang)} {lang} ({languageCounts[lang] || 0})
                  </button>
                )) : null}
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    selectAll()
                  }}
                >
                  Todas ({allStores.length})
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground h-9 px-3"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    clearSelection()
                  }}
                >
                  Limpar
                </button>
              </div>
            </div>

            {/* Store Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Icon icon={Store} size={16} />
                  Lojas Selecionadas ({selectedStoreIds.length}/{allStores.length}) *
                </Label>
                <div className="relative w-64">
                  <Icon icon={Search} size={16} className="absolute left-2 top-2.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar loja ou cliente..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
              </div>

              <div className="h-48 border rounded-md overflow-y-auto">
                {loadingStores ? (
                  <div className="flex items-center justify-center h-full">
                    <Icon icon={Loader2} size={24} className="animate-spin text-muted-foreground" />
                  </div>
                ) : filteredStores.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Nenhuma loja encontrada
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {filteredStores.map((store) => {
                      // Handle client as object or array
                      const client = Array.isArray(store.client) ? store.client[0] : store.client
                      const clientDisplay = client?.company || client?.name || "Sem cliente"
                      const storeLang = store.language || "pt-BR"
                      const isSelected = selectedStoreIds.includes(store.id)

                      return (
                        <div
                          key={store.id}
                          className={`flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-accent transition-colors ${
                            isSelected ? "bg-accent" : ""
                          }`}
                          onClick={() => toggleStore(store.id)}
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? "bg-primary border-primary" : "border-input"}`}>
                            {isSelected && <span className="text-primary-foreground text-xs">✓</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {store.store_name || "Loja sem nome"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {clientDisplay}
                            </p>
                          </div>
                          <span className="text-xs border rounded px-1.5 py-0.5">
                            {getFlag(storeLang)} {storeLang}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notas (interno)</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notas internas sobre a campanha..."
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Estas notas são internas e NÃO serão visíveis para os clientes
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading || selectedStoreIds.length === 0}>
                {loading && <Icon icon={Loader2} size={16} className="mr-2 animate-spin" />}
                Criar Campanha ({selectedStoreIds.length} lojas)
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
