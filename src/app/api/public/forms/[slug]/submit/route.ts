/**
 * POST /api/public/forms/[slug]/submit
 *
 * Recebe submissao do form publico. Acessivel por anon. Usa admin
 * client (bypass RLS) — toda validacao e feita pelo schema Zod.
 *
 * Fluxo:
 *   1. Carrega form publicado pelo slug
 *   2. Carrega fields do form
 *   3. Valida resposta (campos required preenchidos)
 *   4. Mapeia campos com `map_to_lead_field` para crm_leads
 *   5. Cria lead (ou deduplica por email se existir)
 *   6. Se form.pipeline_id setado, cria deal no pipeline+stage
 *   7. Insere submission com lead_id + deal_id linkados
 *   8. Dispara trigger lead_created (fire-and-forget)
 *   9. Retorna sucesso + redirect_url ou success_message
 */

import { NextRequest } from "next/server"
import { randomUUID } from "crypto"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { dispatchTrigger } from "@/lib/services/crm-trigger-dispatcher.service"
import { resolveAutoOwner } from "@/lib/services/crm-assignment.service"
import { normalizeTrackingConfig, type MetaAdvancedMatching } from "@/types/form-tracking"
import { normalizePhoneDigits } from "@/lib/tracking/hash-pii"
import {
  enqueueConversionEvents,
  evaluateQualified,
  qualifiedEventId,
} from "@/lib/services/conversion-dispatch.service"

const log = logger.child("PublicFormsSubmit")

export const dynamic = "force-dynamic"

const submitSchema = z.object({
  // answers e um map field_id -> valor (string|number|array).
  answers: z.record(z.string(), z.unknown()).default({}),
  // UTM/referrer opcionais — frontend deve popular do query string.
  utm_source: z.string().nullable().optional(),
  utm_medium: z.string().nullable().optional(),
  utm_campaign: z.string().nullable().optional(),
  utm_term: z.string().nullable().optional(),
  utm_content: z.string().nullable().optional(),
  referrer: z.string().nullable().optional(),
  // Click ids p/ matching de conversao (Meta/Google). Capturados no
  // browser (cookies _fbc/_fbp + query fbclid/gclid).
  fbc: z.string().nullable().optional(),
  fbp: z.string().nullable().optional(),
  fbclid: z.string().nullable().optional(),
  gclid: z.string().nullable().optional(),
  event_source_url: z.string().nullable().optional(),
})

interface FormFieldRow {
  id: string
  field_type: string
  label: string
  required: boolean
  map_to_lead_field: string | null
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = submitSchema.parse(body)

