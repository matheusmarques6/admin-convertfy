import type { Metadata } from "next"
import { OperationalBoard } from "@/components/operational/operational-board"

interface Props {
  params: Promise<{ slug: string }>
}

const SLUG_TITLES: Record<string, string> = {
  onboarding: "Onboarding Ops",
  acompanhamento: "Acompanhamento",
  feedback: "Feedback",
  suporte: "Suporte",
}

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { slug } = await params
  return {
    title: SLUG_TITLES[slug] ?? "Pipeline operacional",
  }
}

export default async function OperationalPipelinePage({ params }: Props) {
  const { slug } = await params
  return (
    <div className="-m-4 md:-m-6 lg:-m-8 h-[calc(100vh-1rem)] md:h-[calc(100vh-1.5rem)] lg:h-[calc(100vh-2rem)]">
      <OperationalBoard pipelineSlug={slug} />
    </div>
  )
}
