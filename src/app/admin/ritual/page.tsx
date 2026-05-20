import { redirect } from "next/navigation"

/** Redirect de compat: URL canonica eh /admin/operacional/ritual. */
export default function RitualLegacyRedirect() {
  redirect("/admin/operacional/ritual")
}
