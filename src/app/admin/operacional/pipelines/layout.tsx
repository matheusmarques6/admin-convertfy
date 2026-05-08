"use client"

import { PipelinesNavSidebar } from "@/components/crm/pipelines-nav-sidebar"

/**
 * Layout 2-painéis para /admin/operacional/pipelines/**:
 * sidebar de pipelines CS persistente + board do pipeline ativo.
 *
 * Ver comentario completo em /admin/comercial/pipelines/layout.tsx.
 */
export default function OperacionalPipelinesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full min-h-0 -m-4 md:-m-6 lg:-m-8">
      <div className="hidden md:block h-full">
        <PipelinesNavSidebar scope="cs" />
      </div>
      <div className="flex-1 min-w-0 h-full overflow-hidden">{children}</div>
    </div>
  )
}
