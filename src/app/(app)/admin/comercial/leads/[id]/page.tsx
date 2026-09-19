import { Suspense } from "react"
import { LeadDetailView } from "@/components/crm/lead-detail-view"

export const dynamic = "force-dynamic"

export default async function SalesLeadDetailPage({
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
