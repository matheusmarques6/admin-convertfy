"use client"

import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { CrmEmptyState } from "@/components/crm/crm-empty-state"
import { Heart } from "lucide-react"

export default function CsDashboardPage() {
  return (
    <CrmPageShell
      title="Dashboard Customer Success"
      subtitle="Health score, NPS, churn previsto e cobertura de carteira"
    >
      <div className="p-6">
        <CrmEmptyState
          icon={<Heart className="h-5 w-5" />}
          title="Dashboard em construcao"
          description="A Fase 3 traz health score por loja, distribuicao por faixa, alertas de churn e SLA de tickets."
        />
      </div>
    </CrmPageShell>
  )
}
