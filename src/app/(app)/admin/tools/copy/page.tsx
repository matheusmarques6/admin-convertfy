"use client"

import { PenLine } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { PermissionGate } from "@/components/permission-gate"
import { CopyTab } from "@/components/campaigns/copy-tab"
import { CopyGenerationBoard } from "@/components/campaigns/copy-generation-board"

export default function CopyGeneratorPage() {
  return (
    <PermissionGate requiredFeatures={["campaign_copy"]}>
      <div className="flex-1 space-y-6">
        <PageHeader
          icon={PenLine}
          title="Gerador de Copy"
          description="Crie assuntos e textos para suas campanhas de email e SMS com IA"
        />
        <CopyTab />
        <CopyGenerationBoard />
      </div>
    </PermissionGate>
  )
}
