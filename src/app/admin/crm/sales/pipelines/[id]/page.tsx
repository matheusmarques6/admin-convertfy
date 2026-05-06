import { PipelineBoardView } from "@/components/crm/pipeline-board-view"

export default async function SalesPipelineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <PipelineBoardView pipelineId={id} scope="sales" />
}
