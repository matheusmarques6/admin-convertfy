"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Mail,
  MessageSquare,
  Bell,
  Calendar,
  Store,
  FileText,
  Loader2,
  Check,
  Search,
  Globe,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"

interface StoreItem {
  id: string
  store_name: string
  platform: string
  language: string
  client_id: string
  client: {
    id: string
    name: string
    company: string
  }
}

interface CampaignBatchModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

const campaignTypes = [
  { value: "email", label: "Email", icon: Mail },
  { value: "sms", label: "SMS", icon: MessageSquare },
  { value: "push", label: "Push", icon: Bell },
  { value: "whatsapp", label: "WhatsApp", icon: MessageSquare },
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

export function CampaignBatchModal({
  open,
  onOpenChange,
  onSuccess,
}: CampaignBatchModalProps) {
  // Form state
  const [name, setName] = useState("")
  const [campaignType, setCampaignType] = useState("email")
  const [scheduledDate, setScheduledDate] = useState("")
  const [scheduledTime, setScheduledTime] = useState("10:00")
  const [instructionsDocUrl, setInstructionsDocUrl] = useState("")
  const [notes, setNotes] = useState("")
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([])

  // Data state
  const [stores, setStores] = useState<StoreItem[]>([])
  const [languages, setLanguages] = useState<string[]>([])
  const [languageCounts, setLanguageCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  // Fetch stores
  const fetchStores = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/admin/stores")
      if (response.ok) {
        const data = await response.json()
        setStores(data.stores || [])
        setLanguages(data.languages || [])
        setLanguageCounts(data.languageCounts || {})
      }
    } catch (err) {
      console.error("Error fetching stores:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      fetchStores()
      // Reset form
      setName("")
      setCampaignType("email")
      setScheduledDate("")
      setScheduledTime("10:00")
      setInstructionsDocUrl("")
      setNotes("")
      setSelectedStoreIds([])
      setError(null)
      setSearchQuery("")
    }
  }, [open, fetchStores])

  // Filter stores by search query
  const filteredStores = stores.filter(store => {
    const query = searchQuery.toLowerCase()
    return (
      store.store_name.toLowerCase().includes(query) ||
      store.client?.name?.toLowerCase().includes(query) ||
      store.client?.company?.toLowerCase().includes(query)
    )
  })

  // Quick filter handlers
  const selectByLanguage = (language: string) => {
    const storeIds = stores
      .filter(s => (s.language || "pt-BR") === language)
      .map(s => s.id)
    setSelectedStoreIds(storeIds)
  }

  const selectAll = () => {
    setSelectedStoreIds(stores.map(s => s.id))
  }

  const clearSelection = () => {
    setSelectedStoreIds([])
  }

  const toggleStore = (storeId: string) => {
    setSelectedStoreIds(prev =>
      prev.includes(storeId)
        ? prev.filter(id => id !== storeId)
        : [...prev, storeId]
    )
  }

  // Submit handler
  const handleSubmit = async () => {
    setError(null)

    // Validations
    if (!name.trim() || name.trim().length < 3) {
      setError("Nome da campanha deve ter pelo menos 3 caracteres")
      return
    }

    if (!scheduledDate) {
      setError("Selecione a data de envio")
      return
    }

    if (selectedStoreIds.length === 0) {
      setError("Selecione pelo menos uma loja")
      return
    }

    // Build scheduled_at datetime
    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}:00`)
    if (scheduledAt <= new Date()) {
      setError("Data de envio deve ser no futuro")
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch("/api/admin/campaign-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          campaign_type: campaignType,
          scheduled_at: scheduledAt.toISOString(),
          instructions_doc_url: instructionsDocUrl.trim() || null,
          store_ids: selectedStoreIds,
          notes: notes.trim() || null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Erro ao criar campanha")
        return
      }

      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      console.error("Error creating campaign:", err)
      setError("Erro ao criar campanha")
    } finally {
      setSubmitting(false)
    }
  }

  // Get tomorrow's date as minimum
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const minDate = tomorrow.toISOString().split("T")[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Nova Campanha em Lote
          </DialogTitle>
          <DialogDescription>
            Crie uma campanha para múltiplas lojas. A campanha aparecerá no calendário dos clientes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {/* Campaign Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Nome da Campanha *</Label>
            <Input
              id="name"
              placeholder="Ex: Black Friday 2025"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Type and Schedule */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Campanha *</Label>
              <Select value={campaignType} onValueChange={setCampaignType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {campaignTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <type.icon className="h-4 w-4" />
                        {type.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Data e Hora do Envio *</Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  min={minDate}
                  className="flex-1"
                />
                <Input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-28"
                />
              </div>
            </div>
          </div>

          {/* Instructions Doc URL */}
          <div className="space-y-2">
            <Label htmlFor="docUrl" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Link do Documento de Instruções
            </Label>
            <Input
              id="docUrl"
              placeholder="https://docs.google.com/document/d/..."
              value={instructionsDocUrl}
              onChange={(e) => setInstructionsDocUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              ⚠️ Este link é interno e NÃO será visível para os clientes
            </p>
          </div>

          {/* Quick Filters */}
          <div className="space-y-2">
            <Label>Gatilhos Rápidos</Label>
            <div className="flex flex-wrap gap-2">
              {languages.map((lang) => (
                <Button
                  key={lang}
                  variant="outline"
                  size="sm"
                  onClick={() => selectByLanguage(lang)}
                  className="gap-1"
                >
                  {languageFlags[lang] || <Globe className="h-3 w-3" />}
                  {lang}
                  <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                    {languageCounts[lang] || 0}
                  </Badge>
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={selectAll}
              >
                Todas ({stores.length})
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
              >
                Limpar
              </Button>
            </div>
          </div>

          {/* Store Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Store className="h-4 w-4" />
                Lojas Selecionadas ({selectedStoreIds.length}/{stores.length})
              </Label>
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar loja ou cliente..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
            </div>

            <ScrollArea className="h-48 border rounded-md">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredStores.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Nenhuma loja encontrada
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {filteredStores.map((store) => (
                    <div
                      key={store.id}
                      className={`flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-accent transition-colors ${
                        selectedStoreIds.includes(store.id) ? "bg-accent" : ""
                      }`}
                      onClick={() => toggleStore(store.id)}
                    >
                      <Checkbox
                        checked={selectedStoreIds.includes(store.id)}
                        onCheckedChange={() => toggleStore(store.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {store.store_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {store.client?.company || store.client?.name || "Sem cliente"}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {languageFlags[store.language] || "🌐"} {store.language || "pt-BR"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Observações (interno)</Label>
            <Textarea
              id="notes"
              placeholder="Notas internas sobre a campanha..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              ⚠️ Estas notas são internas e NÃO serão visíveis para os clientes
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || selectedStoreIds.length === 0}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Criar Campanha ({selectedStoreIds.length} lojas)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
