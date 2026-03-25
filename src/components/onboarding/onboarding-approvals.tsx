"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { useToast } from "@/lib/hooks/use-toast"
import { Check, X, MessageSquare, Store, User, Calendar, Loader2, FileText, ExternalLink, ImageIcon, BookOpen } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import Link from "next/link"

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
    country?: string
    language?: string
    free_shipping_type?: string
    shopify_collaborator_code?: string
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

const countryLabel: Record<string, string> = {
  BR: "Brasil",
  US: "Estados Unidos",
  PT: "Portugal",
  ES: "Espanha",
  MX: "México",
  AR: "Argentina",
  CO: "Colômbia",
  CL: "Chile",
}

const languageLabel: Record<string, string> = {
  "pt-BR": "Português (BR)",
  "pt-PT": "Português (PT)",
  "en-US": "Inglês (US)",
  "es-ES": "Espanhol (ES)",
  "es-MX": "Espanhol (MX)",
}

const freeShippingLabel: Record<string, string> = {
  all: "Frete Grátis Total",
  conditional: "Frete Grátis Condicional",
  none: "Sem Frete Grátis",
}

const priceSensitivityLabel: Record<string, string> = {
  price: "Focado em Preço",
  balanced: "Equilibrado",
  quality: "Qualidade",
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
        <Icon icon={Loader2} size={24} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (onboardings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
        <Icon icon={Check} customSize={48} className="mb-2" />
        <p className="text-lg font-medium">Nenhuma aprovação pendente</p>
        <p className="text-sm">Todos os formulários foram processados</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Aprovações Pendentes</h3>
        <Badge variant="neutral">{onboardings.length} pendente{onboardings.length > 1 ? "s" : ""}</Badge>
      </div>

      {onboardings.map((onb) => (
        <Card key={onb.id}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon icon={Store} size={16} />
                  {onb.store?.store_name || "Loja sem nome"}
                </CardTitle>
                <CardDescription className="flex items-center gap-2 mt-1">
                  <Icon icon={User} customSize={12} />
                  {onb.client?.name} {onb.client?.company ? `(${onb.client.company})` : ""}
                </CardDescription>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Icon icon={Calendar} customSize={12} />
                {formatDate(onb.submitted_at)}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Dados do Cliente */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Dados do Cliente</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Email</span>
                  <p className="truncate">{onb.client?.email || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Telefone</span>
                  <p>{onb.client?.phone || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">CPF/CNPJ</span>
                  <p>{onb.client?.cpf_cnpj || "-"}</p>
                </div>
              </div>
            </div>

            {/* Dados da Loja */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Dados da Loja</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Plataforma</span>
                  <p>{platformLabel[onb.store?.platform || ""] || onb.store?.platform || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Nicho</span>
                  <p>{onb.store?.niche || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">País</span>
                  <p>{countryLabel[onb.store?.country || ""] || onb.store?.country || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Idioma</span>
                  <p>{languageLabel[onb.store?.language || ""] || onb.store?.language || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Frete</span>
                  <p>{freeShippingLabel[onb.store?.free_shipping_type || ""] || onb.store?.free_shipping_type || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Código Colaborador</span>
                  <p className="font-mono text-xs">{onb.store?.shopify_collaborator_code || "-"}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground text-xs">URL</span>
                  {onb.store?.store_url ? (
                    <p>
                      <a href={onb.store.store_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                        {onb.store.store_url}
                        <Icon icon={ExternalLink} customSize={12} />
                      </a>
                    </p>
                  ) : (
                    <p>-</p>
                  )}
                </div>
              </div>
            </div>

            {/* Público e Marca */}
            {(onb.store?.target_audience || onb.store_onboarding_data?.price_sensitivity || onb.store_onboarding_data?.design_direction_text || onb.store_onboarding_data?.additional_notes) && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Público e Marca</h4>
                <div className="space-y-2 text-sm">
                  {onb.store?.target_audience && (
                    <div>
                      <span className="text-muted-foreground text-xs">Público-alvo</span>
                      <p>{onb.store.target_audience}</p>
                    </div>
                  )}
                  {onb.store_onboarding_data?.price_sensitivity && (
                    <div>
                      <span className="text-muted-foreground text-xs">Sensibilidade de preço</span>
                      <p>
                        <Badge variant="neutral" showDot={false} className="text-xs">
                          {priceSensitivityLabel[onb.store_onboarding_data.price_sensitivity] || onb.store_onboarding_data.price_sensitivity}
                        </Badge>
                      </p>
                    </div>
                  )}
                  {onb.store_onboarding_data?.design_direction_text && (
                    <div>
                      <span className="text-muted-foreground text-xs">Direção de design</span>
                      <p>{onb.store_onboarding_data.design_direction_text}</p>
                    </div>
                  )}
                  {onb.store_onboarding_data?.additional_notes && (
                    <div>
                      <span className="text-muted-foreground text-xs">Notas adicionais</span>
                      <p className="text-muted-foreground">{onb.store_onboarding_data.additional_notes}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Arquivos */}
            {(onb.store_onboarding_data?.logo_url || onb.store_onboarding_data?.brand_manual_url) && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Arquivos</h4>
                <div className="flex flex-wrap gap-2">
                  {onb.store_onboarding_data?.logo_url && (
                    <a href={onb.store_onboarding_data.logo_url} target="_blank" rel="noopener noreferrer">
                      <Badge variant="neutral" className="cursor-pointer hover:bg-muted gap-1">
                        <Icon icon={ImageIcon} customSize={12} />
                        Logo
                        <Icon icon={ExternalLink} customSize={12} />
                      </Badge>
                    </a>
                  )}
                  {onb.store_onboarding_data?.brand_manual_url && (
                    <a href={onb.store_onboarding_data.brand_manual_url} target="_blank" rel="noopener noreferrer">
                      <Badge variant="neutral" className="cursor-pointer hover:bg-muted gap-1">
                        <Icon icon={BookOpen} customSize={12} />
                        Manual da Marca
                        <Icon icon={ExternalLink} customSize={12} />
                      </Badge>
                    </a>
                  )}

                </div>
              </div>
            )}

            {/* Notas do formulário */}
            {onb.notes && (
              <div className="p-2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm">
                <Icon icon={FileText} customSize={12} className="inline mr-1" />
                {onb.notes}
              </div>
            )}

            {/* Formulário status + Ações */}
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-2">
                {onb.store_onboarding_data?.is_complete ? (
                  <Badge variant="info" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs">Formulário Completo</Badge>
                ) : (
                  <Badge variant="neutral" className="text-xs">Formulário Parcial</Badge>
                )}
                <Button size="sm" variant="ghost" asChild>
                  <Link href={`/admin/stores/${onb.store_id}`}>
                    <Icon icon={Store} size={16} className="mr-1" />
                    Ver Loja
                  </Link>
                </Button>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => openAction(onb, "approved")} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Icon icon={Check} size={16} className="mr-1" />
                  Aprovar
                </Button>
                <Button size="sm" variant="secondary" onClick={() => openAction(onb, "revision_requested")}>
                  <Icon icon={MessageSquare} size={16} className="mr-1" />
                  Revisão
                </Button>
                <Button size="sm" variant="destructive" onClick={() => openAction(onb, "rejected")}>
                  <Icon icon={X} size={16} className="mr-1" />
                  Rejeitar
                </Button>
              </div>
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
            <Button variant="secondary" onClick={() => setActionDialog({ open: false })}>
              Cancelar
            </Button>
            <Button
              onClick={handleAction}
              disabled={processing || (actionDialog.action !== "approved" && !comments.trim())}
              className={
                actionDialog.action === "approved"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : actionDialog.action === "rejected"
                  ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  : ""
              }
            >
              {processing ? <Icon icon={Loader2} size={16} className="animate-spin mr-1" /> : null}
              {actionDialog.action === "approved" ? "Confirmar Aprovação" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
