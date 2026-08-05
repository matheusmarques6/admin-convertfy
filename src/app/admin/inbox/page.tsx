"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { InboxView } from "@/components/crm/inbox-view"
import { SkeletonShimmer } from "@/components/ui/skeleton"

/**
 * Deep-link: /admin/inbox?thread=<id> abre a conversa direto —
 * usado pelo link das notificações do sino (crm-inbox-notification).
 * useSearchParams exige Suspense boundary em client component.
 */
function InboxWithParams() {
  const searchParams = useSearchParams()
  return <InboxView initialThreadId={searchParams.get("thread")} />
}

/** Mesma silhueta da tela real — `fallback={null}` piscava branco. */
function InboxSkeleton() {
  return (
    <div className="flex h-full" style={{ background: "var(--crm-gray-50)" }}>
      <aside
        className="hidden w-full flex-col gap-3 border-r p-3 md:flex md:w-[320px]"
        style={{ borderColor: "var(--crm-gray-200)", background: "var(--crm-gray-0)" }}
        aria-label="Carregando conversas"
      >
        <SkeletonShimmer className="h-7 w-full rounded-[6px]" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-start gap-2">
            <SkeletonShimmer className="h-8 w-8 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <SkeletonShimmer className="h-3 w-1/2 rounded-[4px]" />
              <SkeletonShimmer className="h-2.5 w-4/5 rounded-[4px]" />
            </div>
          </div>
        ))}
      </aside>
      <div className="flex-1" />
    </div>
  )
}

export default function CrmInboxPage() {
  return (
    // Altura: no mobile desconta os 56px do MobileTopBar (h-14) que fica
    // sticky acima do conteúdo; no desktop (md+) não há top bar, então
    // ocupa 100dvh cheio. dvh (não vh) para não "saltar" com a barra de
    // URL do iOS nem cobrir o composer quando o teclado abre. As margens
    // negativas cancelam o padding do shell (p-4 md:p-6 lg:p-8).
    <div className="-m-4 md:-m-6 lg:-m-8 h-[calc(100dvh-56px)] md:h-[100dvh]">
      <Suspense fallback={<InboxSkeleton />}>
        <InboxWithParams />
      </Suspense>
    </div>
  )
}
