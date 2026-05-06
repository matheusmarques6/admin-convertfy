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
  const { data: deal } = await admin
    .from("deals")
    .select("pipeline_id, pipeline:pipelines!inner(scope)")
    .eq("id", id)
    .single()

  if (!deal) redirect(ROUTES.ADMIN.CRM.SALES.PIPELINES)

  const scope = (deal as any).pipeline?.scope
  const path =
    scope === "cs"
      ? ROUTES.ADMIN.CRM.CS.PIPELINE_DETAIL(deal.pipeline_id)
      : ROUTES.ADMIN.CRM.SALES.PIPELINE_DETAIL(deal.pipeline_id)

  redirect(`${path}?deal=${id}`)
}
