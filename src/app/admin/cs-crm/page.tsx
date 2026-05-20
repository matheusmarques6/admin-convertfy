import { redirect } from "next/navigation"

/** Redirect de compat: URL canonica eh /admin/operacional/cs-crm. */
export default function CSCrmLegacyRedirect() {
  redirect("/admin/operacional/cs-crm")
}
