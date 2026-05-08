"use client"

import { PipelinesNavSidebar } from "@/components/crm/pipelines-nav-sidebar"

/**
 * Layout 2-paineis para /admin/comercial/pipelines/**.
 *
 * Anula o padding do <main> do admin layout (px-4 md:px-6 lg:px-8) com
 * `-m-*` matching e usa `h-[calc(100vh-3.5rem)]` pra ocupar a viewport
 * inteira menos a altura do header (h-14 = 3.5rem). Em mobile (sem
 * header desktop) usa h-screen.
 */
export default function ComercialPipelinesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex -m-4 md:-m-6 lg:-m-8 h-[calc(100vh-3.5rem-1rem)] md:h-[calc(100vh-3.5rem-1.5rem)] lg:h-[calc(100vh-3.5rem-2rem)]">
      <div className="hidden md:block h-full overflow-hidden">
        <PipelinesNavSidebar scope="sales" />
      </div>
      <div className="flex-1 min-w-0 h-full overflow-hidden">{children}</div>
    </div>
  )
}
