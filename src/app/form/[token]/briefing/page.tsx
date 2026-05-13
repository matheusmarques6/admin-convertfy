import type { Metadata } from "next"
import { FormTela2Client } from "@/components/onboarding-v2/form-tela2-client"

export const metadata: Metadata = {
  title: "Confirmação do Briefing · Convertfy",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function FormBriefingPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <FormTela2Client token={token} />
}
