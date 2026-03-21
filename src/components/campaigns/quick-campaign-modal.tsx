"use client"

import { useState } from "react"
import { X, Zap, Loader2 } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/lib/hooks/use-toast"

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
  const [name, setName] = useState("")
  const [date, setDate] = useState(initialDate || new Date().toISOString().split("T")[0])

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Erro", description: "Nome é obrigatório" })
      return
    }
    if (!date) {
      toast({ variant: "destructive", title: "Erro", description: "Data é obrigatória" })
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          scheduled_date: date,
          channel: "email",
          campaign_type: "promotional",
          status: "draft",
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
            <Icon icon={Zap} size={20} className="text-warning" />
            <CardTitle className="text-lg">Campanha Rápida</CardTitle>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <Icon icon={X} size={16} />
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

          <div className="flex gap-2 pt-2">
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={loading}>
              {loading ? (
                <Icon icon={Loader2} size={16} className="animate-spin mr-2" />
              ) : (
                <Icon icon={Zap} size={16} className="mr-2" />
              )}
              Criar Rápida
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
