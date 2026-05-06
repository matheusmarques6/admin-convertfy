import { redirect } from "next/navigation"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { ROUTES } from "@/lib/routes"

export default async function CsDealRedirect({
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
    .select("pipeline_id")
    .eq("id", id)
    .single()

  if (!deal) redirect(ROUTES.ADMIN.CRM.CS.PIPELINES)

  redirect(`${ROUTES.ADMIN.CRM.CS.PIPELINE_DETAIL(deal.pipeline_id)}?deal=${id}`)
}
