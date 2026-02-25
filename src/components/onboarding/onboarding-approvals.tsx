"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { useToast } from "@/lib/hooks/use-toast"
import { Check, X, MessageSquare, Store, User, Calendar, Loader2, FileText } from "lucide-react"

interface PendingOnboarding {
  id: string
  client_id: string
  store_id: string
  submitted_at: string
  notes?: string
  client?: {
    id: string
    name: string
    company?: string
    email: string
    phone?: string
    cpf_cnpj?: string
  }
  store?: {
    id: string
    store_name: string
    store_url: string
    platform: string
    niche?: string
    target_audience?: string
  }
  store_onboarding_data?: {
    price_sensitivity?: string
    additional_notes?: string
    logo_url?: string
    design_direction_text?: string
    brand_manual_url?: string
    is_complete?: boolean
  }
}

export function OnboardingApprovals() {
  const { toast } = useToast()
  const [onboardings, setOnboardings] = useState<PendingOnboarding[]>([])
  const [loading, setLoading] = useState(true)
  const [actionDialog, setActionDialog] = useState<{
    open: boolean
    onboarding?: PendingOnboarding
    action?: "approved" | "rejected" | "revision_requested"
  }>({ open: false })
  const [comments, setComments] = useState("")
  const [processing, setProcessing] = useState(false)

  const fetchPending = useCallback(async () => {
    try {
      const response = await fetch("/api/onboarding/pending-approval")
      const data = await response.json()
      if (response.ok) {
        setOnboardings(data.onboardings || [])
      }
    } catch (error) {
      console.error("Error fetching pending approvals:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPending()
  }, [fetchPending])

  const handleAction = async () => {
    if (!actionDialog.onboarding || !actionDialog.action) return

    setProcessing(true)
    try {
      const response = await fetch(`/api/onboarding/${actionDialog.onboarding.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: actionDialog.action,
          comments: comments || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Erro ao processar")
      }

      toast({
        title: actionDialog.action === "approved" ? "Aprovado!" : "Ação realizada",
        description: data.message,
      })

      setActionDialog({ open: false })
      setComments("")
      fetchPending()
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao processar",
        variant: "destructive",
      })
    } finally {
      setProcessing(false)
    }
  }

  const openAction = (onboarding: PendingOnboarding, action: "approved" | "rejected" | "revision_requested") => {
    setActionDialog({ open: true, onboarding, action })
    setComments("")
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-"
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const platformLabel: Record<string, string> = {
    shopify: "Shopify",
    nuvemshop: "Nuvemshop",
    woocommerce: "WooCommerce",
    tray: "Tray",
    vtex: "VTEX",
    other: "Outra",
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (onboardings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-slate-400">
        <Check className="h-12 w-12 mb-2" />
        <p className="text-lg font-medium">Nenhuma aprovação pendente</p>
        <p className="text-sm">Todos os formulários foram processados</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Aprovações Pendentes</h3>
        <Badge variant="secondary">{onboardings.length} pendente{onboardings.length > 1 ? "s" : ""}</Badge>
      </div>

      {onboardings.map((onb) => (
        <Card key={onb.id} className="border-l-4 border-l-orange-400">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Store className="h-4 w-4" />
                  {onb.store?.store_name || "Loja sem nome"}
                </CardTitle>
                <CardDescription className="flex items-center gap-2 mt-1">
                  <User className="h-3 w-3" />
                  {onb.client?.name} {onb.client?.company ? `(${onb.client.company})` : ""}
                </CardDescription>
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <Calendar className="h-3 w-3" />
                {formatDate(onb.submitted_at)}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
              <div>
                <span className="text-slate-500 text-xs">Email</span>
                <p className="truncate">{onb.client?.email}</p>
              </div>
              <div>
                <span className="text-slate-500 text-xs">Plataforma</span>
                <p>{platformLabel[onb.store?.platform || ""] || onb.store?.platform}</p>
              </div>
              <div>
                <span className="text-slate-500 text-xs">Nicho</span>
                <p>{onb.store?.niche || "-"}</p>
              </div>
              <div>
                <span className="text-slate-500 text-xs">Formulário</span>
                <p>{onb.store_onboarding_data?.is_complete ?
                  <Badge variant="default" className="bg-green-100 text-green-700 text-xs">Completo</Badge> :
                  <Badge variant="secondary" className="text-xs">Parcial</Badge>
                }</p>
              </div>
            </div>

            {onb.store?.store_url && (
              <div className="text-sm mb-3">
                <span className="text-slate-500 text-xs">URL: </span>
                <a href={onb.store.store_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  {onb.store.store_url}
                </a>
              </div>
            )}

            {onb.store_onboarding_data?.design_direction_text && (
              <div className="text-sm mb-3">
                <span className="text-slate-500 text-xs">Direção de design: </span>
                <span>{onb.store_onboarding_data.design_direction_text}</span>
              </div>
            )}

            {onb.notes && (
              <div className="text-sm mb-3 p-2 rounded bg-yellow-50 text-yellow-800">
                <FileText className="h-3 w-3 inline mr-1" />
                {onb.notes}
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t">
              <Button size="sm" onClick={() => openAction(onb, "approved")} className="bg-green-600 hover:bg-green-700">
                <Check className="h-4 w-4 mr-1" />
                Aprovar
              </Button>
              <Button size="sm" variant="outline" onClick={() => openAction(onb, "revision_requested")}>
                <MessageSquare className="h-4 w-4 mr-1" />
                Solicitar Revisão
              </Button>
              <Button size="sm" variant="destructive" onClick={() => openAction(onb, "rejected")}>
                <X className="h-4 w-4 mr-1" />
                Rejeitar
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Action confirmation dialog */}
      <Dialog open={actionDialog.open} onOpenChange={(open) => setActionDialog({ ...actionDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog.action === "approved" && "Aprovar Onboarding"}
              {actionDialog.action === "rejected" && "Rejeitar Onboarding"}
              {actionDialog.action === "revision_requested" && "Solicitar Revisão"}
            </DialogTitle>
            <DialogDescription>
              {actionDialog.action === "approved"
                ? "Ao aprovar, a geração de copies será iniciada automaticamente no N8N."
                : "O cliente será notificado sobre esta decisão."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm">
              <span className="font-medium">Cliente:</span> {actionDialog.onboarding?.client?.name}
              <br />
              <span className="font-medium">Loja:</span> {actionDialog.onboarding?.store?.store_name}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Comentários {actionDialog.action !== "approved" ? "(obrigatório)" : "(opcional)"}
              </label>
              <Textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder={
                  actionDialog.action === "approved"
                    ? "Comentários opcionais..."
                    : "Descreva o motivo ou os ajustes necessários..."
                }
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog({ open: false })}>
              Cancelar
            </Button>
            <Button
              onClick={handleAction}
              disabled={processing || (actionDialog.action !== "approved" && !comments.trim())}
              className={
                actionDialog.action === "approved"
                  ? "bg-green-600 hover:bg-green-700"
                  : actionDialog.action === "rejected"
                  ? "bg-red-600 hover:bg-red-700"
                  : ""
              }
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {actionDialog.action === "approved" ? "Confirmar Aprovação" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
