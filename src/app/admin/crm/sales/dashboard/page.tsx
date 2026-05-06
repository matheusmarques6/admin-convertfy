"use client"

import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { CrmEmptyState } from "@/components/crm/crm-empty-state"
import { BarChart3 } from "lucide-react"

export default function SalesDashboardPage() {
  return (
    <CrmPageShell
      title="Dashboard comercial"
      subtitle="KPIs de aquisicao, conversao e velocidade de funil"
    >
      <div className="p-6">
        <CrmEmptyState
          icon={<BarChart3 className="h-5 w-5" />}
          title="Dashboard em construcao"
          description="A Fase 2 traz os KPIs de pipeline value, win rate, conversao por fonte e tempo medio em cada estagio."
        />
      </div>
    </CrmPageShell>
  )
}
