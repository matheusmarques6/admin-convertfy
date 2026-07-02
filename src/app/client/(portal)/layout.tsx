import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { PortalShell } from "@/components/portal/portal-shell"

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    redirect("/client/login")
  }

  const admin = createAdminClient()
  const { data: portalUser } = await admin
    .from("client_portal_users")
    .select(
      "id, name, email, avatar_url, client_id, is_active, must_change_password, client:clients(name, company)"
    )
    .eq("auth_user_id", authUser.id)
    .single()

  if (!portalUser || !portalUser.is_active) {
    redirect("/client/login")
  }

  if (portalUser.must_change_password) {
    redirect("/client/change-password")
  }

  const client = portalUser.client as unknown as {
    name: string | null
    company: string | null
  } | null

  return (
    <PortalShell
      user={{
        name: portalUser.name,
        email: portalUser.email,
        clientName: client?.name || client?.company || "",
        avatar_url: portalUser.avatar_url || null,
      }}
    >
      {children}
    </PortalShell>
  )
}
