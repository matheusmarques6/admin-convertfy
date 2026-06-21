/**
 * Handler Omnisend — dispara quando o card entra em "Agendada".
 *
 * Cria/agenda a campanha de email no Omnisend pra cada loja-alvo.
 *
 * FASE 3 = STUB: monta o request_payload que SERIA enviado pra a REST API
 * do Omnisend (`POST /v5/campaigns`) e retorna status='stub' (sem HTTP).
 * FASE 4: troca o corpo de `run` por chamada real (REST/MCP), grava o
 * campaign_id retornado em external_ref e em `omnisend_campaign_ids` do
 * pipeline_item. A assinatura NÃO muda.
 */

import type {
  AutomationContext,
  AutomationHandler,
  AutomationRunResult,
} from "@/types/campaign-automation"

export const omnisendHandler: AutomationHandler = {
  integration: "omnisend",

  matches(toColumn) {
    return toColumn === "agendada"
  },

  async run(ctx: AutomationContext): Promise<AutomationRunResult> {
    // Payload realista pro endpoint de criação de campanha do Omnisend.
    // Uma campanha por loja-alvo (cada loja tem sua conta/lista no Omnisend).
    const requestPayload = {
      endpoint: "POST https://api.omnisend.com/v5/campaigns",
      // Na Fase 4 isto vira N chamadas (1 por loja); o stub registra a
      // intenção completa pra inspeção.
      campaigns: ctx.stores.map((s) => ({
        store_id: s.store_id,
        name: `${ctx.title} — ${s.store_name}`,
        subject: ctx.subject ?? ctx.title,
        type: "email",
        sendAt: ctx.sendDate,
        // Liga a campanha de volta ao card.
        meta: {
          suggestion_id: ctx.suggestionId,
          pipeline_item_id: ctx.pipelineItemId,
        },
      })),
    }

    return { status: "stub", requestPayload }
  },
}
