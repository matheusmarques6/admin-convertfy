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
  Send,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  History,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "@/lib/hooks/use-toast"
import { Campaign, CampaignHistory } from "@/types"
import { formatCurrency } from "@/lib/utils/format"

interface CampaignModalProps {
  campaign: Campaign
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onRefresh?: () => void
}

const channelConfig = {
  email: { icon: Mail, color: "bg-blue-500", label: "Email" },
  sms: { icon: MessageSquare, color: "bg-green-500", label: "SMS" },
  push: { icon: Bell, color: "bg-purple-500", label: "Push" },
  whatsapp: { icon: MessageSquare, color: "bg-emerald-500", label: "WhatsApp" },
}

const statusConfig: Record<string, { color: string; label: string }> = {
  draft: { color: "bg-gray-100 text-gray-800", label: "Rascunho" },
  pending_review: { color: "bg-blue-100 text-blue-800", label: "Aguardando Revisão" },
  approved: { color: "bg-emerald-100 text-emerald-800", label: "Aprovada" },
  rejected: { color: "bg-orange-100 text-orange-800", label: "Rejeitada" },
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

const sourceConfig: Record<string, { label: string; color: string }> = {
  manual: { label: "Manual", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  klaviyo: { label: "Klaviyo", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  batch: { label: "Lote", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
}

export function CampaignModal({
  campaign,
  onClose,
  onEdit,
  onDelete,
  onRefresh,
}: CampaignModalProps) {
  const [deleting, setDeleting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [showHistoryDialog, setShowHistoryDialog] = useState(false)
  const [history, setHistory] = useState<CampaignHistory[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const ChannelIcon = channelConfig[campaign.channel]?.icon || Mail
  const channelInfo = channelConfig[campaign.channel] || channelConfig.email
  const statusInfo = statusConfig[campaign.status] || { color: "bg-gray-100 text-gray-800", label: campaign.status || "Desconhecido" }

  const canSubmit = ["draft", "rejected"].includes(campaign.status)
  const canApprove = campaign.status === "pending_review"

  // Submit for review
  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast({ title: "Sucesso", description: data.message })
      onRefresh?.()
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao enviar"
      toast({ variant: "destructive", title: "Erro", description: message })
    } finally {
      setSubmitting(false)
    }
  }

  // Approve campaign
  const handleApprove = async () => {
    setApproving(true)
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast({ title: "Sucesso", description: data.message })
      onRefresh?.()
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao aprovar"
      toast({ variant: "destructive", title: "Erro", description: message })
    } finally {
      setApproving(false)
    }
  }

  // Reject campaign
  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast({ variant: "destructive", title: "Erro", description: "Informe o motivo da rejeição" })
      return
    }
    setRejecting(true)
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast({ title: "Campanha Rejeitada", description: data.message })
      setShowRejectDialog(false)
      onRefresh?.()
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao rejeitar"
      toast({ variant: "destructive", title: "Erro", description: message })
    } finally {
      setRejecting(false)
    }
  }

  // Load history
  const loadHistory = async () => {
    setLoadingHistory(true)
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/history`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setHistory(data.history || [])
      setShowHistoryDialog(true)
    } catch (error) {
      console.error("Error loading history:", error)
      toast({ variant: "destructive", title: "Erro", description: "Erro ao carregar histórico" })
    } finally {
      setLoadingHistory(false)
    }
  }

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
        toast({ variant: "destructive", title: "Erro", description: error.error || "Erro ao excluir" })
      }
    } catch (error) {
      console.error("Error deleting campaign:", error)
      toast({ variant: "destructive", title: "Erro", description: "Erro ao excluir campanha" })
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
                style={{ backgroundColor: campaign.color || "#3b82f6" }}
              >
                <ChannelIcon className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-xl">{campaign.name}</CardTitle>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                  <Badge variant="neutral" showDot={false}>{typeLabels[campaign.campaign_type]}</Badge>
                  <Badge variant="neutral" showDot={false} className="capitalize">
                    {channelInfo?.label}
                  </Badge>
                  {campaign.source && sourceConfig[campaign.source] && (
                    <Badge className={sourceConfig[campaign.source].color}>
                      {sourceConfig[campaign.source].label}
                    </Badge>
                  )}
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
              <p className="text-sm text-muted-foreground">
                {campaign.store_names && campaign.store_names.length > 1 ? "Lojas" : "Loja"}
              </p>
              <p className="font-medium">
                {campaign.store_names && campaign.store_names.length > 0
                  ? campaign.store_names.join(", ")
                  : campaign.store?.store_name || "Não especificada"}
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
                  <div className="mt-4 bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-lg">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <DollarSign className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm font-medium">Receita Gerada</span>
                    </div>
                    <p className="text-xl font-semibold text-foreground">
                      {formatCurrency(campaign.revenue, campaign.currency || "BRL")}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Rejection Reason */}
          {campaign.status === "rejected" && campaign.rejection_reason && (
            <>
              <Separator />
              <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 p-4 rounded-lg">
                <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400 mb-2">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="font-medium">Motivo da Rejeição</span>
                </div>
                <p className="text-orange-800 dark:text-orange-300 whitespace-pre-wrap">
                  {campaign.rejection_reason}
                </p>
                {campaign.reviewer && (
                  <p className="text-sm text-orange-600 dark:text-orange-500 mt-2">
                    Rejeitada por {campaign.reviewer.name} em{" "}
                    {campaign.reviewed_at
                      ? new Date(campaign.reviewed_at).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "data desconhecida"}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Approval Info */}
          {["approved", "scheduled"].includes(campaign.status) && campaign.reviewer && (
            <>
              <Separator />
              <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-4 rounded-lg">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 mb-2">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">Aprovada</span>
                </div>
                <p className="text-sm text-emerald-600 dark:text-emerald-500">
                  Por {campaign.reviewer.name} em{" "}
                  {campaign.reviewed_at
                    ? new Date(campaign.reviewed_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "data desconhecida"}
                </p>
                {campaign.approval_notes && (
                  <p className="text-emerald-800 dark:text-emerald-300 mt-2 whitespace-pre-wrap">
                    {campaign.approval_notes}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Pending Review Info */}
          {campaign.status === "pending_review" && campaign.submitter && (
            <>
              <Separator />
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 mb-2">
                  <Clock className="h-5 w-5" />
                  <span className="font-medium">Aguardando Revisão</span>
                </div>
                <p className="text-sm text-blue-600 dark:text-blue-500">
                  Enviada por {campaign.submitter.name} em{" "}
                  {campaign.submitted_at
                    ? new Date(campaign.submitted_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "data desconhecida"}
                </p>
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
          <div className="space-y-3">
            {/* Approval Workflow Actions */}
            {canApprove && (
              <div className="flex gap-2">
                <Button
                  variant="default"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleApprove}
                  disabled={approving}
                >
                  {approving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Aprovar
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-orange-500 text-orange-600 hover:bg-orange-50"
                  onClick={() => setShowRejectDialog(true)}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Rejeitar
                </Button>
              </div>
            )}

            {/* Submit for Review */}
            {canSubmit && (
              <Button
                variant="outline"
                className="w-full"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Enviar para Revisão
              </Button>
            )}

            {/* Standard Actions */}
            <div className="flex justify-between">
              <div className="flex gap-2">
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

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadHistory}
                  disabled={loadingHistory}
                >
                  {loadingHistory ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <History className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <Button onClick={onEdit}>
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </Button>
            </div>
          </div>

          {/* Reject Dialog */}
          <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Rejeitar Campanha</DialogTitle>
                <DialogDescription>
                  Informe o motivo da rejeição para que o criador possa fazer as correções necessárias.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reject-reason">Motivo da Rejeição</Label>
                  <Textarea
                    id="reject-reason"
                    placeholder="Descreva o que precisa ser corrigido..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={4}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={rejecting || !rejectReason.trim()}
                >
                  {rejecting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-2" />
                  )}
                  Rejeitar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* History Dialog */}
          <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Histórico da Campanha</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {history.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    Nenhum histórico encontrado
                  </p>
                ) : (
                  history.map((h) => (
                    <div
                      key={h.id}
                      className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {h.from_status && (
                            <>
                              <Badge variant="neutral" showDot={false} className="text-xs">
                                {statusConfig[h.from_status]?.label || h.from_status}
                              </Badge>
                              <span className="text-muted-foreground">→</span>
                            </>
                          )}
                          <Badge className={statusConfig[h.to_status]?.color || ""}>
                            {statusConfig[h.to_status]?.label || h.to_status}
                          </Badge>
                        </div>
                        {h.reason && (
                          <p className="text-sm text-muted-foreground mt-1">{h.reason}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {h.changer?.name || "Sistema"} •{" "}
                          {new Date(h.created_at).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  )
}
