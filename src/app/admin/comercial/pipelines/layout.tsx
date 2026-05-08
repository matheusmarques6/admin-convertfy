"use client"

import { PipelinesNavSidebar } from "@/components/crm/pipelines-nav-sidebar"

/**
 * Layout 2-painéis para /admin/comercial/pipelines/**:
 *
 *   ┌──────────────┬───────────────────────────────────┐
 *   │              │                                   │
 *   │   Pipelines  │           Board ativo             │
 *   │   (sidebar)  │           (children)              │
 *   │              │                                   │
 *   └──────────────┴───────────────────────────────────┘
 *
 * A sidebar persiste enquanto o usuário troca de pipeline — sem
 * precisar voltar pra lista. Estilo DataCrazy.
 */
export default function ComercialPipelinesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full min-h-0 -m-4 md:-m-6 lg:-m-8">
      <div className="hidden md:block h-full">
        <PipelinesNavSidebar scope="sales" />
      </div>
      <div className="flex-1 min-w-0 h-full overflow-hidden">{children}</div>
    </div>
  )
}
