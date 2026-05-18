import { Suspense } from "react"
import { DealDetailView } from "@/components/crm/deal-detail-view"

export const dynamic = "force-dynamic"

export default async function SalesDealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <Suspense fallback={null}>
      <DealDetailView dealId={id} />
    </Suspense>
  )
}
