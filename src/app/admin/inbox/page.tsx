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
    <div className="-m-4 md:-m-6 lg:-m-8 h-[calc(100vh-44px)]">
      <Suspense fallback={null}>
        <InboxWithParams />
      </Suspense>
    </div>
  )
}
