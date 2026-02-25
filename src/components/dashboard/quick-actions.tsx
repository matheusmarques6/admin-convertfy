"use client"

import Link from "next/link"
import { Plus, UserPlus, Calendar, FileText, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"

const linkActions = [
  {
    label: "Novo Cliente",
    href: "/clients/new",
    icon: UserPlus,
    primary: true,
  },
  {
    label: "Novo Deal",
    href: "/pipeline?action=new",
    icon: Plus,
    primary: false,
  },
  {
    label: "Agendar Reunião",
    href: "/meetings",
    icon: Calendar,
    primary: false,
  },
  {
    label: "Criar Relatório",
    href: "/reports/new",
    icon: FileText,
    primary: false,
  },
  {
    label: "Nova Automação",
    href: "/automations/new",
    icon: Zap,
    primary: false,
  },
]

export function QuickActions() {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {linkActions.map((action) => (
        <Button
          key={action.label}
          variant={action.primary ? "default" : "outline"}
          size="sm"
          className={
            action.primary
              ? "bg-[#5327F2] hover:bg-[#5327F2]/90 text-white shadow-sm shadow-[#5327F2]/20 rounded-lg h-9 px-4 text-[13px] font-medium"
              : "border border-border/60 bg-card hover:bg-accent text-muted-foreground hover:text-foreground rounded-lg h-9 px-4 text-[13px] font-medium transition-colors"
          }
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
