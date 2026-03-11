"use client"

import Link from "next/link"
import { Plus, UserPlus, Calendar, FileText, Zap, Rocket, ClipboardList, Store, PenLine } from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePermissions } from "@/lib/hooks/use-permissions"
import { cn } from "@/lib/utils"

interface QuickAction {
  label: string
  href: string
  icon: React.ElementType
  primary?: boolean
  requiredFeatures?: string[]
}

const allActions: QuickAction[] = [
  // Admin/Owner actions
  { label: "Novo Cliente", href: "/clients/new", icon: UserPlus, primary: true, requiredFeatures: ["create_clients"] },
  { label: "Nova Automacao", href: "/automations/new", icon: Zap, requiredFeatures: ["campaign_control"] },

  // COO actions
  { label: "Aprovar Onboarding", href: "/onboarding", icon: Rocket, requiredFeatures: ["onboarding_control"] },

  // Shared actions
  { label: "Agendar Reuniao", href: "/meetings", icon: Calendar, requiredFeatures: ["calendar_control"] },
  { label: "Nova Campanha", href: "/campaigns", icon: Plus, requiredFeatures: ["campaign_control", "campaign_view"] },
  { label: "Criar Relatorio", href: "/reports/new", icon: FileText, requiredFeatures: ["view_reports"] },

  // Design actions
  { label: "Ver Copys", href: "/campaigns?view=copy", icon: PenLine, requiredFeatures: ["campaign_copy"] },

  // Implementation actions
  { label: "Ver Board", href: "/board", icon: ClipboardList, requiredFeatures: ["request_control", "request_execute"] },
  { label: "Ver Lojas", href: "/stores", icon: Store },
]

export function QuickActions() {
  const { permissions, hasAnyFeature, isLoading } = usePermissions()

  if (isLoading || !permissions) return null

  const isAdminOrOwner = permissions.isAdmin || permissions.isOrgOwner

  const visibleActions = allActions.filter((action) => {
    if (!action.requiredFeatures) return true
    if (isAdminOrOwner) return true
    return hasAnyFeature(action.requiredFeatures)
  }).slice(0, 5) // Max 5 actions visible

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {visibleActions.map((action) => (
        <Button
          key={action.label}
          variant={action.primary ? "default" : "outline"}
          size="sm"
          className={cn(
            "h-9 px-4 text-xs font-medium rounded-lg transition-all duration-200",
            action.primary
              ? "bg-gradient-to-r from-[#4e62d8] to-[#2137b6] hover:from-[#5a6edf] hover:to-[#2a42c2] border-0 shadow-md shadow-[#4e62d8]/25 hover:shadow-lg hover:shadow-[#4e62d8]/30"
              : "border-border bg-card hover:bg-muted/50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
          )}
          asChild
        >
          <Link href={action.href} className="flex items-center gap-2">
            <action.icon className="h-3.5 w-3.5" strokeWidth={1.5} />
            {action.label}
          </Link>
        </Button>
      ))}
    </div>
  )
}
