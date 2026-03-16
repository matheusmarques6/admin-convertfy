"use client"

import { Mail } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatCurrencyCompact } from "@/lib/utils/format"
import { CHANNEL_CONFIG, STATUS_CONFIG } from "@/lib/constants/calendar"
import type { PortalCampaign } from "@/lib/hooks/use-portal-campaigns-calendar"

// ============================================
// LOCAL UTILITIES
// ============================================

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

export interface CampaignDayListModalProps {
  date: string
  campaigns: PortalCampaign[]
  open: boolean
  onSelect: (campaign: PortalCampaign) => void
  onClose: () => void
}

// ============================================
// COMPONENT
// ============================================

export function CampaignDayListModal({
  date,
  campaigns,
  open,
  onSelect,
  onClose,
}: CampaignDayListModalProps) {
  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="bg-white dark:bg-[#151922] border-slate-200/80 dark:border-slate-700/40 text-slate-800 dark:text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-slate-800 dark:text-slate-100">
            Campanhas em {date ? formatDate(date) : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-4">
          {campaigns.map((campaign) => {
            const ChannelIcon = CHANNEL_CONFIG[campaign.channel]?.icon || Mail
            const statusConfig = STATUS_CONFIG[campaign.status]
            return (
              <div
                key={campaign.id}
                onClick={() => onSelect(campaign)}
                className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 dark:bg-[#1A1F2E] border border-slate-200/80 dark:border-slate-700/40 cursor-pointer hover:bg-white dark:hover:bg-[#151922] hover:shadow-md dark:hover:shadow-slate-900/30 transition-all"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: campaign.color || "#3b82f6" }}
                >
                  <ChannelIcon className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 dark:text-slate-100 truncate">{campaign.name}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {campaign.scheduledTime ? formatTime(campaign.scheduledTime) : "Sem horario"} •{" "}
                    {campaign.store?.store_name || "Loja"}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge className={statusConfig?.color}>
                    {statusConfig?.label}
                  </Badge>
                  {campaign.status === "sent" && campaign.hasKlaviyoMetrics && (campaign.revenue ?? 0) > 0 && (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      {formatCurrencyCompact(campaign.revenue ?? 0)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
