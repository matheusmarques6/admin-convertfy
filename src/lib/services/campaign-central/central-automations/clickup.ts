/**
 * Handler ClickUp — dispara quando o card entra em "Aprovada".
 *
 * Cria uma task no ClickUp pra o time de copy assumir a campanha.
 *
 * FASE 3 = STUB: monta o request_payload que SERIA enviado pra
 * `POST /api/v2/list/{list_id}/task` e retorna status='stub' (sem HTTP).
 * FASE 4: troca o corpo de `run` por fetch real + grava o task id em
 * external_ref. A assinatura NÃO muda.
 */

import type {
  AutomationContext,
  AutomationHandler,
  AutomationRunResult,
} from "@/types/campaign-automation"

export const clickupHandler: AutomationHandler = {
  integration: "clickup",

  matches(toColumn) {
    return toColumn === "aprovada"
  },

  async run(ctx: AutomationContext): Promise<AutomationRunResult> {
    // Payload realista pro endpoint de criação de task do ClickUp.
    const requestPayload = {
      endpoint: "POST /api/v2/list/{list_id}/task",
      list_id: process.env.CLICKUP_LIST_ID ?? "{CLICKUP_LIST_ID}",
      task: {
        name: `Copy: ${ctx.title}`,
        description: [
          `Campanha aprovada na Central de Campanhas.`,
          ctx.subject ? `Assunto: ${ctx.subject}` : null,
          ctx.sendDate ? `Envio previsto: ${ctx.sendDate}` : null,
          ctx.stores.length > 0
            ? `Lojas: ${ctx.stores.map((s) => s.store_name).join(", ")}`
            : null,
        ]
          .filter(Boolean)
          .join("\n"),
        tags: ["campaign-central", "copy"],
        // Liga a task de volta ao card pra rastreio na Fase 4.
        custom_fields: [
          { name: "suggestion_id", value: ctx.suggestionId },
          { name: "pipeline_item_id", value: ctx.pipelineItemId },
        ],
      },
    }

    return { status: "stub", requestPayload }
  },
}
