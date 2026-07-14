import { CustomerSuccessShell } from "@/components/cs-painel/customer-success-shell"
import { Painel } from "@/components/cs-painel/painel"

export const dynamic = "force-dynamic"

/**
 * /admin/operacional/cs — modulo Customer Success (shell de abas).
 * Aba default: Painel. As demais (Pipelines · Formularios · Cadencias)
 * serao migradas pagina por pagina do prototipo Figma Make.
 */
export default function CustomerSuccessPage() {
  return (
    <CustomerSuccessShell>
      <Painel />
    </CustomerSuccessShell>
  )
}
