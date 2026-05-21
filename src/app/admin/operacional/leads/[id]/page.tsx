import { Suspense } from "react"
import { LeadDetailView } from "@/components/crm/lead-detail-view"

export const dynamic = "force-dynamic"

/**
 * Detalhe do lead CS — espelho de /admin/comercial/leads/[id]/page.
 *
 * LeadDetailView e scope-agnostico (recebe leadId e busca scope/category
 * do lead via API). Em CS exibe alem dos dados normais o vinculo com
 * client_stores via store_id e a categoria (health_alert, etc.).
 */
export default async function CsLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <Suspense fallback={null}>
      <LeadDetailView leadId={id} />
    </Suspense>
  )
}
