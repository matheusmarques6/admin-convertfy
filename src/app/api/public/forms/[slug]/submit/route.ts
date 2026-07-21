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
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { dispatchTrigger } from "@/lib/services/crm-trigger-dispatcher.service"

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
  gclid: z.string().nullable().optional(),
  fbclid: z.string().nullable().optional(),
  referrer: z.string().nullable().optional(),
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
        "id, org_id, pipeline_id, stage_id, success_message, redirect_url, created_by, name, scope",
      )
      .eq("slug", slug)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fErr) throw fErr
    if (!form) throw new AppError("Form nao encontrado", 404, "not-found")

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
        const { data: lead, error: lErr } = await admin
          .from("crm_leads")
          .insert({
            name: leadData.name,
            email: leadData.email ?? null,
            phone: leadData.phone ?? null,
            company: leadData.company ?? null,
            source: leadData.source,
            status: "new",
            created_by: form.created_by,
            utm: utmData,
            custom_fields:
              Object.keys(customFieldsData).length > 0
                ? customFieldsData
                : {},
          })
          .select("id")
          .single()
        if (lErr) throw lErr
        leadId = lead.id
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
            owner_id: form.created_by, // fallback assignee
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
            created_by: form.created_by,
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
      gclid: parsed.gclid ?? null,
      fbclid: parsed.fbclid ?? null,
    }

    let { error: sErr } = await admin
      .from("crm_form_submissions")
      .insert(submissionPayload)

    // Retry sem gclid/fbclid se a migration ainda nao rodou no ambiente —
    // perder a submission inteira por 2 colunas novas seria pior.
    if (sErr && /column .* does not exist/i.test(sErr.message)) {
      log.warn("[FormSubmit] retrying submission sem gclid/fbclid (migration pendente)")
      delete submissionPayload.gclid
      delete submissionPayload.fbclid
      const retry = await admin
        .from("crm_form_submissions")
        .insert(submissionPayload)
      sErr = retry.error
    }

    if (sErr) {
      log.error("[FormSubmit] Falha ao salvar submission (mas lead/deal foram criados)", { sErr })
    }

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

    log.info("[FormSubmit] success", { form_id: form.id, lead_id: leadId, deal_id: dealId })

    return successResponse(request, {
      ok: true,
      lead_id: leadId,
      deal_id: dealId,
      success_message: form.success_message ?? null,
      redirect_url: form.redirect_url ?? null,
    })
  } catch (error) {
    log.error("Public submit error:", error)
    return errorResponse(request, error, "public-form-submit")
  }
}
