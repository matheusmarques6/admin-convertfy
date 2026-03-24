"use client"

import { Mail, Users, Eye, FileText, Target } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatCurrency } from "@/lib/utils/format"
import { CHANNEL_CONFIG } from "@/lib/constants/calendar"
import type { PortalCampaign, PortalCampaignDetailMetrics } from "@/lib/hooks/use-portal-campaigns-calendar"

// ============================================
// LOCAL UTILITIES
// ============================================

function formatNumber(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
  return new Intl.NumberFormat("pt-BR").format(value)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR")
}

function formatTime(timeStr?: string): string {
  if (!timeStr) return ""
  return timeStr.substring(0, 5)
}

// ============================================
// PROPS
// ============================================

export interface CampaignDetailModalProps {
  campaign: PortalCampaign | null
  metrics: PortalCampaignDetailMetrics | null
  isLoadingMetrics: boolean
  open: boolean
  onClose: () => void
}

// ============================================
// COMPONENT
// ============================================

export function CampaignDetailModal({
  campaign,
  metrics,
  isLoadingMetrics,
  open,
  onClose,
}: CampaignDetailModalProps) {
  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="bg-white dark:bg-[#151922] border-slate-200/80 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 max-w-lg sm:max-w-2xl">
        {campaign && (
          <>
            <DialogHeader>
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: campaign.color || "#3b82f6" }}
                >
                  <Icon icon={CHANNEL_CONFIG[campaign.channel]?.icon || Mail} size={24} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-xl text-slate-800 dark:text-slate-100">
                    {campaign.name}
                  </DialogTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {campaign.storeNames && campaign.storeNames.length > 1
                      ? campaign.storeNames.join(", ")
                      : campaign.store?.store_name || "Loja"}{" "}
                    • {formatDate(campaign.scheduledDate)}
                    {campaign.scheduledTime && ` as ${formatTime(campaign.scheduledTime)}`}
                  </p>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-5 mt-4">
              {/* Status, Channel and Source */}
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={campaign.status} />
                <Badge className={`${CHANNEL_CONFIG[campaign.channel]?.lightColor} ${CHANNEL_CONFIG[campaign.channel]?.textColor} border-0`}>
                  {CHANNEL_CONFIG[campaign.channel]?.label}
                </Badge>
                {campaign.source === "klaviyo" && (
                  <Badge className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20">Klaviyo</Badge>
                )}
                {campaign.source === "batch" && (
                  <Badge className="bg-primary/10 text-primary border-primary/20">Lote</Badge>
                )}
              </div>

              {/* Subject Line */}
              {campaign.subjectLine && (
                <div className="rounded-lg bg-slate-50 dark:bg-[#1A1F2E] border border-slate-100 dark:border-slate-700/30 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon icon={FileText} size={16} className="text-slate-400 dark:text-slate-500" />
                    <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide">Assunto</p>
                  </div>
                  <p className="text-sm text-slate-800 dark:text-slate-100">{campaign.subjectLine}</p>
                </div>
              )}

              {/* Segment */}
              {campaign.segmentName && (
                <div className="rounded-lg bg-slate-50 dark:bg-[#1A1F2E] border border-slate-100 dark:border-slate-700/30 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon icon={Target} size={16} className="text-slate-400 dark:text-slate-500" />
                    <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide">Segmento</p>
                  </div>
                  <p className="text-sm text-slate-800 dark:text-slate-100">{campaign.segmentName}</p>
                </div>
              )}

              {/* Description */}
              {campaign.description && (
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">Descricao</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{campaign.description}</p>
                </div>
              )}

              {/* Performance Metrics (only for sent campaigns) */}
              {campaign.status === "sent" && (
                <div className="border-t border-slate-200/80 dark:border-slate-700/40 pt-5">
                  <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-4">Performance</p>

                  {campaign.hasKlaviyoMetrics ? (
                    <>
                      {isLoadingMetrics ? (
                        <div className="grid grid-cols-3 gap-3">
                          {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton key={i} className="h-20 rounded-lg" />
                          ))}
                        </div>
                      ) : metrics ? (
                        <>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="rounded-lg border p-3 text-center">
                              <p className="text-2xl font-bold">{(metrics.delivered ?? 0).toLocaleString("pt-BR")}</p>
                              <p className="text-xs text-muted-foreground">Entregues</p>
                              <p className="text-sm text-muted-foreground">{metrics.delivery_rate != null ? `${metrics.delivery_rate.toFixed(1)}%` : "\u2014"}</p>
                            </div>
                            <div className="rounded-lg border p-3 text-center">
                              <p className="text-2xl font-bold">{(metrics.opened ?? 0).toLocaleString("pt-BR")}</p>
                              <p className="text-xs text-muted-foreground">Aberturas</p>
                              <p className="text-sm text-muted-foreground">{metrics.open_rate != null ? `${metrics.open_rate.toFixed(1)}%` : "\u2014"}</p>
                            </div>
                            <div className="rounded-lg border p-3 text-center">
                              <p className="text-2xl font-bold">{(metrics.clicked ?? 0).toLocaleString("pt-BR")}</p>
                              <p className="text-xs text-muted-foreground">Cliques</p>
                              <p className="text-sm text-muted-foreground">{metrics.click_rate != null ? `${metrics.click_rate.toFixed(1)}%` : "\u2014"}</p>
                            </div>
                            <div className="rounded-lg border p-3 text-center">
                              <p className="text-2xl font-bold">{(metrics.conversions ?? 0).toLocaleString("pt-BR")}</p>
                              <p className="text-xs text-muted-foreground">Conversoes</p>
                              <p className="text-sm text-muted-foreground">{metrics.conversion_rate != null ? `${metrics.conversion_rate.toFixed(1)}%` : "\u2014"}</p>
                            </div>
                            <div className="rounded-lg border p-3 text-center">
                              <p className="text-2xl font-bold">{formatCurrency(metrics.conversion_value ?? 0, campaign.currency || "BRL")}</p>
                              <p className="text-xs text-muted-foreground">Receita</p>
                            </div>
                            <div className="rounded-lg border p-3 text-center">
                              <p className="text-2xl font-bold">{formatCurrency(metrics.revenue_per_recipient ?? 0, campaign.currency || "BRL")}</p>
                              <p className="text-xs text-muted-foreground">RPR</p>
                            </div>
                          </div>
                          {metrics.fetched_at && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Ultima atualizacao: {formatDistanceToNow(new Date(metrics.fetched_at), { addSuffix: true, locale: ptBR })}
                            </p>
                          )}
                        </>
                      ) : (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="rounded-lg bg-sky-50 dark:bg-sky-500/10 border border-sky-100 dark:border-sky-500/20 p-3">
                            <div className="flex items-center gap-2">
                              <Icon icon={Users} size={16} className="text-[#05AFF2]" />
                              <span className="text-xs text-slate-500 dark:text-slate-400">Enviados</span>
                            </div>
                            <p className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1">
                              {formatNumber(campaign.recipients || 0)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 p-3">
                            <div className="flex items-center gap-2">
                              <Icon icon={Eye} size={16} className="text-emerald-600" />
                              <span className="text-xs text-slate-500 dark:text-slate-400">Abertura</span>
                            </div>
                            <p className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1">
                              {campaign.openRate != null ? `${campaign.openRate.toFixed(1)}%` : "\u2014"}
                            </p>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      Metricas disponiveis apos envio via Klaviyo
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
