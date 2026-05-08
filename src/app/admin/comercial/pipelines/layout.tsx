"use client"

import { PipelinesNavSidebar } from "@/components/crm/pipelines-nav-sidebar"

/**
 * Layout 2-paineis para /admin/comercial/pipelines/**.
 *
 * Como o Header global e ocultado nessas rotas (ver
 * `components/layout/header.tsx`), a viewport util e a tela toda menos o
 * padding do <main>. `-m-*` cancela o padding do main e `h-[calc(100vh-...)]`
 * compensa apenas o padding (sem -3.5rem do header).
 */
export default function ComercialPipelinesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex -m-4 md:-m-6 lg:-m-8 h-[calc(100vh-1rem)] md:h-[calc(100vh-1.5rem)] lg:h-[calc(100vh-2rem)]">
      <div className="hidden md:block h-full overflow-hidden">
        <PipelinesNavSidebar scope="sales" />
      </div>
      <div className="flex-1 min-w-0 h-full overflow-hidden">{children}</div>
    </div>
  )
}
