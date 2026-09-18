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
import { checkRateLimit } from "@/lib/rate-limit"
import { dispatchTrigger } from "@/lib/services/crm-trigger-dispatcher.service"
import { resolveAutoOwner } from "@/lib/services/crm-assignment.service"
import { normalizeTrackingConfig, type MetaAdvancedMatching } from "@/types/form-tracking"
import { normalizePhoneDigits } from "@/lib/tracking/hash-pii"
import {
  enqueueConversionEvents,
  evaluateQualified,
  qualifiedEventId,
} from "@/lib/services/conversion-dispatch.service"
import { metaEventName } from "@/lib/tracking/meta-event-name"
import { buildCrmFormUrl } from "@/lib/utils/form-url"
import { concluirSessao } from "@/lib/services/form-session.service"
import { caminhoAte, finalAlcancado, refsDoCaminho, ultimoAlcancavel } from "@/lib/forms/engine"
import { normalizarSchema } from "@/lib/forms/schema"
import { acessoAoFormulario, faixaDaPontuacao, politicaDeDuplicado, pontuar } from "@/lib/forms/pontuacao"
import { desfechoNoCrm } from "@/lib/forms/desfecho"
import { destinoDoWebhook, enviarWebhook, respostasLegiveis } from "@/lib/forms/webhook"
import { camposDerivados } from "@/lib/forms/derivados"
import { verificarTokenSessao } from "@/lib/forms/session-token"

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
  // Sessão do conversacional: fecha a fila do abandono. Opcional — o
  // formulário clássico não a tem, e exigi-la quebraria o que está no ar.
  session_id: z.string().uuid().nullable().optional(),
  session_token: z.string().max(300).nullable().optional(),
  ending_ref: z.string().max(100).nullable().optional(),
  /**
   * As variáveis que a lógica acumulou — o score, a trilha.
   *
   * Vêm do cliente porque é lá que a engine roda, e por isso são
   * REGISTRO, nunca decisão: nada que valha dinheiro (criar negócio,
   * disparar conversão, desqualificar) olha para elas. Quem decide é o
   * schema publicado.
   */
  variables: z.record(z.string().max(60), z.union([z.string().max(200), z.number()])).nullable().optional(),
  // Aceito por compatibilidade, mas quem MANDA é o schema publicado
  // (`lerDoSchema`): o cliente aponta o final, a régua é nossa.
  disqualified: z.boolean().nullable().optional(),
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

    // O endereço mais valioso do público era o único SEM teto: as rotas
    // de sessão (telemetria) limitavam e esta, que cria lead, cria
    // negócio e manda conversão para a Meta, não. Com anúncio ligado a
    // página entra no radar de robô, e evento lixo na CAPI não só suja o
    // CRM como estraga a otimização da campanha.
    //
    // 10 por minuto por IP é folgado para gente — uma pessoa envia uma
    // vez, e uma repetição depois de erro de rede são duas ou três.
    // NUNCA `failClosed`: sem Redis configurado isso recusaria todo
    // cadastro real, e o cadastro é o produto.
    const limite = await checkRateLimit(request, `form-submit:${slug}`, {
      limit: 10,
      windowSeconds: 60,
    })
    if (limite) {
      // O corpo padrão é em inglês e o formulário mostra a mensagem do
      // servidor ao visitante. Status e `Retry-After` seguem intactos.
      return new Response(
        JSON.stringify({ error: "Muitos envios seguidos. Aguarde um minuto e tente de novo." }),
        {
          status: limite.status,
          headers: {
            "Content-Type": "application/json",
            ...(limite.headers.get("Retry-After")
              ? { "Retry-After": limite.headers.get("Retry-After") as string }
              : {}),
          },
        },
      )
    }

    const admin = createAdminClient()

    const body = await request.json()
    const parsed = submitSchema.parse(body)

    // 1. Form publicado.
    const { data: form, error: fErr } = await admin
      .from("crm_forms")
      .select(
        `id, org_id, pipeline_id, stage_id, success_message, redirect_url,
         created_by, name, scope, published_version_id,
         facebook_pixel_id, meta_capi_token, meta_test_event_code, tracking_config,
         settings, submissions_count`,
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

    // 3. Obrigatório é obrigatório NO CAMINHO QUE A PESSOA PERCORREU.
    //
    // Com lógica de salto, um final pode ser alcançado antes de perguntas
    // obrigatórias que ficam adiante — no /forms/diagnostico, quem marca
    // a faixa abaixo do corte nunca vê "Qual o endereço da sua loja?",
    // que é `required`. Cobrar o campo aqui devolveria 400 e PERDERIA o
    // lead: ele respondeu tudo o que lhe foi perguntado.
    //
    // No formulário clássico não existe lógica, então o caminho é a lista
    // inteira e esta validação é byte a byte a de antes.
    const {
      refs: refsDoCaminho,
      desqualificado,
      schema: schemaPublicado,
      finalCalculado,
    } = await lerDoSchema(admin, form, parsed.answers, parsed.ending_ref ?? null)

    // A partir daqui, o desfecho é o CALCULADO quando existe. A
    // divergência vai para o log porque ela tem duas causas legítimas —
    // versão publicada trocada no meio do preenchimento e resposta que
    // não viajou — e uma ilegítima: alguém escolhendo o próprio final.
    const endingRef = finalCalculado ?? parsed.ending_ref ?? null

    /**
     * Acesso (aba Configurar): fechado à mão ou limite de envios. A régua
     * é a do schema PUBLICADO — a mesma que a página lê para mostrar a
     * mensagem —, e o contador é a coluna que o trigger mantém. 410 e não
     * 403: o endereço existe, o que acabou foi a janela.
     */
    const acesso = acessoAoFormulario(
      schemaPublicado?.settings,
      typeof form.submissions_count === "number" ? form.submissions_count : null,
    )
    if (!acesso.aberto) {
      log.info("submit.fechado", { formId: form.id, motivo: acesso.motivo })
      throw new AppError(acesso.mensagem, 410, "form-closed")
    }

    /**
     * Pontuação: soma `pontos[resposta]` das perguntas que pontuam e acha
     * a faixa. A faixa pode trocar a ETAPA do negócio e acrescentar uma
     * etiqueta; fora de toda faixa, vale a etapa do formulário.
     */
    const pontuacao = schemaPublicado ? pontuar(schemaPublicado, parsed.answers as never) : null
    const faixa =
      pontuacao && pontuacao.perguntasQuePontuam > 0
        ? faixaDaPontuacao(schemaPublicado?.settings?.faixas, pontuacao.total)
        : null
    if (finalCalculado && parsed.ending_ref && finalCalculado !== parsed.ending_ref) {
      log.warn("submit.final_divergente", {
        formId: form.id,
        doCliente: parsed.ending_ref,
        calculado: finalCalculado,
      })
    }

    // O piso em real da faixa de faturamento, calculado AQUI e não aceito
    // do corpo: o browser manda a escolha, a conversão é nossa. É ele que
    // a regra do evento qualificado compara, para que renomear uma opção
    // pare de desligar a conversão em silêncio.
    const derivados = camposDerivados(schemaPublicado, parsed.answers)
    const respostasComDerivados = { ...parsed.answers, ...derivados.answers }
    const missingRequired: string[] = []
    for (const f of fields || []) {
      if (!f.required) continue
      if (refsDoCaminho && !refsDoCaminho.has(f.id)) continue
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

    // O desfecho decide o que acontece no CRM: quais tags, se vira card
    // na pipeline e qual resposta vai em destaque. A régua é do schema
    // PUBLICADO, como a desqualificação — o corpo do POST só diz onde a
    // pessoa parou.
    const desfecho = desfechoNoCrm(
      schemaPublicado,
      endingRef,
      parsed.answers as Record<string, never>,
      refsDoCaminho,
    )

    // 4. Mapeia map_to_lead_field -> dados de lead/deal.
    // Suporta:
    //   - colunas padrao do lead (name, email, phone, company, source)
    //   - "first_name" / "last_name": as duas metades do nome. Existem
    //     porque o split por espaço erra em nome composto ("João Pedro
    //     Silva" vira fn="João", ln="Pedro Silva") e é o `fn`/`ln`
    //     hasheado que a Meta usa para casar a pessoa. Perguntadas na
    //     mesma tela, custam um campo e melhoram o matching.
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
    /** As metades vindas de campos próprios, quando o form as pergunta. */
    const nomePartido: { first?: string; last?: string } = {}
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
        case "first_name": nomePartido.first = v; break
        case "last_name": nomePartido.last = v; break
        case "email": leadData.email = v.toLowerCase(); break
        case "phone": leadData.phone = v; break
        case "company": leadData.company = v; break
        case "source": leadData.source = v; break
      }
    }

    Object.assign(dealCustomFieldsData, derivados.custom_deal)

    // Nome e sobrenome perguntados separados compõem o nome do CRM: o
    // vendedor abre o card e lê o nome inteiro, como sempre leu.
    if (!leadData.name && (nomePartido.first || nomePartido.last)) {
      leadData.name = [nomePartido.first, nomePartido.last].filter(Boolean).join(" ")
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
      // 5. Dedup por email — conforme a política da aba Configurar:
      //    `atualiza` (padrão, o de sempre), `novo` (sempre cria outro
      //    lead) ou `ignora` (reusa o existente sem tocar nele).
      const politica = politicaDeDuplicado(schemaPublicado?.settings)
      if (leadData.email && politica !== "novo") {
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
          ...(desfecho.tags.length > 0 ? { tags: desfecho.tags } : {}),
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
      } else if (politica === "ignora") {
        log.info("submit.duplicado_ignorado", { formId: form.id, leadId })
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
    if (!desfecho.criaNegocio) {
      // Não é falha: o final pediu que este cadastro ficasse fora da
      // pipeline. Fica no log porque "o lead entrou e o card não
      // apareceu" é exatamente o que alguém vai investigar depois.
      log.info("[FormSubmit] Final não cria negócio", {
        form_id: form.id,
        ending: endingRef,
      })
    }
    if (form.pipeline_id && leadId && desfecho.criaNegocio) {
      // A faixa de pontuação vence a etapa do formulário — mas só se a
      // etapa existir NESTA pipeline: uma faixa apontando para etapa de
      // outro funil (pipeline trocada depois) mandaria o card para um
      // kanban que ninguém abre.
      let stageId = form.stage_id
      if (faixa?.stage_id) {
        const { data: etapaDaFaixa } = await admin
          .from("pipeline_stages")
          .select("id")
          .eq("id", faixa.stage_id)
          .eq("pipeline_id", form.pipeline_id)
          .maybeSingle()
        if (etapaDaFaixa) stageId = etapaDaFaixa.id
        else log.warn("submit.faixa_etapa_fora_da_pipeline", { formId: form.id, stage: faixa.stage_id })
      }
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
            // Quem o próprio formulário recusou não pode chegar ao funil
            // com a MESMA cara de quem ele quer: o time liga, e a pessoa
            // acabou de ler "a conta não fecha para você". Marcar o card
            // é o remédio conservador — nenhuma etapa nova aparece no
            // kanban de ninguém, e o marcador segue o card na busca e no
            // relatório, como o "— abandonou" do cron faz.
            title: desqualificado
              ? `${leadData.name || `Lead via ${form.name}`} — fora do corte`
              : leadData.name || `Lead via ${form.name}`,
            value: 0,
            currency: "BRL",
            probability: desqualificado ? 5 : 50,
            status: "open",
            source: leadData.source,
            utm: utmData,
            // As tags saem do desfecho: as do final mais as das respostas
            // que a pessoa deu NO CAMINHO. "fora-do-corte" continua aqui
            // como rede para o formulário que não configurou nenhuma.
            tags: [
              ...(desfecho.tags.length > 0
                ? desfecho.tags
                : desqualificado
                  ? ["fora-do-corte"]
                  : []),
              ...(faixa?.tag && !desfecho.tags.includes(faixa.tag) ? [faixa.tag] : []),
            ],
            lead_id: leadId,
            owner_id: autoOwner ?? effectiveCreatedBy, // rodízio → fallback assignee
            position: nextPos,
            custom_fields: camposDoCard(dealCustomFieldsData, parsed.variables, desfecho),
          })
          .select("id")
          .single()

        if (!dErr && deal) {
          dealId = deal.id

          // Activity de criacao via form.
          await admin.from("crm_deal_activities").insert({
            deal_id: deal.id,
            type: "system",
            content:
              textoDaAtividade(form.name, desqualificado, desfecho, parsed.variables) +
              (pontuacao && pontuacao.perguntasQuePontuam > 0
                ? ` · Pontuação: ${pontuacao.total} de ${pontuacao.maximo} pts` +
                  (faixa ? ` (faixa ${faixa.de}–${faixa.ate}${faixa.tag ? `, etiqueta "${faixa.tag}"` : ""})` : "")
                : ""),
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

    // 7b. Fecha a sessão do conversacional.
    //
    // AWAIT, nunca `void`: em serverless a promise solta morre quando o
    // processo congela depois do `return`. Perder isto faria o cron de
    // abandono mandar ao CRM justamente quem acabou de converter — o
    // erro mais caro que este módulo pode cometer.
    //
    // O token é conferido porque `session_id` viaja pelo browser: sem
    // ele, qualquer um marcaria a sessão de outra pessoa como concluída
    // e o abandono dela nunca chegaria ao vendedor.
    let sessaoAutenticada = false
    if (parsed.session_id && parsed.session_token) {
      const tk = verificarTokenSessao(parsed.session_token)
      sessaoAutenticada = tk.valido && tk.sessionId === parsed.session_id
      if (sessaoAutenticada) {
        await concluirSessao(admin, parsed.session_id, {
          leadId,
          dealId,
          submissionId,
          endingRef,
          // O mesmo veredicto do schema publicado que marcou o card: o
          // status da sessão alimenta os contadores do funil, e duas
          // fontes para a mesma pergunta divergiriam na primeira edição.
          disqualified: desqualificado || Boolean(parsed.disqualified),
        })
      } else {
        log.warn("[FormSubmit] sessão não fechada: token inválido", { motivo: tk.motivo })
      }
    }

    // 7c. Avisa o n8n.
    //
    // AWAIT pelo mesmo motivo da sessão: promise solta morre no
    // congelamento do serverless. E fail-open pelo motivo oposto — o
    // cadastro já está no banco quando isto roda, então um n8n fora do
    // ar não pode fazer a pessoa ver erro numa tela que já registrou a
    // resposta dela.
    const destinoN8n = destinoDoWebhook(form.settings)
    if (destinoN8n) {
      const finalDoSchema = endingRef
        ? (schemaPublicado?.endings ?? []).find((e) => e.ref === endingRef)
        : undefined
      const r = await enviarWebhook(destinoN8n, {
        evento: "formulario.enviado",
        enviado_em: new Date().toISOString(),
        formulario: { id: form.id, slug, nome: form.name },
        final: finalDoSchema
          ? {
              ref: finalDoSchema.ref,
              titulo: finalDoSchema.title,
              desqualifica: Boolean(finalDoSchema.disqualified),
            }
          : null,
        lead_id: leadId,
        deal_id: dealId,
        submission_id: submissionId,
        contato: {
          nome: leadData.name ?? null,
          email: leadData.email ?? null,
          telefone: leadData.phone ?? null,
        },
        respostas: respostasLegiveis(schemaPublicado, parsed.answers as Record<string, never>),
        variaveis: parsed.variables ?? {},
        tags: desfecho.tags,
        utm: utmData as Record<string, string | null>,
      })
      if (!r.ok) {
        log.warn("[FormSubmit] webhook do formulário não entregue", {
          form_id: form.id,
          motivo: r.motivo,
          detalhe: r.detalhe,
        })
      }
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
      // O `event_id` do "Lead" é o da SESSÃO quando ela existe e foi
      // verificada. É isso que impede contar a mesma pessoa duas vezes:
      // o conversacional pode ter disparado o "Lead" parcial assim que o
      // contato foi capturado (ver `fireLeadParcial`), e a dedupe da Meta
      // é por (nome do evento, event_id) — com ids diferentes, o parcial
      // e o completo virariam duas conversões do mesmo cadastro.
      //
      // Só o id AUTENTICADO serve: ele viaja pelo browser, e aceitar um
      // qualquer deixaria alguém colar a conversão de um cadastro em
      // cima da de outro. Sem sessão (formulário clássico) nada muda.
      eventId = sessaoAutenticada && parsed.session_id ? parsed.session_id : randomUUID()
      qualified = evaluateQualified(
        trackingCfg.qualified_lead,
        respostasComDerivados,
        [...(fields ?? []), ...derivados.fields],
        endingRef,
      )

      // Nome completo -> first/last pro user_data do Meta. Quando o
      // formulário PERGUNTOU as duas metades, elas vencem o split por
      // espaço, que erra justamente em nome composto.
      const fullName = (leadData.name ?? "").trim()
      const spaceIdx = fullName.indexOf(" ")
      const firstName =
        nomePartido.first ?? (spaceIdx > 0 ? fullName.slice(0, spaceIdx) : fullName || null)
      const lastName =
        nomePartido.last ?? (spaceIdx > 0 ? fullName.slice(spaceIdx + 1).trim() : null)

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
        // Mesmo nome nos DOIS lados (ver `meta-event-name`): o pixel do
        // browser manda o nome na URL, e com espaço a Meta registra
        // "Lead%20qualificado" como um evento à parte do que a CAPI
        // envia — dois eventos distintos, sem deduplicação, nenhum
        // utilizável para otimizar campanha.
        qualifiedEventName: metaEventName(trackingCfg.qualified_lead.event_name),
        // Nunca `null`: com `action_source: "website"` a Meta exige a
        // URL de origem, e o cadastro embutido em iframe chega sem
        // referrer. Sem o fallback, justamente o formulário embutido
        // — o caso de uso principal — mandaria payload incompleto.
        eventSourceUrl:
          parsed.event_source_url ?? parsed.referrer ?? buildCrmFormUrl(slug),
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
        qualified_event_name: qualified
          ? metaEventName(trackingCfg.qualified_lead.event_name)
          : null,
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

/**
 * Os refs que o caminho da pessoa realmente pediu.
 *
 * `null` = não dá para saber (formulário sem versão publicada, schema
 * ilegível, migration atrasada) — e aí TODO obrigatório é exigido, que é
 * o comportamento histórico. Degradar para "não exige nada" abriria a
 * porta para submissão vazia; degradar para "exige tudo" no máximo repete
 * o que já acontecia.
 *
 * Reexecuta a MESMA engine do cliente: uma segunda régua no servidor
 * discordaria da tela, e a pessoa veria "campo obrigatório" de uma
 * pergunta que nunca apareceu para ela.
 */
async function lerDoSchema(
  admin: ReturnType<typeof createAdminClient>,
  form: { id: string; published_version_id?: string | null },
  answers: Record<string, unknown>,
  endingRef: string | null,
): Promise<{
  refs: Set<string> | null
  desqualificado: boolean
  schema: ReturnType<typeof normalizarSchema> | null
  /** O final que as RESPOSTAS alcançam; `null` quando não dá para saber. */
  finalCalculado: string | null
}> {
  const versionId = form.published_version_id
  if (!versionId) return { refs: null, desqualificado: false, schema: null, finalCalculado: null }
  try {
    const { data } = await admin
      .from("form_versions")
      .select("schema")
      .eq("id", versionId)
      .maybeSingle()
    if (!data?.schema) return { refs: null, desqualificado: false, schema: null, finalCalculado: null }
    const schema = normalizarSchema(data.schema)
    if (schema.blocks.length === 0) {
      return { refs: null, desqualificado: false, schema: null, finalCalculado: null }
    }

    // Quem decide se o final desqualifica é o SCHEMA PUBLICADO, não o
    // corpo do POST: o cliente aponta qual final alcançou, a régua é
    // nossa. Um `disqualified: true` inventado no corpo só rebaixaria o
    // próprio cadastro, mas confiar nele seria deixar o CRM depender do
    // que o browser diz.
    const ctxFinal = { answers: answers as Record<string, never>, hidden: {} }
    // O FINAL sai das respostas, não do corpo. Ele decide as tags, a
    // etapa no CRM, o `LeadQualificado` e se a agenda abre — deixá-lo
    // chegar pronto do browser é deixar quem responde escolher o próprio
    // veredicto. Quando a lógica não fecha num final (sem lógica,
    // resposta faltando, laço), fica `null` e quem chama mantém o do
    // cliente: trocar um palpite por outro não melhora nada.
    const finalCalculado = finalAlcancado(schema, ctxFinal)
    const finalValido = finalCalculado ?? endingRef

    const desqualificado = finalValido
      ? Boolean((schema.endings ?? []).find((e) => e.ref === finalValido)?.disqualified)
      : false

    // Sem lógica em bloco nenhum, o caminho é a lista inteira e não há o
    // que calcular — é o caso do formulário clássico.
    const temLogica = schema.blocks.some((b) => (b.logic ?? []).length > 0)
    if (!temLogica) return { refs: null, desqualificado, schema, finalCalculado }

    const ctx = ctxFinal
    const fim = ultimoAlcancavel(schema, ctx)
    if (!fim) return { refs: null, desqualificado, schema, finalCalculado }
    const { caminho } = caminhoAte(schema, fim, ctx)
    // O caminho vem em TELAS. Sem expandir, a 2ª pergunta em diante de um
    // grupo ficaria fora do conjunto e o `required` dela deixaria de ser
    // cobrado — dá para enviar sem o email que a tela exigia.
    return {
      refs: new Set(refsDoCaminho(schema, caminho)),
      desqualificado,
      schema,
      finalCalculado,
    }
  } catch {
    return { refs: null, desqualificado: false, schema: null, finalCalculado: null }
  }
}

/**
 * O que vai para `deals.custom_fields` além dos campos mapeados.
 *
 * O score é REGISTRO, não decisão — ele vem do browser, onde a engine
 * roda. Serve para o vendedor priorizar a fila; nada que valha dinheiro
 * olha para ele. Guardado como número quando é número, para o card
 * poder ordenar.
 */
function camposDoCard(
  mapeados: Record<string, unknown>,
  variables: Record<string, string | number> | null | undefined,
  desfecho: { destaque: { pergunta: string; resposta: string } | null },
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...mapeados }
  const score = variables?.score
  if (typeof score === "number" && Number.isFinite(score)) out.score = score
  if (desfecho.destaque) out.destaque = desfecho.destaque.resposta
  return out
}

/**
 * A primeira atividade do card.
 *
 * Ela é o que o vendedor lê antes de ligar, então carrega as três coisas
 * que mudam a abordagem: se o próprio formulário recusou a pessoa, o
 * score, e a frase que ela usou para dizer o que muda na vida dela.
 */
function textoDaAtividade(
  nomeDoForm: string,
  desqualificado: boolean,
  desfecho: { destaque: { pergunta: string; resposta: string } | null; tags: string[] },
  variables: Record<string, string | number> | null | undefined,
): string {
  const linhas: string[] = []
  linhas.push(
    desqualificado
      ? `Deal criado via formulario "${nomeDoForm}" — a resposta caiu no final que DESQUALIFICA, e a pessoa leu isso na tela. Nao e lead para abordar agora.`
      : `Deal criado automaticamente via formulario "${nomeDoForm}"`,
  )
  const score = variables?.score
  if (typeof score === "number" && Number.isFinite(score)) linhas.push(`Score: ${score}`)
  if (desfecho.tags.length > 0) linhas.push(`Tags: ${desfecho.tags.join(", ")}`)
  if (desfecho.destaque) {
    linhas.push(`${desfecho.destaque.pergunta} → ${desfecho.destaque.resposta}`)
  }
  return linhas.join("\n")
}
