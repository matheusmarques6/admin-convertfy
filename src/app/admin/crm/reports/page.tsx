"use client"

import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { CrmEmptyState } from "@/components/crm/crm-empty-state"
import { BarChart3 } from "lucide-react"

export default function CrmReportsPage() {
  return (
    <CrmPageShell
      title="Reports CRM"
      subtitle="Snapshots diarios — pipeline value, win rate, ciclo medio, NPS"
    >
      <div className="p-6">
        <CrmEmptyState
          icon={<BarChart3 className="h-5 w-5" />}
          title="Reports em construcao"
          description="A Fase 6 entrega snapshots diarios em crm_health_history + reports agregados (sem queries ad-hoc em runtime)."
        />
      </div>
    </CrmPageShell>
  )
}
