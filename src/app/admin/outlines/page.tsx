/**
 * /admin/outlines — Estrutura geral (input do Component Assembler).
 * Camada de alto nível por (flow_type × email) que a IA expande no
 * blueprint detalhado de cada loja.
 */
import { OutlinesWorkspace } from "@/components/email-outlines/outlines-workspace"

export const dynamic = "force-dynamic"

export default function OutlinesPage() {
  return <OutlinesWorkspace />
}