    // 1. Form publicado.
    const { data: form, error: fErr } = await admin
      .from("crm_forms")
      .select(
        `id, org_id, pipeline_id, stage_id, success_message, redirect_url,
         created_by, name, scope,
         facebook_pixel_id, meta_capi_token, meta_test_event_code, tracking_config`,
      )
      .eq("slug", slug)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fErr) throw fErr
    if (!form) throw new AppError("Form nao encontrado", 404, "not-found")

    // created_by do form pode apontar pra um profile que foi removido. Se a
    // FK falhar no insert do lead, viramos essa referencia p/ null e reusamos
    // no deal/activity — em vez de derrubar a submissao inteira com 400.
    let effectiveCreatedBy: string | null = form.created_by ?? null

    // 2. Fields.
    const { data: fields, error: fieldsErr } = await admin
      .from("crm_form_fields")
      .select("id, field_type, label, required, map_to_lead_field")
      .eq("form_id", form.id)
      .returns<FormFieldRow[]>()
    if (fieldsErr) throw fieldsErr

    // 3. Validacao basica de required.
    const missingRequired: string[] = []
    for (const f of fields || []) {
      if (!f.required) continue
      const val = parsed.answers[f.id]
      if (val === undefined || val === null || val === "" ||
        (Array.isArray(val) && val.length === 0)) {
        missingRequired.push(f.label)
      }
    }
    if (missingRequired.length > 0) {
      throw new AppError(
        `Campos obrigatorios nao preenchidos: ${missingRequired.join(", ")}`,
        400,
        "validation-failed",
      )
    }

    // 4. Mapeia map_to_lead_field -> dados de lead/deal.
    // Suporta:
    //   - colunas padrao do lead (name, email, phone, company, source)
    //   - "custom:<key>"      -> crm_leads.custom_fields[key]
    //   - "custom_lead:<key>" -> crm_leads.custom_fields[key] (alias)
    //   - "custom_deal:<key>" -> deals.custom_fields[key]
    const leadData: {
      name?: string
      email?: string
      phone?: string
      company?: string
      source?: string
    } = {}
    const customFieldsData: Record<string, unknown> = {}
    const dealCustomFieldsData: Record<string, unknown> = {}

    for (const f of fields || []) {
      if (!f.map_to_lead_field) continue
      const val = parsed.answers[f.id]
      if (val == null || val === "") continue

      // Custom de DEAL: grava em deals.custom_fields ao criar o deal.
      if (f.map_to_lead_field.startsWith("custom_deal:")) {
        const key = f.map_to_lead_field.slice("custom_deal:".length)
        if (key) dealCustomFieldsData[key] = val
        continue
      }

      // Custom de LEAD: aceita "custom:" (legado) e "custom_lead:".
      if (
        f.map_to_lead_field.startsWith("custom_lead:") ||
        f.map_to_lead_field.startsWith("custom:")
      ) {
        const prefix = f.map_to_lead_field.startsWith("custom_lead:")
          ? "custom_lead:"
          : "custom:"
        const key = f.map_to_lead_field.slice(prefix.length)
        if (key) customFieldsData[key] = val
        continue
      }

      const v = String(val).trim()
      switch (f.map_to_lead_field) {
        case "name": leadData.name = v; break
        case "email": leadData.email = v.toLowerCase(); break
        case "phone": leadData.phone = v; break
        case "company": leadData.company = v; break
        case "source": leadData.source = v; break
      }
    }

    // Fallback: se nao tem name mapeado, usa o primeiro field text/textarea
    // como nome OU "Lead via {form.name}".
    if (!leadData.name) {
      const firstText = (fields || []).find(
        (f) => f.field_type === "text" || f.field_type === "textarea",
      )
      const fallbackName = firstText
        ? String(parsed.answers[firstText.id] ?? "").trim()
        : ""
      leadData.name = fallbackName || `Lead via ${form.name}`
    }
    if (!leadData.source) {
      leadData.source = `form:${slug}`
    }

    // Form CS: tenta resolver cliente existente por email. Se achar, cria
    // store_alert (feedback_received) na loja, sem criar lead novo (alerta
    // vive na loja). Se NAO achar cliente, cai pro fluxo sales padrao
    // (cria lead) — pode ser triagem manual depois.
    const isCsForm = form.scope === "cs" || form.scope === "either"
    let matchedStoreId: string | null = null
    let matchedClientId: string | null = null
    if (isCsForm && leadData.email) {
      const { data: clientMatch } = await admin
        .from("clients")
        .select("id, stores:client_stores(id, is_active)")
        .eq("email", leadData.email)
        .eq("org_id", form.org_id)
        .maybeSingle()
      if (clientMatch) {
        matchedClientId = clientMatch.id
        const stores = (clientMatch.stores ?? []) as Array<{
          id: string
          is_active: boolean
        }>
        const activeStore = stores.find((s) => s.is_active) ?? stores[0]
        if (activeStore) matchedStoreId = activeStore.id
      }
    }

    // Se eh form CS E achou cliente existente, cria APENAS alerta na loja
    // (sem lead). O dado do feedback fica no crm_form_submissions (passo 7)
    // que ja eh persistido em todos os casos.
    const isCsAlert = isCsForm && matchedStoreId && matchedClientId
    let leadId: string | null = null

    // UTM/click-ids/referrer da visita — gravado no lead E no deal
    // (origem do cliente).
    const utmData = {
      source: parsed.utm_source ?? null,
      medium: parsed.utm_medium ?? null,
      campaign: parsed.utm_campaign ?? null,
      term: parsed.utm_term ?? null,
      content: parsed.utm_content ?? null,
      gclid: parsed.gclid ?? null,
      fbclid: parsed.fbclid ?? null,
      referrer: parsed.referrer ?? null,
    }
    const hasUtmData = Object.values(utmData).some((v) => v !== null)

    if (isCsAlert) {
      const { error: alertErr } = await admin.from("store_alerts").insert({
        store_id: matchedStoreId,
        client_id: matchedClientId,
        type: "feedback_received",
        severity: "info",
        title: `Resposta recebida: ${form.name}`,
        message: `Cliente respondeu o formulario "${form.name}". Triar resposta e tomar acao se necessario.`,
        status: "active",
        metadata: {
          form_id: form.id,
          form_slug: slug,
          form_name: form.name,
          submitted_by_email: leadData.email,
          source: "form_submit",
        },
      })
      if (alertErr) {
        log.warn("[FormSubmit] Falha criando feedback_received alert", {
          store_id: matchedStoreId,
          error: alertErr.message,
        })
      }
    } else {
      // Fluxo sales/anonimo: cria lead como antes.
      // 5. Dedup por email.
      if (leadData.email) {
        const { data: existing } = await admin
          .from("crm_leads")
          .select("id")
          .eq("email", leadData.email)
          .maybeSingle()
        if (existing) leadId = existing.id
      }

      if (!leadId) {
        const leadPayload: Record<string, unknown> = {
          name: leadData.name,
          email: leadData.email ?? null,
          phone: leadData.phone ?? null,
          company: leadData.company ?? null,
          source: leadData.source,
          status: "new",
          created_by: effectiveCreatedBy,
          // Sem org_id o lead some de toda listagem e contagem que
          // filtra por org (lista de Leads, funil, snapshots): ele
          // existe no banco mas é invisível no admin.
          org_id: form.org_id,
          utm: utmData,
          custom_fields:
            Object.keys(customFieldsData).length > 0 ? customFieldsData : {},
        }

        let leadRes = await admin
          .from("crm_leads")
          .insert(leadPayload)
          .select("id")
          .single()

        // Rede de seguranca: FK 23503 = created_by aponta pra profile
        // inexistente. Reinsere sem created_by (a coluna aceita null).
        if (leadRes.error && (leadRes.error as { code?: string }).code === "23503") {
          log.warn(
            "[FormSubmit] created_by invalido (FK) — reinserindo lead sem created_by",
            { form_id: form.id, created_by: form.created_by },
          )
          effectiveCreatedBy = null
          leadPayload.created_by = null
          leadRes = await admin
            .from("crm_leads")
            .insert(leadPayload)
            .select("id")
            .single()
        }

        if (leadRes.error) throw leadRes.error
        leadId = leadRes.data.id
      } else {
        // Lead deduplicado por email — faz merge dos custom fields existentes
        // com os novos (novos sobrescrevem em caso de conflito) e, se o lead
        // ainda nao tem UTM registrada, grava a origem desta submissao
        // (first touch ja gravado NUNCA e sobrescrito).
        const { data: existing } = await admin
          .from("crm_leads")
          .select("custom_fields, utm")
          .eq("id", leadId)
          .single()

        const updates: Record<string, unknown> = {}
        if (Object.keys(customFieldsData).length > 0) {
          updates.custom_fields = {
            ...((existing?.custom_fields as Record<string, unknown> | null) ?? {}),
            ...customFieldsData,
          }
        }
        const existingUtm = (existing?.utm as Record<string, unknown> | null) ?? {}
        const existingHasUtm = Object.values(existingUtm).some(
          (v) => typeof v === "string" && v.trim() !== "",
        )
        if (hasUtmData && !existingHasUtm) updates.utm = utmData

        if (Object.keys(updates).length > 0) {
          await admin.from("crm_leads").update(updates).eq("id", leadId)
        }
      }
    }

    // 6. Se form tem pipeline_id, cria deal.
    // stage_id e OPCIONAL na config do form: quando o usuario escolhe uma
    // pipeline mas deixa a etapa no default "Primeira etapa do pipeline", o
    // stage_id fica null. Nesse caso resolvemos a primeira etapa (menor
    // "order") aqui — sem isso o deal nunca era criado e a submissao virava
    // "so lead", contrariando a UI que promete criar o card na 1a etapa.
    let dealId: string | null = null
    if (form.pipeline_id && leadId) {
      let stageId = form.stage_id
      if (!stageId) {
        const { data: firstStage } = await admin
          .from("pipeline_stages")
          .select("id")
          .eq("pipeline_id", form.pipeline_id)
          .order("order", { ascending: true })
          .limit(1)
          .maybeSingle()
        stageId = firstStage?.id ?? null
      }

      if (!stageId) {
        log.warn(
          "[FormSubmit] Pipeline sem etapas — deal nao criado, segue so com lead",
          { pipeline_id: form.pipeline_id },
        )
      } else {
        // Posicao no fim da etapa.
        const { data: maxPos } = await admin
          .from("deals")
          .select("position")
          .eq("stage_id", stageId)
          .order("position", { ascending: false })
          .limit(1)
          .maybeSingle()
        const nextPos = (maxPos?.position ?? 0) + 10

        // Rodízio da pipeline (assignment_mode='round_robin'): lead
        // inbound cai no vendedor menos carregado em vez do dono do form.
        const autoOwner = await resolveAutoOwner(admin, form.pipeline_id, form.org_id)

        const { data: deal, error: dErr } = await admin
          .from("deals")
          .insert({
            pipeline_id: form.pipeline_id,
            stage_id: stageId,
            title: leadData.name || `Lead via ${form.name}`,
            value: 0,
            currency: "BRL",
            probability: 50,
            status: "open",
            source: leadData.source,
            utm: utmData,
            tags: [],
            lead_id: leadId,
            owner_id: autoOwner ?? effectiveCreatedBy, // rodízio → fallback assignee
            position: nextPos,
            custom_fields:
              Object.keys(dealCustomFieldsData).length > 0
                ? dealCustomFieldsData
                : {},
          })
          .select("id")
          .single()

        if (!dErr && deal) {
          dealId = deal.id

          // Activity de criacao via form.
          await admin.from("crm_deal_activities").insert({
            deal_id: deal.id,
            type: "system",
            content: `Deal criado automaticamente via formulario "${form.name}"`,
            created_by: effectiveCreatedBy,
            is_internal: true,
          })
        } else if (dErr) {
          log.warn("[FormSubmit] Falha ao criar deal — segue submission sem deal", { dErr })
        }
      }
    }

    // 7. Insere submission.
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
    const ua = request.headers.get("user-agent") ?? null

    const submissionPayload: Record<string, unknown> = {
      form_id: form.id,
      org_id: form.org_id,
      lead_id: leadId,
      deal_id: dealId,
      answers: parsed.answers,
      ip_address: ip,
      user_agent: ua,
      referrer: parsed.referrer ?? null,
      utm_source: parsed.utm_source ?? null,
      utm_medium: parsed.utm_medium ?? null,
      utm_campaign: parsed.utm_campaign ?? null,
      utm_term: parsed.utm_term ?? null,
      utm_content: parsed.utm_content ?? null,
      fbc: parsed.fbc ?? null,
      fbp: parsed.fbp ?? null,
      fbclid: parsed.fbclid ?? null,
      gclid: parsed.gclid ?? null,
    }

    let { data: submissionRow, error: sErr } = await admin
      .from("crm_form_submissions")
      .insert(submissionPayload)
      .select("id")
      .maybeSingle()

    // Retry sem as colunas de tracking se a migration ainda nao rodou no
    // ambiente — perder a submission inteira por colunas novas seria pior.
    if (sErr && /column .* does not exist/i.test(sErr.message)) {
      log.warn("[FormSubmit] retrying submission sem tracking cols (migration pendente)")
      delete submissionPayload.fbc
      delete submissionPayload.fbp
      delete submissionPayload.fbclid
      delete submissionPayload.gclid
      const retry = await admin
        .from("crm_form_submissions")
        .insert(submissionPayload)
        .select("id")
        .maybeSingle()
      submissionRow = retry.data
      sErr = retry.error
    }

    if (sErr) {
      log.error("[FormSubmit] Falha ao salvar submission (mas lead/deal foram criados)", { sErr })
    }
    const submissionId = submissionRow?.id ?? null

    // 8. Dispara triggers de automacao (lead_created e deal_created
    //    se aplicavel). Fire-and-forget.
    if (leadId) {
      dispatchTrigger({
        trigger_type: "lead_created",
        org_id: form.org_id,
        trigger_data: { lead_id: leadId, source: "form", form_slug: slug },
        context: {
          trigger_type: "lead_created",
          trigger_data: { lead_id: leadId },
          lead: { id: leadId, ...leadData },
          org_id: form.org_id,
        },
        idempotency_key: `lead_created:${leadId}`,
      }).catch((err) => log.error("[FormSubmit] dispatch lead_created", err))
    }
    if (dealId) {
      dispatchTrigger({
        trigger_type: "deal_created",
        org_id: form.org_id,
        trigger_data: { deal_id: dealId, source: "form", form_slug: slug },
        context: {
          trigger_type: "deal_created",
          trigger_data: { deal_id: dealId },
          deal: { id: dealId, source: leadData.source },
          org_id: form.org_id,
        },
        idempotency_key: `deal_created:${dealId}`,
      }).catch((err) => log.error("[FormSubmit] dispatch deal_created", err))
    }

    // 9. Eventos de conversao (Meta CAPI). So quando o Meta esta
    //    configurado no form. A INSERT na fila e aguardada (durabilidade);
    //    o envio HTTP roda destacado no serviço e o cron
    //    /api/cron/conversion-dispatch garante a entrega do que faltar.
    const trackingCfg = normalizeTrackingConfig(form.tracking_config)
    const metaConfigured =
      trackingCfg.meta.enabled && !!form.facebook_pixel_id && !!form.meta_capi_token
    let eventId: string | null = null
    let qualified = false
    // Payload extra devolvido ao browser SO quando o lead qualifica: o
    // advanced matching e os parametros do evento custom. Fica null no
    // caso comum — o evento "Lead" do pixel continua sem params.
    let qualifiedUserData: MetaAdvancedMatching | null = null
    let qualifiedCustomData: Record<string, unknown> | null = null
    if (metaConfigured && leadId) {
      eventId = randomUUID()
      qualified = evaluateQualified(
        trackingCfg.qualified_lead,
        parsed.answers,
        fields ?? undefined,
      )

      // Nome completo -> first/last pro user_data do Meta.
      const fullName = (leadData.name ?? "").trim()
      const spaceIdx = fullName.indexOf(" ")
      const firstName = spaceIdx > 0 ? fullName.slice(0, spaceIdx) : fullName || null
      const lastName = spaceIdx > 0 ? fullName.slice(spaceIdx + 1).trim() : null

      // custom_data: maximo de parametros do lead p/ otimizacao.
      const customData: Record<string, unknown> = { ...customFieldsData }
      if (leadData.company) customData.company = leadData.company
      if (leadData.source) customData.lead_source = leadData.source
      if (parsed.utm_source) customData.utm_source = parsed.utm_source
      if (parsed.utm_medium) customData.utm_medium = parsed.utm_medium
      if (parsed.utm_campaign) customData.utm_campaign = parsed.utm_campaign
      if (parsed.utm_term) customData.utm_term = parsed.utm_term
      if (parsed.utm_content) customData.utm_content = parsed.utm_content

      // Espelho do matching/params pro pixel de browser. Enviado apenas
      // no evento qualificado — o "Lead" comum segue anonimo do lado do
      // browser (a CAPI ja manda o user_data hasheado dos dois).
      // Valores em texto puro e normalizados; o fbevents hasheia no
      // browser, chegando ao mesmo SHA-256 que `buildMetaUserData` gera
      // aqui — os dois lados do mesmo event_id casam.
      if (qualified) {
        const am: MetaAdvancedMatching = {}
        const em = leadData.email?.trim().toLowerCase()
        const ph = normalizePhoneDigits(leadData.phone)
        const fn = firstName?.trim().toLowerCase()
        const ln = lastName?.trim().toLowerCase()
        if (em) am.em = em
        if (ph) am.ph = ph
        if (fn) am.fn = fn
        if (ln) am.ln = ln
        if (leadId) am.external_id = leadId
        if (Object.keys(am).length > 0) qualifiedUserData = am
        if (Object.keys(customData).length > 0) qualifiedCustomData = customData
      }

      await enqueueConversionEvents({
        orgId: form.org_id,
        formId: form.id,
        submissionId,
        leadId,
        eventId,
        qualified,
        // Nome EXATAMENTE como configurado: é ele que aparece no
        // Gerenciador de Eventos e é nele que a conversão personalizada
        // da campanha está apoiada. Quem não pode mandar este nome é o
        // pixel do browser (ver abaixo) — não a CAPI.
        qualifiedEventName: trackingCfg.qualified_lead.event_name,
        eventSourceUrl: parsed.event_source_url ?? parsed.referrer ?? null,
        meta: {
          pixelId: form.facebook_pixel_id as string,
          capiTokenEnc: form.meta_capi_token as string,
          testEventCode: form.meta_test_event_code ?? null,
        },
        lead: {
          email: leadData.email ?? null,
          phone: leadData.phone ?? null,
          firstName,
          lastName,
        },
        customData,
        request: {
          ip,
          userAgent: ua,
          fbc: parsed.fbc ?? null,
          fbp: parsed.fbp ?? null,
        },
      })
    }

    log.info("[FormSubmit] success", { form_id: form.id, lead_id: leadId, deal_id: dealId })

    return successResponse(request, {
      ok: true,
      lead_id: leadId,
      deal_id: dealId,
      success_message: form.success_message ?? null,
      redirect_url: form.redirect_url ?? null,
      // Tracking p/ o browser deduplicar (mesmo event_id do server) e
      // disparar fbq/gtag no sucesso.
      tracking: {
        event_id: eventId,
        qualified,
        qualified_event_id: eventId && qualified ? qualifiedEventId(eventId) : null,
        // Devolvido só para exibição/telemetria do lado do form. O
        // browser NÃO dispara mais o evento qualificado: o pixel manda o
        // nome na URL e um nome com espaço chegava à Meta como
        // "Lead%20qualificado" — um segundo evento, que nem deduplica
        // com o da CAPI nem serve para otimizar campanha. O qualificado
        // é enviado só pelo servidor, que manda o nome intacto (e leva
        // fbc/fbp/IP, então o matching não piora).
        qualified_event_name: qualified ? trackingCfg.qualified_lead.event_name : null,
        qualified_browser_pixel: false,
        // Advanced matching + params do evento qualificado (null quando
        // nao qualifica). Ver comentario na montagem, acima.
        qualified_user_data: qualifiedUserData,
        qualified_custom_data: qualifiedCustomData,
      },
    })
  } catch (error) {
    // Log detalhado pra diagnostico: PostgrestError expoe code/details/hint,
    // que o errorResponse nao repassa ao cliente (so a mensagem mapeada).
    const e = error as {
      message?: string
      code?: string
      details?: string
      hint?: string
    }
    log.error("Public submit error", {
      message: e?.message,
      code: e?.code,
      details: e?.details,
      hint: e?.hint,
    })
    return errorResponse(request, error, "public-form-submit")
  }
}
