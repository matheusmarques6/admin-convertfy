/**
 * Envia mensagem WhatsApp ao avancar onboarding pra proxima coluna.
 * Le whatsapp_template da coluna, substitui {{vars}} e despacha via
 * crm_channels (canal WhatsApp default da org). Cria/atualiza thread
 * no inbox CRM pra rastrear conversa.
 *
 * Falha silenciosa (log) pra nao bloquear avanço se template/canal/phone
 * ausente.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { sendWhatsAppMessage } from "@/lib/services/whatsapp-cloud.service"
import { logger } from "@/lib/logger"

const log = logger.child("OnboardingWhatsApp")

const PLATFORM_LABEL: Record<string, string> = {
  klaviyo: "Klaviyo",
  omnisend: "Omnisend",
  mailchimp: "Mailchimp",
  activecampaign: "ActiveCampaign",
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  other: "sua plataforma de email",
}

interface Vars {
  client_name: string
  store_name: string
  platform_name: string
  form_url: string
  tutorial_url: string
  briefing_url: string
  /** URL do Figma do preview (deliverable figma_link da coluna preview_producao) */
  figma_link: string
  /** URL do Figma completo (deliverable figma_full_link da coluna emails_finais) */
  figma_full_link: string
}

function render(tpl: string, v: Vars): string {
  const dict = v as unknown as Record<string, string>
  return tpl.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_, k) => {
    return dict[k] ?? `{{${k}}}`
  })
}

function buildVars(
  onb: {
    form_token: string
    tutorial_token: string | null
  },
  client: { name: string | null; phone: string | null } | null,
  store: { store_name: string | null; platform: string | null } | null,
  baseUrl: string,
  deliverables: Array<{ field_slug: string; value: string | null; file_url: string | null }> = [],
): Vars {
  const figmaLink =
    deliverables.find((d) => d.field_slug === "figma_link")?.value ??
    deliverables.find((d) => d.field_slug === "figma_link")?.file_url ??
    ""
  const figmaFullLink =
    deliverables.find((d) => d.field_slug === "figma_full_link")?.value ??
    deliverables.find((d) => d.field_slug === "figma_full_link")?.file_url ??
    ""
  return {
    client_name: client?.name ?? "cliente",
    store_name: store?.store_name ?? "sua loja",
    platform_name:
      PLATFORM_LABEL[(store?.platform ?? "other").toLowerCase()] ??
      "sua plataforma",
    form_url: `${baseUrl}/form/${onb.form_token}`,
    tutorial_url: onb.tutorial_token
      ? `${baseUrl}/onboarding-help/${onb.tutorial_token}`
      : "",
    briefing_url: `${baseUrl}/form/${onb.form_token}/briefing`,
    figma_link: figmaLink,
    figma_full_link: figmaFullLink,
  }
}

function sanitizePhone(p: string | null | undefined): string | null {
  if (!p) return null
  const d = p.replace(/\D/g, "")
  if (d.length < 10) return null
  // BR sem DDI -> prefixa 55
  if (d.length === 10 || d.length === 11) return `55${d}`
  return d
}

export async function sendColumnWhatsApp(params: {
  onboardingId: string
  columnId: string
}): Promise<{ ok: boolean; reason?: string }> {
  const admin = createAdminClient()
  try {
    const { data: col } = await admin
      .from("operational_pipeline_columns")
      .select("whatsapp_template, name")
      .eq("id", params.columnId)
      .maybeSingle()
    if (!col?.whatsapp_template) return { ok: false, reason: "no_template" }

    const { data: onb } = await admin
      .from("onboardings")
      .select(
        `id, org_id, form_token, tutorial_token,
         client:clients(id, name, phone),
         store:client_stores(id, store_name, platform)`,
      )
      .eq("id", params.onboardingId)
      .maybeSingle()
    if (!onb) return { ok: false, reason: "no_onboarding" }

    const client = (
      Array.isArray(onb.client) ? onb.client[0] : onb.client
    ) as { name: string | null; phone: string | null } | null
    const store = (
      Array.isArray(onb.store) ? onb.store[0] : onb.store
    ) as { store_name: string | null; platform: string | null } | null

    const phone = sanitizePhone(client?.phone)
    if (!phone) return { ok: false, reason: "no_phone" }

    // Pega deliverables ja preenchidos do onboarding pra substituir vars
    // como {{figma_link}} e {{figma_full_link}}
    const { data: tasks } = await admin
      .from("tasks")
      .select("id")
      .eq("onboarding_id", params.onboardingId)
    const taskIds = (tasks ?? []).map((t) => t.id as string)
    const { data: deliverables } = taskIds.length
      ? await admin
          .from("task_deliverables")
          .select("field_slug, value, file_url")
          .in("task_id", taskIds)
      : { data: [] }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://admin.convertfy.com"
    const body = render(
      col.whatsapp_template,
      buildVars(onb, client, store, baseUrl, deliverables ?? []),
    )

    // Canal WhatsApp default da org (primeiro ativo)
    const { data: channel } = await admin
      .from("crm_channels")
      .select("id, config, external_id")
      .eq("org_id", onb.org_id)
      .eq("type", "whatsapp")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!channel?.config) return { ok: false, reason: "no_channel" }

    const config = channel.config as {
      phone_number_id?: string
      access_token?: string
      business_account_id?: string
    }
    if (!config.phone_number_id || !config.access_token)
      return { ok: false, reason: "channel_missing_creds" }

    const result = await sendWhatsAppMessage(
      {
        phone_number_id: config.phone_number_id,
        access_token: config.access_token,
        business_account_id: config.business_account_id,
      },
      { to: phone, type: "text", text: { body } },
    )

    if (!result.success) {
      log.error("send failed", { onb: onb.id, err: result.error })
      return { ok: false, reason: "send_failed" }
    }

    // Upsert thread + insert message no inbox CRM
    const { data: thread } = await admin
      .from("crm_threads")
      .upsert(
        {
          org_id: onb.org_id,
          channel_id: channel.id,
          contact_external_id: phone,
          contact_name: client?.name ?? null,
          status: "open",
          last_message_at: new Date().toISOString(),
        },
        { onConflict: "channel_id,contact_external_id" },
      )
      .select("id")
      .single()

    if (thread?.id) {
      await admin.from("crm_messages").insert({
        org_id: onb.org_id,
        thread_id: thread.id,
        direction: "outbound",
        content_type: "text",
        body,
        external_id: result.message_id ?? null,
        status: "sent",
        sent_by_kind: "system",
        metadata: { source: "onboarding_auto", onboarding_id: onb.id },
      })
    }

    return { ok: true }
  } catch (e) {
    log.error("unexpected", e)
    return { ok: false, reason: "exception" }
  }
}
