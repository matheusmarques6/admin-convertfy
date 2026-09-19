import type { Metadata } from "next"
import { CampaignPipelineBoard } from "@/components/campaigns/campaign-pipeline-board"

export const metadata: Metadata = {
  title: "Pipeline de Campanhas",
}

export default function CampaignPipelinePage() {
  return (
    <div className="-m-4 md:-m-6 lg:-m-8 h-[calc(100vh-1rem)] md:h-[calc(100vh-1.5rem)] lg:h-[calc(100vh-2rem)]">
      <CampaignPipelineBoard />
    </div>
  )
}
