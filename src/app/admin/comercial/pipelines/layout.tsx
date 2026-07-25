"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Layers, X } from "lucide-react"
import { PipelinesNavSidebar } from "@/components/crm/pipelines-nav-sidebar"

/**
 * Layout 2-paineis para /admin/comercial/pipelines/**.
 *
 * Como o Header global e ocultado nessas rotas (ver
 * `components/layout/header.tsx`), a viewport util e a tela toda menos o
 * padding do <main>. `-m-*` cancela o padding do main e `h-[calc(100dvh-...)]`
 * compensa apenas o padding (sem -3.5rem do header).
 *
 * No mobile a sidebar de pipelines (oculta abaixo de md) vira um drawer
 * aberto por um botao flutuante — antes nao havia como trocar de pipeline
 * no celular.
 */
export default function ComercialPipelinesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [navOpen, setNavOpen] = useState(false)
  const pathname = usePathname()

  // Fecha o drawer ao navegar para outro pipeline (mudanca de rota).
  useEffect(() => {
    setNavOpen(false)
  }, [pathname])

  return (
    <div className="relative flex -m-4 md:-m-6 lg:-m-8 h-[calc(100dvh-1rem)] md:h-[calc(100dvh-1.5rem)] lg:h-[calc(100dvh-2rem)]">
      {/* Sidebar — desktop/tablet */}
      <div className="hidden md:block h-full overflow-hidden">
        <PipelinesNavSidebar scope="sales" />
      </div>

      {/* Botao flutuante que abre o seletor de pipeline no mobile */}
      <button
        type="button"
        onClick={() => setNavOpen(true)}
        className="md:hidden absolute bottom-4 left-4 z-30 inline-flex items-center gap-1.5 rounded-full px-4 shadow-lg"
        style={{
          height: 40,
          background: "var(--crm-gray-900)",
          color: "var(--crm-gray-0)",
          fontSize: "var(--crm-text-sm)",
          fontWeight: "var(--crm-weight-medium)",
        }}
        aria-label="Trocar de pipeline"
      >
        <Layers className="h-4 w-4" />
        Pipelines
      </button>

      {/* Drawer da sidebar no mobile */}
      {navOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.4)" }}
            onClick={() => setNavOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[280px] max-w-[85%] overflow-hidden shadow-xl">
            <button
              type="button"
              onClick={() => setNavOpen(false)}
              className="absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-[6px]"
              style={{ color: "var(--crm-gray-600)", background: "var(--crm-gray-100)" }}
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
            <PipelinesNavSidebar scope="sales" />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 h-full overflow-hidden">{children}</div>
    </div>
  )
}
