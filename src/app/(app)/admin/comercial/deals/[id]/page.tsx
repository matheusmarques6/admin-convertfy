import { redirect } from "next/navigation"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { ROUTES } from "@/lib/routes"

export default async function SalesDealRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const sb = await createClient()
  const { data: auth } = await sb.auth.getUser()
  if (!auth?.user) redirect(ROUTES.LOGIN)

  const admin = createAdminClient()
  // Tipo do supabase trata o join `!inner` como array; aqui sabemos que
  // existe no maximo um pipeline por deal, mas precisamos refletir o
  // shape do retorno (pipeline pode vir como array ou objeto).
  type DealRow = {
    pipeline_id: string
    pipeline: { scope: string | null } | { scope: string | null }[] | null
  }
  const { data: deal } = await admin
    .from("deals")
    .select("pipeline_id, pipeline:pipelines!inner(scope)")
    .eq("id", id)
    .single<DealRow>()

  if (!deal) redirect(ROUTES.ADMIN.COMERCIAL.PIPELINES)

  const pipeline = Array.isArray(deal.pipeline) ? deal.pipeline[0] : deal.pipeline
  const scope = pipeline?.scope
  const path =
    scope === "cs"
      ? ROUTES.ADMIN.OPERACIONAL.PIPELINE_DETAIL(deal.pipeline_id)
      : ROUTES.ADMIN.COMERCIAL.PIPELINE_DETAIL(deal.pipeline_id)

  redirect(`${path}?deal=${id}`)
}
