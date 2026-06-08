/**
 * /admin/components — Biblioteca de componentes do Component Assembler.
 * As variantes catalogadas aqui são o acervo que o agente escolhe por bloco.
 */
import { ComponentsWorkspace } from "@/components/email-components/components-workspace"

export const dynamic = "force-dynamic"

export default function ComponentsPage() {
  return <ComponentsWorkspace />
}
