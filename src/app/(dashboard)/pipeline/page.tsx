import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { PipelineBoard } from "@/components/pipeline/pipeline-board"
import { PipelineHeader } from "@/components/pipeline/pipeline-header"
import { Skeleton } from "@/components/ui/skeleton"

export const dynamic = "force-dynamic"

async function getPipelineData() {
  const supabase = await createClient()

  // Fetch pipelines
  const { data: pipelines } = await supabase
    .from("pipelines")
    .select("*")
    .order("created_at", { ascending: true })

  // Get default or first pipeline
  const defaultPipeline = pipelines?.find((p) => p.is_default) || pipelines?.[0]

  if (!defaultPipeline) {
    return { pipelines: pipelines || [], pipeline: null, stages: [], deals: [] }
  }

  // Fetch stages
  const { data: stages } = await supabase
    .from("pipeline_stages")
    .select("*")
    .eq("pipeline_id", defaultPipeline.id)
    .order("order", { ascending: true })

  // Fetch deals with client info
  const { data: deals } = await supabase
    .from("deals")
    .select(`
      *,
      client:clients (
        id,
        name,
        email,
        company
      ),
      owner:profiles!deals_owner_id_fkey (
        id,
        name,
        avatar_url
      )
    `)
    .eq("pipeline_id", defaultPipeline.id)
    .order("created_at", { ascending: false })

  return {
    pipelines: pipelines || [],
    pipeline: defaultPipeline,
    stages: stages || [],
    deals: deals || [],
  }
}

function BoardSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} className="h-[500px] w-[300px] flex-shrink-0" />
      ))}
    </div>
  )
}

export default async function PipelinePage() {
  const data = await getPipelineData()

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <PipelineHeader
        pipelines={data.pipelines}
        currentPipeline={data.pipeline}
      />

      {/* Kanban Board */}
      <div className="flex-1 min-h-0">
        <Suspense fallback={<BoardSkeleton />}>
          <PipelineBoard
            stages={data.stages}
            deals={data.deals}
            pipelineId={data.pipeline?.id}
          />
        </Suspense>
      </div>
    </div>
  )
}
