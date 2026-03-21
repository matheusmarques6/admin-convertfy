"use client"

import Link from "next/link"
import { Plus, UserPlus, Calendar, FileText, Zap, Rocket, ClipboardList, Store, PenLine } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { usePermissions } from "@/lib/hooks/use-permissions"

interface QuickAction {
  label: string
  href: string
  icon: LucideIcon
  primary?: boolean
  requiredFeatures?: string[]
}

const allActions: QuickAction[] = [
  { label: "Novo Cliente", href: "/admin/clients/new", icon: UserPlus, primary: true, requiredFeatures: ["create_clients"] },
  { label: "Nova Automacao", href: "/admin/automations/new", icon: Zap, requiredFeatures: ["campaign_control"] },
  { label: "Aprovar Onboarding", href: "/admin/onboarding", icon: Rocket, requiredFeatures: ["onboarding_control"] },
  { label: "Agendar Reuniao", href: "/admin/meetings", icon: Calendar, requiredFeatures: ["calendar_control"] },
  { label: "Nova Campanha", href: "/admin/campaigns", icon: Plus, requiredFeatures: ["campaign_control", "campaign_view"] },
  { label: "Criar Relatorio", href: "/admin/reports/new", icon: FileText, requiredFeatures: ["view_reports"] },
  { label: "Ver Copys", href: "/admin/campaigns?view=copy", icon: PenLine, requiredFeatures: ["campaign_copy"] },
  { label: "Ver Board", href: "/admin/board", icon: ClipboardList, requiredFeatures: ["request_control", "request_execute"] },
  { label: "Ver Lojas", href: "/admin/stores", icon: Store },
]

export function QuickActions() {
  const { permissions, hasAnyFeature, isLoading } = usePermissions()

  if (isLoading || !permissions) return null

  const isAdminOrOwner = permissions.isAdmin || permissions.isOrgOwner

  const visibleActions = allActions.filter((action) => {
    if (!action.requiredFeatures) return true
    if (isAdminOrOwner) return true
    return hasAnyFeature(action.requiredFeatures)
  }).slice(0, 5)

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {visibleActions.map((action) => (
        <Button
          key={action.label}
          variant={action.primary ? "primary" : "secondary"}
          size="sm"
          className="h-9 px-3.5 text-xs font-medium rounded-xl gap-1.5 transition-all duration-200 hover:shadow-sm"
          asChild
        >
          <Link href={action.href}>
            <Icon icon={action.icon} customSize={14} />
            {action.label}
          </Link>
        </Button>
      ))}
    </div>
  )
}
