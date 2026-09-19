import { redirect } from "next/navigation"
import { getPortalUser } from "@/lib/services/portal-auth.service"
import { PortalShell } from "@/components/portal/portal-shell"

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const portalUser = await getPortalUser()

  if (!portalUser || !portalUser.is_active) {
    redirect("/client/login")
  }

  if (portalUser.must_change_password) {
    redirect("/client/change-password")
  }

  return (
    <PortalShell
      user={{
        name: portalUser.name,
        email: portalUser.email,
        clientName: portalUser.clientName,
        avatar_url: portalUser.avatar_url,
      }}
    >
      {children}
    </PortalShell>
  )
}
