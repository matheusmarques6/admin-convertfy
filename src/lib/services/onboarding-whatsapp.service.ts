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
import { sendTextViaChannel } from "@/lib/services/whatsapp-channel-send.service"
import { logger } from "@/lib/logger"
import { buildBriefingUrl, buildFormUrl } from "@/lib/utils/form-url"

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

export interface Vars {
  client_name: string
  store_name: string
  platform_name: string
  form_url: string
  /**
   * Nome CANONICO: e o que os templates usam (`{{tutorial_link}}`), o que esta
   * gravado em `operational_pipeline_columns` e o `field_slug` do deliverable.
   * Chamava-se `tutorial_url` ate 15/09/2026 — nao casava com nenhum template,
   * entao `{{tutorial_link}}` chegou CRU a cinco clientes.
   */
  tutorial_link: string
  briefing_url: string
  /** URL do Figma do preview (deliverable figma_link da coluna preview_producao) */
  figma_link: string
  /** URL do Figma completo (deliverable figma_full_link da coluna emails_finais) */
  figma_full_link: string
}

/**
 * Troca `{{var}}` pelo valor e DIZ o que nao resolveu.
 *
 * Duas formas de faltar, e as duas chegavam ao cliente:
 *  - chave que nao existe em Vars -> voltava o `{{nome}}` cru;
 *  - chave que existe e esta vazia -> virava string vazia ("Figma:" orfao).
 *
 * Quem decide o que fazer com `faltando` e o chamador. `sendColumnWhatsApp`
 * nao envia: metade de uma mensagem e pior que mensagem nenhuma, e depois de
 * enviada nao se desfaz.
 */
export function render(
  tpl: string,
  v: Vars,
): { texto: string; faltando: string[] } {
  const dict = v as unknown as Record<string, string>
  const faltando = new Set<string>()
  const texto = tpl.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_, k: string) => {
    const valor = dict[k]
    if (valor === undefined) {
      faltando.add(k)
      return `{{${k}}}`
    }
    if (valor.trim() === "") {
      faltando.add(k)
      return ""
    }
    return valor
  })
  return { texto, faltando: [...faltando] }
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
    form_url: buildFormUrl(onb.form_token, baseUrl),
    tutorial_link: onb.tutorial_token
      ? `${baseUrl}/onboarding-help/${onb.tutorial_token}`
      : "",
    briefing_url: buildBriefingUrl(onb.form_token, baseUrl),
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

/**
 * A mensagem de uma coluna para um onboarding, ja renderizada.
 *
 * Existe para que o PREVIEW e o ENVIO leiam a mesma coisa por construcao. Um
 * preview que remonta a mensagem por conta propria mostra na tela algo que
 * nao e o que sai — e o diagolo de autorizacao passa a mentir justamente no
 * ponto em que alguem confia nele para clicar.
 */
export interface ColumnMessage {
  orgId: string
  columnName: string | null
  columnSlug: string | null
  /** `null` = a coluna nao tem mensagem cadastrada. */
  template: string | null
  /** Vazio quando nao ha template. */
  texto: string
  /**
   * Os valores usados na renderizacao. O preview re-renderiza com eles para
   * marcar o que ainda sera criado — ver `marcadorDaVar`.
   */
  vars: Vars | null
  /** Variaveis que nao resolveram — ver `classificarPendencias`. */
  faltando: string[]
  /** Digitos com DDI, como o envio usa. `null` = cadastro sem telefone util. */
  phone: string | null
  clientName: string | null
}

export async function resolveColumnMessage(params: {
  onboardingId: string
  columnId: string
}): Promise<ColumnMessage | null> {
  const admin = createAdminClient()

  const { data: col } = await admin
    .from("operational_pipeline_columns")
    .select("whatsapp_template, name, slug")
    .eq("id", params.columnId)
    .maybeSingle()

  const { data: onb } = await admin
    .from("onboardings")
    .select(
      `id, org_id, form_token, tutorial_token,
       client:clients!onboardings_client_id_fkey(id, name, phone),
       store:client_stores(id, store_name, platform)`,
    )
    .eq("id", params.onboardingId)
    .maybeSingle()
  if (!onb) return null

  const client = (Array.isArray(onb.client) ? onb.client[0] : onb.client) as {
    name: string | null
    phone: string | null
  } | null
  const store = (Array.isArray(onb.store) ? onb.store[0] : onb.store) as {
    store_name: string | null
    platform: string | null
  } | null

  const base = {
    orgId: onb.org_id as string,
    columnName: (col?.name as string | null) ?? null,
    columnSlug: (col?.slug as string | null) ?? null,
    phone: sanitizePhone(client?.phone),
    clientName: client?.name ?? null,
  }

  const template = (col?.whatsapp_template as string | null) || null
  if (!template)
    return { ...base, template: null, texto: "", faltando: [], vars: null }

  // Deliverables ja preenchidos — e o que resolve {{figma_link}} e
  // {{figma_full_link}}.
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

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://admin.convertfy.com"
  const vars = buildVars(onb, client, store, baseUrl, deliverables ?? [])
  const { texto, faltando } = render(template, vars)

  return { ...base, template, texto, faltando, vars }
}

