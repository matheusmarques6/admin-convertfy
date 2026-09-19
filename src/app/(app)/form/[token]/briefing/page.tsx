import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

/**
 * Pagina /form/[token]/briefing foi unificada com /form/[token] como wizard
 * multi-step. Esta pagina passou a ser apenas um redirect pra preservar
 * URLs antigas que ja foram compartilhadas.
 */
export default async function FormBriefingPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  redirect(`/form/${token}?step=review`)
}
