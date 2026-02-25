"use client"

import Link from "next/link"
import { Plus, UserPlus, Calendar, FileText, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"

const linkActions = [
  { label: "Novo Cliente", href: "/clients/new", icon: UserPlus, primary: true },
  { label: "Novo Deal", href: "/pipeline?action=new", icon: Plus },
  { label: "Agendar Reunião", href: "/meetings", icon: Calendar },
  { label: "Criar Relatório", href: "/reports/new", icon: FileText },
  { label: "Nova Automação", href: "/automations/new", icon: Zap },
]

export function QuickActions() {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {linkActions.map((action) => (
        <Button
          key={action.label}
          variant={action.primary ? "default" : "outline"}
          size="sm"
          className="h-8 px-3 text-xs font-medium rounded-lg"
          asChild
        >
          <Link href={action.href}>
            <action.icon className="h-3.5 w-3.5 mr-1.5" />
            {action.label}
          </Link>
        </Button>
      ))}
    </div>
  )
}
