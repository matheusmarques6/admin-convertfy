"use client"

import { useState } from "react"
import Link from "next/link"
import { Plus, UserPlus, Calendar, FileText, Zap, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CampaignBatchModal } from "@/components/campaigns/campaign-batch-modal"

const linkActions = [
  {
    label: "Novo Cliente",
    href: "/clients/new",
    icon: UserPlus,
    variant: "default" as const,
  },
  {
    label: "Novo Deal",
    href: "/pipeline?action=new",
    icon: Plus,
    variant: "outline" as const,
  },
  {
    label: "Agendar Reunião",
    href: "/meetings/new",
    icon: Calendar,
    variant: "outline" as const,
  },
  {
    label: "Criar Relatório",
    href: "/reports/new",
    icon: FileText,
    variant: "outline" as const,
  },
  {
    label: "Nova Automação",
    href: "/automations/new",
    icon: Zap,
    variant: "outline" as const,
  },
]

export function QuickActions() {
  const [campaignModalOpen, setCampaignModalOpen] = useState(false)

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {/* Campaign Batch Button */}
        <Button
          variant="default"
          size="sm"
          onClick={() => setCampaignModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Send className="mr-2 h-4 w-4" />
          Nova Campanha em Lote
        </Button>

        {/* Link Actions */}
        {linkActions.map((action) => (
          <Button key={action.label} variant={action.variant} size="sm" asChild>
            <Link href={action.href}>
              <action.icon className="mr-2 h-4 w-4" />
              {action.label}
            </Link>
          </Button>
        ))}
      </div>

      {/* Campaign Batch Modal */}
      <CampaignBatchModal
        open={campaignModalOpen}
        onOpenChange={setCampaignModalOpen}
        onSuccess={() => {
          // Could add a toast notification here
        }}
      />
    </>
  )
}
