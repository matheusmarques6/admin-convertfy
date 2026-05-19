/**
 * Onboarding Email Service
 *
 * Emails transacionais relacionados ao processo de onboarding:
 *  - Etapa 7 (Sucesso): "Conta ativa" pro cliente quando onboarding
 *    avança pra coluna terminal.
 *
 * Usa o EmailService genérico (Resend) já configurado.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { emailService } from "@/lib/email/email.service"
import { logger } from "@/lib/logger"

const log = logger.child("OnboardingEmailService")

interface OnboardingEmailCtx {
  clientName: string
  clientEmail: string | null
  storeName: string
  csName: string | null
  csEmail: string | null
}

async function loadOnboardingEmailContext(
  onboardingId: string,
): Promise<OnboardingEmailCtx | null> {
  const admin = createAdminClient()
  const { data: onbRaw } = await admin
    .from("onboardings")
    .select(
      "id, client:clients!onboardings_client_id_fkey(id, name, email, owner:profiles!clients_owner_id_fkey(name, email)), " +
        "store:client_stores(store_name)",
    )
    .eq("id", onboardingId)
    .maybeSingle()

  if (!onbRaw) return null
  const onb = onbRaw as unknown as {
    client:
      | {
          name: string
          email: string | null
          owner: { name: string; email: string } | null
        }
      | { name: string; email: string | null; owner: { name: string; email: string } | null }[]
      | null
    store: { store_name: string } | { store_name: string }[] | null
  }
  const client = Array.isArray(onb.client) ? onb.client[0] : onb.client
  const store = Array.isArray(onb.store) ? onb.store[0] : onb.store
  if (!client) return null

  return {
    clientName: client.name,
    clientEmail: client.email,
    storeName: store?.store_name ?? "—",
    csName: client.owner?.name ?? null,
    csEmail: client.owner?.email ?? null,
  }
}

function accountActiveHtml(ctx: OnboardingEmailCtx): string {
  const greeting = ctx.clientName.split(" ")[0]
  const csSignature = ctx.csName ?? "Equipe Convertfy"

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Sua conta está ativa</title>
</head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Inter,Helvetica,Arial,sans-serif;color:#111827;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <span style="display:inline-block;background:#2137B6;color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:4px 10px;border-radius:3px;">Convertfy</span>
    </div>

    <div style="background:#fff;border-radius:8px;padding:32px 28px;border:1px solid rgba(0,0,0,0.06);">
      <h1 style="font-size:22px;font-weight:700;margin:0 0 16px;line-height:1.3;">
        ${greeting}, sua conta está oficialmente ativa
      </h1>

      <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px;">
        A operação de email marketing da <strong>${ctx.storeName}</strong> está rodando.
        Configuramos os 7 emails do welcome flow, automações de carrinho/checkout,
        pós-compra, winback e popup de captura no site.
      </p>

      <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px;">
        A partir de hoje você entra no nosso ciclo de acompanhamento semanal.
        Toda sexta-feira nossa equipe analisa a saúde da sua loja e você recebe
        feedback estratégico via WhatsApp.
      </p>

      <div style="background:#F3E8FF;border-left:3px solid #7C3AED;padding:14px 16px;margin:20px 0;border-radius:4px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#7E22CE;letter-spacing:0.6px;margin-bottom:6px;">
          Próxima call
        </div>
        <div style="font-size:13px;color:#374151;">
          Sua primeira call de alinhamento será agendada nos próximos 30 dias.
          Vamos revisar performance e ajustar a estratégia.
        </div>
      </div>

      <p style="font-size:14px;line-height:1.6;color:#374151;margin:24px 0 0;">
        Qualquer dúvida, é só responder este email ou falar com a gente no WhatsApp.
      </p>

      <p style="font-size:14px;line-height:1.6;color:#374151;margin:16px 0 0;">
        Um abraço,<br />
        <strong>${csSignature}</strong>
      </p>
    </div>

    <div style="text-align:center;margin-top:24px;font-size:11px;color:#9CA3AF;">
      Você está recebendo este email porque ativou sua conta Convertfy.
    </div>
  </div>
</body>
</html>`
}

export async function sendAccountActiveEmail(onboardingId: string): Promise<void> {
  try {
    const ctx = await loadOnboardingEmailContext(onboardingId)
    if (!ctx) {
      log.warn("Contexto não encontrado pra email Etapa 7", { onboardingId })
      return
    }
    if (!ctx.clientEmail) {
      log.warn("Cliente sem email — pulando envio", { onboardingId })
      return
    }

    const html = accountActiveHtml(ctx)
    const result = await emailService.send({
      to: ctx.clientEmail,
      subject: `${ctx.storeName} · Sua conta Convertfy está ativa`,
      html,
      replyTo: ctx.csEmail ?? undefined,
    })

    log.info("[Etapa 7] Email 'Conta ativa' enviado", {
      onboardingId,
      to: ctx.clientEmail,
      messageId: result.id,
    })
  } catch (e) {
    log.error("Falha ao enviar email Etapa 7", e)
    // Nao re-throw — falha de email nao deve bloquear avanço do onboarding
  }
}
