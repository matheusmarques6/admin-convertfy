import type { Metadata } from "next"
import { FormTela1Client } from "@/components/onboarding-v2/form-tela1-client"

export const metadata: Metadata = {
  title: "Formulário de Onboarding · Convertfy",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function FormPublicPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <FormTela1Client token={token} />
}
