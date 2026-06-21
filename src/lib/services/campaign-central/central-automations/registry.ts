/**
 * Registry de handlers de automação por transição de coluna (Fase 3).
 *
 * O motor (central-automation.service.ts) consulta esta lista: para cada
 * handler cujo `matches(toColumn)` é true, grava 1 linha em
 * campaign_automation_runs e dispara o efeito.
 *
 * Mapa coluna→integração (1:1 hoje, mas a interface permite N handlers por
 * coluna):
 *   aprovada → clickup   (cria task de copy)
 *   design   → slack     (notifica fila de design)
 *   agendada → omnisend  (agenda a campanha de email)
 *   enviada  → ga        (registra evento de envio)
 *
 * Plugar um novo handler = adicionar à lista. Trocar stub→HTTP real (Fase 4)
 * = editar o `run` do handler, sem tocar aqui nem na tabela.
 */

import type { BoardColumnKey } from "@/lib/services/campaign-central/board-mapping"
import type { AutomationHandler } from "@/types/campaign-automation"
import { clickupHandler } from "./clickup"
import { slackHandler } from "./slack"
import { omnisendHandler } from "./omnisend"
import { gaHandler } from "./ga"

/** Todos os handlers registrados, na ordem do fluxo do board. */
export const AUTOMATION_HANDLERS: AutomationHandler[] = [
  clickupHandler,
  slackHandler,
  omnisendHandler,
  gaHandler,
]

/** Handlers cujo `matches(toColumn)` é true para a coluna de destino. */
export function handlersForColumn(toColumn: BoardColumnKey): AutomationHandler[] {
  return AUTOMATION_HANDLERS.filter((h) => h.matches(toColumn))
}
