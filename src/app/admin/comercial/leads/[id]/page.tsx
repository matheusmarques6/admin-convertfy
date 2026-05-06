import { redirect } from "next/navigation"
import { ROUTES } from "@/lib/routes"

export default async function SalesLeadRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`${ROUTES.ADMIN.COMERCIAL.LEADS}?lead=${id}`)
}
