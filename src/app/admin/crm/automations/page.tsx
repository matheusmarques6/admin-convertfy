"use client"

import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { CrmEmptyState } from "@/components/crm/crm-empty-state"
import { Workflow } from "lucide-react"

export default function CrmAutomationsListPage() {
  return (
    <CrmPageShell
      title="Automacoes CRM"
      subtitle="Triggers, condicoes e acoes em DAG (JSON versionado)"
    >
      <div className="p-6">
        <CrmEmptyState
          icon={<Workflow className="h-5 w-5" />}
          title="Engine de automacao em construcao"
          description="A Fase 5 traz o builder visual (ReactFlow), execucao em fila e versionamento de definicoes em JSON."
        />
      </div>
    </CrmPageShell>
  )
}
