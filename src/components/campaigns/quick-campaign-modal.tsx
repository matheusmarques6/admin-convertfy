"use client"

import { useState, useEffect, useCallback } from "react"
import { X, Zap, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/lib/hooks/use-toast"

interface StoreItem {
  id: string
  store_name: string
  client_id: string
  client?: {
    id: string
    name: string
    company: string
  }
}

interface QuickCampaignModalProps {
  initialDate?: string
  onClose: () => void
  onSave: () => void
}

export function QuickCampaignModal({
  initialDate,
  onClose,
  onSave,
}: QuickCampaignModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [loadingStores, setLoadingStores] = useState(false)
  const [stores, setStores] = useState<StoreItem[]>([])
  const [name, setName] = useState("")
  const [date, setDate] = useState(initialDate || new Date().toISOString().split("T")[0])
  const [selectedStoreId, setSelectedStoreId] = useState("")

  const fetchStores = useCallback(async () => {
    setLoadingStores(true)
    try {
      const response = await fetch("/api/stores")
      if (response.ok) {
        const data = await response.json()
        const storeList = data.stores || []
        setStores(storeList)
        if (storeList.length === 1) {
          setSelectedStoreId(storeList[0].id)
        }
      }
    } catch {
      console.error("Error fetching stores")
    } finally {
      setLoadingStores(false)
    }
  }, [])

  useEffect(() => {
    fetchStores()
  }, [fetchStores])

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Erro", description: "Nome é obrigatório" })
      return
    }
    if (!date) {
      toast({ variant: "destructive", title: "Erro", description: "Data é obrigatória" })
      return
    }
    if (!selectedStoreId) {
      toast({ variant: "destructive", title: "Erro", description: "Selecione uma loja" })
      return
    }

    const store = stores.find(s => s.id === selectedStoreId)
    if (!store) return

    setLoading(true)
    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: selectedStoreId,
          client_id: store.client_id || store.client?.id,
          name: name.trim(),
          scheduled_date: date,
          channel: "email",
          campaign_type: "promotional",
          status: "draft",
          is_quick: true,
          color: "#94a3b8",
        }),
      })

      if (response.ok) {
        toast({ title: "Campanha rápida criada!", description: "Você pode completar os detalhes depois." })
        onSave()
      } else {
        const err = await response.json()
        toast({ variant: "destructive", title: "Erro", description: err.error || "Erro ao criar campanha" })
      }
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Erro ao criar campanha rápida" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-warning" />
            <CardTitle className="text-lg">Campanha Rápida</CardTitle>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Marque rapidamente no calendário. Complete os detalhes depois.
          </p>

          <div className="space-y-2">
            <Label htmlFor="quick-name">Nome da Campanha</Label>
            <Input
              id="quick-name"
              placeholder="Ex: Black Friday, Dia das Mães..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quick-date">Data</Label>
            <Input
              id="quick-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Loja</Label>
            {loadingStores ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando lojas...
              </div>
            ) : (
              <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a loja" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.store_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              Criar Rápida
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
