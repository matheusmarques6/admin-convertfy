"use client"

import { useState } from "react"
import {
  X,
  Mail,
  MessageSquare,
  Bell,
  Calendar,
  Clock,
  Store,
  Users,
  Trash2,
  Edit,
  ExternalLink,
  TrendingUp,
  MousePointer,
  Eye,
  DollarSign,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Campaign } from "@/types"

interface CampaignModalProps {
  campaign: Campaign
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}

const channelConfig = {
  email: { icon: Mail, color: "bg-blue-500", label: "Email" },
  sms: { icon: MessageSquare, color: "bg-green-500", label: "SMS" },
  push: { icon: Bell, color: "bg-purple-500", label: "Push" },
  whatsapp: { icon: MessageSquare, color: "bg-emerald-500", label: "WhatsApp" },
}

const statusConfig = {
  draft: { color: "bg-gray-100 text-gray-800", label: "Rascunho" },
  scheduled: { color: "bg-yellow-100 text-yellow-800", label: "Agendada" },
  sent: { color: "bg-green-100 text-green-800", label: "Enviada" },
  cancelled: { color: "bg-red-100 text-red-800", label: "Cancelada" },
}

const typeLabels = {
  promotional: "Promocional",
  newsletter: "Newsletter",
  transactional: "Transacional",
  automation: "Automação",
  seasonal: "Sazonal",
  launch: "Lançamento",
  other: "Outro",
}

export function CampaignModal({
  campaign,
  onClose,
  onEdit,
  onDelete,
}: CampaignModalProps) {
  const [deleting, setDeleting] = useState(false)

  const ChannelIcon = channelConfig[campaign.channel]?.icon || Mail
  const channelInfo = channelConfig[campaign.channel]
  const statusInfo = statusConfig[campaign.status]

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        onDelete()
      } else {
        const error = await response.json()
        alert(`Erro: ${error.error}`)
      }
    } catch (error) {
      console.error("Error deleting campaign:", error)
      alert("Erro ao excluir campanha")
    } finally {
      setDeleting(false)
    }
  }

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T12:00:00")
    return date.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  }

  // Calculate rates
  const deliveryRate = campaign.recipients && campaign.delivered
    ? ((campaign.delivered / campaign.recipients) * 100).toFixed(1)
    : null

  const openRate = campaign.delivered && campaign.opened
    ? ((campaign.opened / campaign.delivered) * 100).toFixed(1)
    : null

  const clickRate = campaign.delivered && campaign.clicked
    ? ((campaign.clicked / campaign.delivered) * 100).toFixed(1)
    : null

  const conversionRate = campaign.clicked && campaign.converted
    ? ((campaign.converted / campaign.clicked) * 100).toFixed(1)
    : null

  const hasMetrics = campaign.recipients && campaign.recipients > 0

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="sticky top-0 bg-card z-10 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center text-white flex-shrink-0"
                style={{ backgroundColor: campaign.color }}
              >
                <ChannelIcon className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-xl">{campaign.name}</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                  <Badge variant="outline">{typeLabels[campaign.campaign_type]}</Badge>
                  <Badge variant="outline" className="capitalize">
                    {channelInfo?.label}
                  </Badge>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Description */}
          {campaign.description && (
            <div>
              <p className="text-muted-foreground">{campaign.description}</p>
            </div>
          )}

          {/* Schedule Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Data</p>
                <p className="font-medium">{formatDate(campaign.scheduled_date)}</p>
              </div>
            </div>
            {campaign.scheduled_time && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Horário</p>
                  <p className="font-medium">{campaign.scheduled_time}</p>
                </div>
              </div>
            )}
          </div>

          {/* Store Info */}
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Loja</p>
              <p className="font-medium">
                {campaign.store?.store_name || "Não especificada"}
              </p>
            </div>
          </div>

          {/* Segment Info */}
          {(campaign.segment_name || campaign.estimated_recipients) && (
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Segmento</p>
                <p className="font-medium">
                  {campaign.segment_name || "Não especificado"}
                  {campaign.estimated_recipients && (
                    <span className="text-muted-foreground ml-2">
                      ({campaign.estimated_recipients.toLocaleString()} destinatários est.)
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Email specific info */}
          {campaign.channel === "email" && campaign.subject_line && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-sm font-medium">Assunto do Email</p>
                <p className="text-muted-foreground bg-muted/50 p-3 rounded-lg">
                  {campaign.subject_line}
                </p>
                {campaign.preview_text && (
                  <>
                    <p className="text-sm font-medium mt-4">Texto de Preview</p>
                    <p className="text-muted-foreground bg-muted/50 p-3 rounded-lg text-sm">
                      {campaign.preview_text}
                    </p>
                  </>
                )}
              </div>
            </>
          )}

          {/* Performance Metrics */}
          {hasMetrics && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-medium mb-4">Métricas de Performance</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Users className="h-4 w-4" />
                      <span className="text-xs">Enviados</span>
                    </div>
                    <p className="text-lg font-semibold">
                      {campaign.recipients?.toLocaleString() || 0}
                    </p>
                    {deliveryRate && (
                      <p className="text-xs text-muted-foreground">
                        {deliveryRate}% entregues
                      </p>
                    )}
                  </div>

                  <div className="bg-muted/50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Eye className="h-4 w-4" />
                      <span className="text-xs">Aberturas</span>
                    </div>
                    <p className="text-lg font-semibold">
                      {campaign.opened?.toLocaleString() || 0}
                    </p>
                    {openRate && (
                      <p className="text-xs text-green-600">{openRate}% taxa</p>
                    )}
                  </div>

                  <div className="bg-muted/50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <MousePointer className="h-4 w-4" />
                      <span className="text-xs">Cliques</span>
                    </div>
                    <p className="text-lg font-semibold">
                      {campaign.clicked?.toLocaleString() || 0}
                    </p>
                    {clickRate && (
                      <p className="text-xs text-blue-600">{clickRate}% taxa</p>
                    )}
                  </div>

                  <div className="bg-muted/50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <TrendingUp className="h-4 w-4" />
                      <span className="text-xs">Conversões</span>
                    </div>
                    <p className="text-lg font-semibold">
                      {campaign.converted?.toLocaleString() || 0}
                    </p>
                    {conversionRate && (
                      <p className="text-xs text-purple-600">{conversionRate}% taxa</p>
                    )}
                  </div>
                </div>

                {campaign.revenue && campaign.revenue > 0 && (
                  <div className="mt-4 bg-green-50 dark:bg-green-950/20 p-4 rounded-lg">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400 mb-1">
                      <DollarSign className="h-5 w-5" />
                      <span className="font-medium">Receita Gerada</span>
                    </div>
                    <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                      R$ {campaign.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Notes */}
          {campaign.notes && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-medium mb-2">Notas</h3>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {campaign.notes}
                </p>
              </div>
            </>
          )}

          {/* External link */}
          {campaign.klaviyo_campaign_id && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ExternalLink className="h-4 w-4" />
              <span>ID Klaviyo: {campaign.klaviyo_campaign_id}</span>
            </div>
          )}

          {/* Actions */}
          <Separator />
          <div className="flex justify-between">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita. A campanha será permanentemente excluída.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground"
                  >
                    {deleting ? "Excluindo..." : "Excluir"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button onClick={onEdit}>
              <Edit className="h-4 w-4 mr-2" />
              Editar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
