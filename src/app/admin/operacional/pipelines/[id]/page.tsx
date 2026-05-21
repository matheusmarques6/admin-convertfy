import { Suspense } from "react"
import { PipelineBoardView } from "@/components/crm/pipeline-board-view"
import { CsPipelineActions } from "@/components/crm/cs-pipeline-actions"

export default async function CsPipelineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <CsPipelineActions pipelineId={id} />
      <div className="flex-1 min-h-0 overflow-hidden">
        <Suspense fallback={null}>
          <PipelineBoardView pipelineId={id} scope="cs" />
        </Suspense>
      </div>
    </div>
  )
}