export interface SendColumnParams {
  onboardingId: string
  columnId: string
  /**
   * Quem autorizou o envio. Vem de `advanceColumn` (quem marcou o
   * interruptor); ausente, o evento sai como `system`. Inventar um ator
   * seria pior que não ter: o registro existe para responder "quem mandou".
   */
  actorId?: string | null
}

/**
 * O envio, e o RASTRO dele.
 *
 * O wrapper existe para que nenhum dos oito caminhos de saída escape do
 * registro — inclusive os `return` de guarda e o `catch`. Até 15/09/2026 o
 * `reason` era devolvido e ninguém o lia: a chamada é fire-and-forget e o
 * retorno morria ali. Dezesseis mensagens saíram sem deixar um evento nosso.
 */
export async function sendColumnWhatsApp(
  params: SendColumnParams,
): Promise<{ ok: boolean; reason?: string }> {
  const { resultado, msg } = await executarEnvio(params)
  await registrarEnvio(params, resultado, msg)
  return resultado
}

async function executarEnvio(params: SendColumnParams): Promise<{
  resultado: { ok: boolean; reason?: string }
  msg: ColumnMessage | null
}> {
  const admin = createAdminClient()
  let msg: ColumnMessage | null = null
  try {
    msg = await resolveColumnMessage(params)
    if (!msg) return { resultado: { ok: false, reason: "no_onboarding" }, msg }
    if (!msg.template)
      return { resultado: { ok: false, reason: "no_template" }, msg }
    if (!msg.phone) return { resultado: { ok: false, reason: "no_phone" }, msg }

    const onb = { id: params.onboardingId, org_id: msg.orgId }
    const phone = msg.phone
    const body = msg.texto

    // Variavel sem valor NAO vira mensagem. Ate 15/09/2026 virava: cinco
    // clientes receberam "{{tutorial_link}}" literal e seis mensagens sairam
    // com a linha "Figma:" vazia.
    if (msg.faltando.length > 0) {
      log.error("template incompleto — envio recusado", {
        onb: onb.id,
        coluna: msg.columnName,
        faltando: msg.faltando,
      })
      return {
        resultado: {
          ok: false,
          reason: `vars_faltando:${msg.faltando.join(",")}`,
        },
        msg,
      }
    }

    // Canal WhatsApp default da org (primeiro ativo — cloud OU evolution)
    const { data: channel } = await admin
      .from("crm_channels")
      .select("id, provider, config, external_id")
      .eq("org_id", onb.org_id)
      .eq("type", "whatsapp")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!channel) return { resultado: { ok: false, reason: "no_channel" }, msg }

    const result = await sendTextViaChannel(channel, phone, body)
    if (result.error?.code === "config_missing") {
      return { resultado: { ok: false, reason: "channel_missing_creds" }, msg }
    }

    if (!result.success) {
      log.error("send failed", { onb: onb.id, err: result.error })
      return { resultado: { ok: false, reason: "send_failed" }, msg }
    }

    // Upsert thread + insert message no inbox CRM
    const { data: thread } = await admin
      .from("crm_threads")
      .upsert(
        {
          org_id: onb.org_id,
          channel_id: channel.id,
          contact_external_id: phone,
          contact_name: msg.clientName,
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

    return { resultado: { ok: true }, msg }
  } catch (e) {
    log.error("unexpected", e)
    return { resultado: { ok: false, reason: "exception" }, msg }
  }
}

/** Quantos caracteres do texto ficam no evento. O corpo inteiro vive em
 *  `crm_messages`; aqui basta reconhecer QUAL mensagem saiu. */
const PREVIA_NO_EVENTO = 160

/**
 * O desfecho vira linha em `events` — nos DOIS sentidos.
 *
 * `onboarding.whatsapp_sent` ja tinha rotulo no drawer
 * (`onboarding-drawer.tsx`) e nenhum emissor: a base tinha ZERO linhas dele em
 * 16/09/2026. A falha nunca teve nem rotulo, e e o caso que mais precisa
 * aparecer — mensagem que NAO saiu e invisivel por definicao.
 *
 * Fail-open: falhar ao registrar nao muda o que ja aconteceu com a mensagem,
 * e derrubar o envio por causa do rastro seria trocar o problema pelo pior.
 */
async function registrarEnvio(
  params: SendColumnParams,
  resultado: { ok: boolean; reason?: string },
  msg: ColumnMessage | null,
): Promise<void> {
  // Sem org nao ha como escopar o evento; e o unico caso em que calar e
  // correto (o onboarding nem foi encontrado).
  if (!msg?.orgId) return
  try {
    const admin = createAdminClient()
    await admin.from("events").insert({
      event_type: resultado.ok
        ? "onboarding.whatsapp_sent"
        : "onboarding.whatsapp_failed",
      entity_type: "onboarding",
      entity_id: params.onboardingId,
      actor_id: params.actorId ?? null,
      actor_type: params.actorId ? "user" : "system",
      payload: {
        onboarding_id: params.onboardingId,
        column_id: params.columnId,
        column_name: msg.columnName,
        destinatario: msg.clientName,
        telefone: msg.phone,
        previa: msg.texto ? msg.texto.slice(0, PREVIA_NO_EVENTO) : null,
        ...(resultado.ok ? {} : { reason: resultado.reason ?? null }),
      },
      metadata: { org_id: msg.orgId },
    })
  } catch (e) {
    log.warn("registro do envio falhou", e)
  }
}
