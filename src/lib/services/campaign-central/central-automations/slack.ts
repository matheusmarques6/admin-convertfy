/**
 * Handler Slack — dispara quando o card entra em "Design".
 *
 * Notifica o canal do time de design que a campanha está na fila.
 *
 * FASE 3 = STUB: monta o request_payload que SERIA postado no incoming
 * webhook do Slack e retorna status='stub' (sem HTTP).
 * FASE 4: troca o corpo de `run` por fetch real pro webhook. A assinatura
 * NÃO muda.
 */

import type {
  AutomationContext,
  AutomationHandler,
  AutomationRunResult,
} from "@/types/campaign-automation"

export const slackHandler: AutomationHandler = {
  integration: "slack",

  matches(toColumn) {
    return toColumn === "design"
  },

  async run(ctx: AutomationContext): Promise<AutomationRunResult> {
    const storesLabel =
      ctx.stores.length > 0
        ? ctx.stores.map((s) => s.store_name).join(", ")
        : "—"

    // Payload realista pro incoming webhook do Slack (blocks API).
    const requestPayload = {
      endpoint: "POST {SLACK_INCOMING_WEBHOOK_URL}",
      webhook_url: process.env.SLACK_WEBHOOK_URL ?? "{SLACK_WEBHOOK_URL}",
      body: {
        text: `🎨 Nova campanha na fila de design: *${ctx.title}*`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `🎨 *${ctx.title}* entrou na fila de design.`,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: [
                  ctx.subject ? `Assunto: ${ctx.subject}` : null,
                  ctx.sendDate ? `Envio: ${ctx.sendDate}` : null,
                  `Lojas: ${storesLabel}`,
                ]
                  .filter(Boolean)
                  .join("  ·  "),
              },
            ],
          },
        ],
      },
    }

    return { status: "stub", requestPayload }
  },
}
