import { redirect } from "next/navigation"

/** Redirect de compat: URL canonica eh /admin/operacional/cs-crm/calls. */
export default function CallsLegacyRedirect() {
  redirect("/admin/operacional/cs-crm/calls")
}
