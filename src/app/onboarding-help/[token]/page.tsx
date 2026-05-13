import type { Metadata } from "next"
import { PublicTutorialRenderer } from "@/components/onboarding-v2/public-tutorial-renderer"

export const metadata: Metadata = {
  title: "Tutorial · Convertfy",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function PublicTutorialPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <PublicTutorialRenderer token={token} />
}
