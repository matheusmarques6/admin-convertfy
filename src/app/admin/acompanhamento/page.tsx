import { redirect } from "next/navigation"

/** Redirect de compat: URL canonica eh /admin/operacional/acompanhamento. */
export default function AcompanhamentoLegacyRedirect() {
  redirect("/admin/operacional/acompanhamento")
}
