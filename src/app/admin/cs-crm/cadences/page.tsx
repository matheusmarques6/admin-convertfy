import { redirect } from "next/navigation"

/** Redirect de compat: URL canonica eh /admin/operacional/cs-crm/cadences. */
export default function CadencesLegacyRedirect() {
  redirect("/admin/operacional/cs-crm/cadences")
}
