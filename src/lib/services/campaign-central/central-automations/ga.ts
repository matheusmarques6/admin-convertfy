/**
 * Handler Google Analytics — dispara quando o card entra em "Enviada".
 *
 * Registra um evento de "campanha enviada" no GA (Measurement Protocol) pra
 * atribuição/relatório.
 *
 * FASE 3 = STUB: monta o request_payload que SERIA enviado pro Measurement
 * Protocol (`POST /mp/collect`) e retorna status='stub' (sem HTTP).
 * FASE 4: troca o corpo de `run` por fetch real. A assinatura NÃO muda.
 */

import type {
  AutomationContext,
  AutomationHandler,
  AutomationRunResult,
} from "@/types/campaign-automation"

export const gaHandler: AutomationHandler = {
  integration: "ga",

  matches(toColumn) {
    return toColumn === "enviada"
  },

  async run(ctx: AutomationContext): Promise<AutomationRunResult> {
    // Payload realista pro Measurement Protocol (GA4).
    const requestPayload = {
      endpoint:
        "POST https://www.google-analytics.com/mp/collect?measurement_id={GA_MEASUREMENT_ID}&api_secret={GA_API_SECRET}",
      measurement_id: process.env.GA_MEASUREMENT_ID ?? "{GA_MEASUREMENT_ID}",
      body: {
        // Pseudo client_id estável por campanha (sem PII).
        client_id: ctx.suggestionId ?? ctx.pipelineItemId ?? "campaign-central",
        events: [
          {
            name: "campaign_sent",
            params: {
              campaign_title: ctx.title,
              campaign_subject: ctx.subject ?? undefined,
              send_date: ctx.sendDate ?? undefined,
              store_count: ctx.stores.length,
              suggestion_id: ctx.suggestionId ?? undefined,
              pipeline_item_id: ctx.pipelineItemId ?? undefined,
            },
          },
        ],
      },
    }

    return { status: "stub", requestPayload }
  },
}
