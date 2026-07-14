import { CustomerSuccessShell } from "@/components/cs-painel/customer-success-shell"

export const dynamic = "force-dynamic"

/**
 * /admin/operacional/cs — modulo Customer Success (shell de abas).
 * Abas Painel e Pipelines CS implementadas; Formularios e Cadencias
 * serao migradas pagina por pagina do prototipo Figma Make.
 */
export default function CustomerSuccessPage() {
  return <CustomerSuccessShell />
}
