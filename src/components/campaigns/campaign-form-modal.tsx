"use client"

import { useState, useEffect } from "react"
import { X, Loader2 } from "lucide-react"
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
import { Campaign, ClientStore, CampaignChannel, CampaignType, CampaignStatus } from "@/types"

interface CampaignFormModalProps {
  stores: ClientStore[]
  initialDate?: string
  campaign?: Campaign
  onClose: () => void
  onSave: () => void
}

const channelOptions: { value: CampaignChannel; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "push", label: "Push Notification" },
  { value: "whatsapp", label: "WhatsApp" },
]

const typeOptions: { value: CampaignType; label: string }[] = [
  { value: "promotional", label: "Promocional" },
  { value: "newsletter", label: "Newsletter" },
  { value: "transactional", label: "Transacional" },
  { value: "automation", label: "Automação" },
  { value: "seasonal", label: "Sazonal" },
  { value: "launch", label: "Lançamento" },
  { value: "other", label: "Outro" },
]

const statusOptions: { value: CampaignStatus; label: string }[] = [
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

export function CampaignFormModal({
  stores,
  initialDate,
  campaign,
  onClose,
  onSave,
}: CampaignFormModalProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    store_id: campaign?.store_id || "",
    client_id: campaign?.client_id || "",
    name: campaign?.name || "",
    description: campaign?.description || "",
    scheduled_date: campaign?.scheduled_date || initialDate || "",
    scheduled_time: campaign?.scheduled_time || "",
    channel: campaign?.channel || "email" as CampaignChannel,
    campaign_type: campaign?.campaign_type || "promotional" as CampaignType,
    status: campaign?.status || "draft" as CampaignStatus,
    subject_line: campaign?.subject_line || "",
    preview_text: campaign?.preview_text || "",
    segment_name: campaign?.segment_name || "",
    estimated_recipients: campaign?.estimated_recipients || "",
    color: campaign?.color || "#3b82f6",
    notes: campaign?.notes || "",
  })

  const isEditing = !!campaign

  // Update client_id when store changes
  useEffect(() => {
    if (formData.store_id) {
      const store = stores.find(s => s.id === formData.store_id)
      if (store) {
        setFormData(prev => ({ ...prev, client_id: store.client_id }))
      }
    }
  }, [formData.store_id, stores])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const url = isEditing
        ? `/api/campaigns/${campaign.id}`
        : "/api/campaigns"

      const method = isEditing ? "PUT" : "POST"

      const body = {
        ...formData,
        estimated_recipients: formData.estimated_recipients
          ? parseInt(String(formData.estimated_recipients))
          : null,
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (response.ok) {
        onSave()
      } else {
        const error = await response.json()
        alert(`Erro: ${error.error}`)
      }
    } catch (error) {
      console.error("Error saving campaign:", error)
      alert("Erro ao salvar campanha")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between sticky top-0 bg-card z-10">
          <CardTitle>
            {isEditing ? "Editar Campanha" : "Nova Campanha"}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Store Selection */}
            <div className="space-y-2">
              <Label htmlFor="store">Loja *</Label>
              <Select
                value={formData.store_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, store_id: value })
                }
              >
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
            </div>

            {/* Campaign Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Campanha *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
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
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Descreva a campanha..."
                rows={2}
              />
            </div>

            {/* Date and Time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="scheduled_date">Data *</Label>
                <Input
                  id="scheduled_date"
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) =>
                    setFormData({ ...formData, scheduled_date: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduled_time">Horário</Label>
                <Input
                  id="scheduled_time"
                  type="time"
                  value={formData.scheduled_time}
                  onChange={(e) =>
                    setFormData({ ...formData, scheduled_time: e.target.value })
                  }
                />
              </div>
            </div>

            {/* Channel and Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Canal *</Label>
                <Select
                  value={formData.channel}
                  onValueChange={(value: CampaignChannel) =>
                    setFormData({ ...formData, channel: value })
                  }
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
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select
                  value={formData.campaign_type}
                  onValueChange={(value: CampaignType) =>
                    setFormData({ ...formData, campaign_type: value })
                  }
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
            </div>

            {/* Status and Color */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: CampaignStatus) =>
                    setFormData({ ...formData, status: value })
                  }
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
                <Label>Cor no Calendário</Label>
                <Select
                  value={formData.color}
                  onValueChange={(value) =>
                    setFormData({ ...formData, color: value })
                  }
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
              <>
                <div className="space-y-2">
                  <Label htmlFor="subject_line">Assunto do Email</Label>
                  <Input
                    id="subject_line"
                    value={formData.subject_line}
                    onChange={(e) =>
                      setFormData({ ...formData, subject_line: e.target.value })
                    }
                    placeholder="Ex: 🔥 Últimas horas! Até 70% OFF"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="preview_text">Texto de Preview</Label>
                  <Input
                    id="preview_text"
                    value={formData.preview_text}
                    onChange={(e) =>
                      setFormData({ ...formData, preview_text: e.target.value })
                    }
                    placeholder="Texto que aparece na prévia do email"
                  />
                </div>
              </>
            )}

            {/* Segment info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="segment_name">Segmento/Lista</Label>
                <Input
                  id="segment_name"
                  value={formData.segment_name}
                  onChange={(e) =>
                    setFormData({ ...formData, segment_name: e.target.value })
                  }
                  placeholder="Ex: Compradores VIP"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estimated_recipients">Destinatários Est.</Label>
                <Input
                  id="estimated_recipients"
                  type="number"
                  value={formData.estimated_recipients}
                  onChange={(e) =>
                    setFormData({ ...formData, estimated_recipients: e.target.value })
                  }
                  placeholder="Ex: 5000"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="Notas adicionais sobre a campanha..."
                rows={2}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading || !formData.store_id}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isEditing ? "Salvar" : "Criar Campanha"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
