import { invokeRouteJson } from "@/lib/api/invoke-route"
import { GET as getInboxThreads } from "@/app/api/crm/inbox/threads/route"
import { InboxView, type ThreadSummary } from "@/components/crm/inbox-view"

export const dynamic = "force-dynamic"

/**
 * RSC casca: pré-carrega as threads (mesma rota, invocada in-process, mesma
 * key inicial do client: status=open) e entrega como initialThreads. O
 * detalhe da thread NÃO é prefetchado (depende da seleção do usuário) e o
 * refreshInterval de 10s do client continua garantindo frescor.
 */
export default async function CrmInboxPage() {
  const initialThreads = await invokeRouteJson(
    getInboxThreads,
    "/api/crm/inbox/threads?status=open",
  )

  return (
    <div className="-m-4 md:-m-6 lg:-m-8 h-[calc(100vh-44px)]">
      <InboxView
        initialThreads={initialThreads as { threads: ThreadSummary[] } | null}
      />
    </div>
  )
}
