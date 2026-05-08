"use client"

import { PipelinesNavSidebar } from "@/components/crm/pipelines-nav-sidebar"

/**
 * Layout 2-paineis para /admin/operacional/pipelines/**.
 * Ver justificativa do calc(100vh-...) em comercial/pipelines/layout.tsx.
 */
export default function OperacionalPipelinesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex -m-4 md:-m-6 lg:-m-8 h-[calc(100vh-3.5rem-1rem)] md:h-[calc(100vh-3.5rem-1.5rem)] lg:h-[calc(100vh-3.5rem-2rem)]">
      <div className="hidden md:block h-full overflow-hidden">
        <PipelinesNavSidebar scope="cs" />
      </div>
      <div className="flex-1 min-w-0 h-full overflow-hidden">{children}</div>
    </div>
  )
}
