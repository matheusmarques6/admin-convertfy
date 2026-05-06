import { Suspense } from "react"
import { PipelineBoardView } from "@/components/crm/pipeline-board-view"

export default async function SalesPipelineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <Suspense fallback={null}>
      <PipelineBoardView pipelineId={id} scope="sales" />
    </Suspense>
  )
}
