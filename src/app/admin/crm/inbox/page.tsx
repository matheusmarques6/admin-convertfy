"use client"

import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { CrmEmptyState } from "@/components/crm/crm-empty-state"
import { Inbox } from "lucide-react"

export default function CrmInboxPage() {
  return (
    <CrmPageShell
      title="Inbox"
      subtitle="WhatsApp Cloud API, email e mensagens unificadas"
    >
      <div className="p-6">
        <CrmEmptyState
          icon={<Inbox className="h-5 w-5" />}
          title="Inbox em construcao"
          description="A Fase 4 conecta a WhatsApp Cloud API oficial via webhook e habilita o multi-atendimento com atribuicao automatica."
        />
      </div>
    </CrmPageShell>
  )
}
