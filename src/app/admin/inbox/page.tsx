"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { InboxView } from "@/components/crm/inbox-view"

/**
 * Deep-link: /admin/inbox?thread=<id> abre a conversa direto —
 * usado pelo link das notificações do sino (crm-inbox-notification).
 * useSearchParams exige Suspense boundary em client component.
 */
function InboxWithParams() {
  const searchParams = useSearchParams()
  return <InboxView initialThreadId={searchParams.get("thread")} />
}

export default function CrmInboxPage() {
  return (
    // Altura: no mobile desconta os 56px do MobileTopBar (h-14) que fica
    // sticky acima do conteúdo; no desktop (md+) não há top bar, então
    // ocupa 100dvh cheio. dvh (não vh) para não "saltar" com a barra de
    // URL do iOS nem cobrir o composer quando o teclado abre. As margens
    // negativas cancelam o padding do shell (p-4 md:p-6 lg:p-8).
    <div className="-m-4 md:-m-6 lg:-m-8 h-[calc(100dvh-56px)] md:h-[100dvh]">
      <Suspense fallback={null}>
        <InboxWithParams />
      </Suspense>
    </div>
  )
}
