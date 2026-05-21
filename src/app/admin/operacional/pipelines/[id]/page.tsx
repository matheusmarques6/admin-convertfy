import { Suspense } from "react"
import { PipelineBoardView } from "@/components/crm/pipeline-board-view"
import { CsPipelineAutoSync } from "@/components/crm/cs-pipeline-auto-sync"

export default async function CsPipelineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <Suspense fallback={null}>
      {/* Auto-sync silencioso pros pipelines CS canonicos (ex: Gestao
          de Carteira). Sem output visual — popula o pipeline em
          background na primeira vez que esta vazio. */}
      <CsPipelineAutoSync pipelineId={id} />
      <PipelineBoardView pipelineId={id} scope="cs" />
    </Suspense>
  )
}
