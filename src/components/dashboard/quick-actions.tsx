"use client"

import Link from "next/link"
import { Plus, UserPlus, Calendar, FileText, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"

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
    href: "/meetings",
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
  return (
    <div className="flex flex-wrap gap-2">
      {linkActions.map((action) => (
        <Button key={action.label} variant={action.variant} size="sm" asChild>
          <Link href={action.href}>
            <action.icon className="mr-2 h-4 w-4" />
            {action.label}
          </Link>
        </Button>
      ))}
    </div>
  )
}
