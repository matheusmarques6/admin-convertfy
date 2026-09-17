/**
 * O abandono vira lead, negócio e uma linha na timeline que o vendedor
 * consegue ler antes de ligar.
 *
 * Roda no cron, nunca no autosave — ver `form-session.service.ts` para o
 * porquê (o vendedor liga; ligar para quem está na terceira pergunta é o
 * jeito mais rápido de perder a venda).
 *
 * ## A etapa é PRÓPRIA, e nasce sozinha
 *
 * Misturar abandono com quem enviou na mesma etapa desfaz o motivo de
 * existir da feature. A etapa é criada uma vez no pipeline do formulário
 * e o id fica em `crm_forms.settings.abandono_stage_id`. Criar
 * automaticamente é escolha: exigir configuração deixaria a feature
 * inerte e ninguém descobriria por quê.
 *
 * ## Idempotência
 *
 * `abandon_processed_at` é carimbado ANTES do trabalho pesado. Duas
 * execuções do cron em paralelo (a Vercel pode disparar de novo se a
 * anterior demorar) não podem criar dois negócios para a mesma pessoa —
 * e o custo do carimbo antecipado é perder UM abandono se o processo
 * morrer no meio, o que é melhor que duplicar no CRM do cliente.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import type { FormSchema } from "@/types/forms-conversational"
import { blocoDoAbandono } from "@/lib/forms/engine"
import {
  classificarAbandono,
  resumirAbandono,
  textoDaTimeline,
  tituloDoNegocio,
  type ClasseDeAbandono,
} from "@/lib/forms/abandono"
import { contatoDaSessao, type LinhaSessao } from "./form-session.service"
import { novoTokenDeRetomada } from "@/lib/forms/session-token"
import { resolveAutoOwner } from "./crm-assignment.service"
import { dispatchTrigger } from "./crm-trigger-dispatcher.service"

const log = logger.child("FormAbandono")

export const NOME_DA_ETAPA = "Formulário abandonado"

/** Dias que o link de retomada vale. Depois disso, o lead esfriou mesmo. */
const RETOMADA_DIAS = 7

export interface FormParaAbandono {
  id: string
  org_id: string
  name: string
  slug: string
  pipeline_id: string | null
  stage_id: string | null
  settings: Record<string, unknown> | null
  created_by: string | null
}

export interface ResultadoDoAbandono {
  classe: ClasseDeAbandono
  leadId: string | null
  dealId: string | null
  /** Por que não criou lead/negócio, quando não criou. */
  motivo?: string
}

export async function processarAbandono(
  admin: SupabaseClient,
  sessao: LinhaSessao & { last_activity_at?: string; current_field_ref: string | null },
  form: FormParaAbandono,
  schema: FormSchema,
  baseUrl: string,
): Promise<ResultadoDoAbandono> {
  const answers = sessao.answers ?? {}
  const contato = contatoDaSessao(schema, answers)
  const classe = classificarAbandono(schema, answers, contato)

  // Carimba ANTES: ver o cabeçalho. Falhar aqui aborta sem tentar o
  // resto — sem o carimbo, o retry duplicaria.
  const carimbo = new Date().toISOString()
  const { error: cErr } = await admin
    .from("form_sessions")
    .update({ abandon_processed_at: carimbo, status: "abandoned", abandoned_at: carimbo,
              abandoned_field_ref: sessao.current_field_ref })
    .eq("id", sessao.id)
    .is("abandon_processed_at", null)
  if (cErr) {
    log.warn("abandono.carimbo_falhou", { sessionId: sessao.id, code: cErr.code, message: cErr.message })
    return { classe, leadId: null, dealId: null, motivo: "carimbo_falhou" }
  }

  if (classe !== "com_contato") {
    // Sai da fila e vira número de funil. Não é erro: é a maioria.
    return { classe, leadId: null, dealId: null, motivo: classe }
  }

  // ── lead parcial ──
  const leadId = await garantirLead(admin, form, contato, sessao)
  if (!leadId) return { classe, leadId: null, dealId: null, motivo: "lead_falhou" }

  // ── link de retomada ──
  const { token, hash } = novoTokenDeRetomada()
  const expira = new Date(Date.now() + RETOMADA_DIAS * 86_400_000).toISOString()
  await admin
    .from("form_sessions")
    .update({ resume_token_hash: hash, resume_expires_at: expira, lead_id: leadId })
    .eq("id", sessao.id)
  const link = `${baseUrl.replace(/\/$/, "")}/forms/${encodeURIComponent(form.slug)}?retomar=${token}`

  // ── negócio na etapa própria ──
  let dealId: string | null = null
  if (form.pipeline_id) {
    const stageId = await garantirEtapaDeAbandono(admin, form)
    if (stageId) {
      dealId = await criarNegocio(admin, form, stageId, leadId, contato, sessao)
    }
  }

  // ── a linha da timeline ──
  const parado = blocoDoAbandono(schema, { answers, hidden: sessao.hidden ?? {} }, sessao.current_field_ref)
  const resumo = resumirAbandono(schema, answers, parado)
  const texto = textoDaTimeline(resumo, form, {
    quandoParou: formatarQuando(sessao.last_activity_at),
    linkDeRetomada: link,
  })

  if (dealId) {
    const { error } = await admin.from("crm_deal_activities").insert({
      deal_id: dealId,
      type: "system",
      content: texto,
      created_by: form.created_by,
    })
    if (error) log.warn("abandono.timeline_falhou", { dealId, code: error.code, message: error.message })
  } else {
    // Sem negócio (formulário sem pipeline), a informação vai para a nota
    // do lead — perdê-la deixaria o contato sem nada que explique de onde
    // veio, e ele seria descartado como lixo.
    await anexarNota(admin, leadId, texto)
  }

  // Gatilho de automação. Fire-and-forget é aceitável AQUI: quem chama é
  // o cron, e o registro que importa (lead, negócio, timeline) já está
  // gravado — só o disparo é best-effort.
  dispatchTrigger({
    trigger_type: "lead_created",
    org_id: form.org_id,
    trigger_data: {
      lead_id: leadId,
      deal_id: dealId,
      source: "form_abandono",
      form_slug: form.slug,
      parou_em: resumo.parouEm,
      respondidas: resumo.respondidas,
      total: resumo.total,
    },
    context: {
      trigger_type: "lead_created",
      trigger_data: { lead_id: leadId },
      lead: { id: leadId, ...contato },
      org_id: form.org_id,
    },
    idempotency_key: `form_abandono:${sessao.id}`,
  }).catch((e) => log.warn("abandono.trigger_falhou", { sessionId: sessao.id, message: String(e) }))

  return { classe, leadId, dealId }
}

// ────────────────────────────── pedaços ─────────────────────────────────

/**
 * Lead novo, ou o que já existe com o mesmo email na mesma org.
 *
 * Deduplicar é obrigatório: a mesma pessoa pode abandonar duas vezes, e o
 * submit dela (se um dia vier) precisa cair no MESMO lead. O email é a
 * chave porque é o que o submit já usa.
 */
async function garantirLead(
  admin: SupabaseClient,
  form: FormParaAbandono,
  contato: { name: string | null; email: string | null; phone: string | null },
  sessao: LinhaSessao,
): Promise<string | null> {
  if (contato.email) {
    const { data } = await admin
      .from("crm_leads")
      .select("id")
      .eq("org_id", form.org_id)
      .ilike("email", contato.email)
      .limit(1)
      .maybeSingle()
    if (data?.id) return data.id as string
  }

  const payload: Record<string, unknown> = {
    // Sem `org_id` o lead existe no banco e some de toda listagem que
    // filtra por org — a mesma armadilha que o submit documenta.
    org_id: form.org_id,
    name: contato.name || contato.email || contato.phone || "Sem nome",
    email: contato.email,
    phone: contato.phone,
    // "new" é o status de quem entrou agora. O que o distingue de quem
    // enviou é o `source` e a etapa do negócio, não um status inventado:
    // `lead_status` é um enum do banco e um valor novo seria 22P02.
    status: "new",
    source: `form_abandono:${form.slug}`,
    created_by: form.created_by,
    // UTM é JSONB nesta tabela, não colunas soltas — medido no schema.
    utm: utmDaSessao(sessao),
    custom_fields: {},
  }

  const { data, error } = await admin.from("crm_leads").insert(payload).select("id").single()
  if (!error) return data.id as string

  // FK de `created_by` apontando para perfil que não existe mais (o dono
  // do formulário saiu da empresa) não pode custar o lead — é o mesmo
  // fallback do submit.
  if (error.code === "23503") {
    payload.created_by = null
    const retry = await admin.from("crm_leads").insert(payload).select("id").single()
    if (retry.data?.id) return retry.data.id as string
  }
  log.warn("abandono.lead_falhou", { code: error.code, message: error.message })
  return null
}

/** UTM da sessão no formato JSONB que `crm_leads` e `deals` usam. */
function utmDaSessao(sessao: LinhaSessao): Record<string, string> {
  const s = sessao as unknown as Record<string, string | null | undefined>
  const out: Record<string, string> = {}
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
    const v = s[k]
    if (typeof v === "string" && v) out[k] = v
  }
  return out
}

/** A etapa própria: acha, ou cria uma vez e guarda o id no formulário. */
async function garantirEtapaDeAbandono(
  admin: SupabaseClient,
  form: FormParaAbandono,
): Promise<string | null> {
  const salva = (form.settings as { abandono_stage_id?: string } | null)?.abandono_stage_id
  if (salva) {
    const { data } = await admin.from("pipeline_stages").select("id").eq("id", salva).maybeSingle()
    if (data?.id) return data.id as string
  }
  if (!form.pipeline_id) return null

  const { data: existente } = await admin
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", form.pipeline_id)
    .ilike("name", NOME_DA_ETAPA)
    .limit(1)
    .maybeSingle()

  let stageId = (existente?.id as string | undefined) ?? null

  if (!stageId) {
    const { data: ultima } = await admin
      .from("pipeline_stages")
      .select("order")
      .eq("pipeline_id", form.pipeline_id)
      .order("order", { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: nova, error } = await admin
      .from("pipeline_stages")
      .insert({
        pipeline_id: form.pipeline_id,
        name: NOME_DA_ETAPA,
        // Âmbar: não é ganho nem perdido, é alguém para recuperar.
        color: "#F59E0B",
        order: ((ultima?.order as number | undefined) ?? 0) + 1,
        stage_type: "open",
        description: "Começou o formulário, deixou contato e não terminou.",
      })
      .select("id")
      .single()
    if (error) {
      log.warn("abandono.etapa_falhou", { code: error.code, message: error.message })
      return null
    }
    stageId = nova.id as string
  }

  await admin
    .from("crm_forms")
    .update({ settings: { ...(form.settings ?? {}), abandono_stage_id: stageId } })
    .eq("id", form.id)

  return stageId
}

async function criarNegocio(
  admin: SupabaseClient,
  form: FormParaAbandono,
  stageId: string,
  leadId: string,
  contato: { name: string | null; email: string | null; phone: string | null },
  sessao: LinhaSessao,
): Promise<string | null> {
  // Um negócio por sessão: o cron pode reprocessar se o carimbo falhar
  // entre a escrita e o insert, e negócio duplicado é o que o time vê.
  const { data: jaTem } = await admin
    .from("deals")
    .select("id")
    .eq("lead_id", leadId)
    .eq("stage_id", stageId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle()
  if (jaTem?.id) return jaTem.id as string

  const { data: maxPos } = await admin
    .from("deals")
    .select("position")
    .eq("stage_id", stageId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()

  const owner = form.pipeline_id
    ? await resolveAutoOwner(admin, form.pipeline_id, form.org_id)
    : null

  const { data, error } = await admin
    .from("deals")
    .insert({
      pipeline_id: form.pipeline_id,
      stage_id: stageId,
      title: tituloDoNegocio(contato, form),
      value: 0,
      currency: "BRL",
      // 20%, não 50%: quem não terminou o formulário está mais longe de
      // fechar que quem terminou, e a previsão do funil lê isto.
      probability: 20,
      status: "open",
      source: "form_abandono",
      lead_id: leadId,
      owner_id: owner ?? form.created_by,
      position: ((maxPos?.position as number | undefined) ?? 0) + 10,
      utm: utmDaSessao(sessao),
    })
    .select("id")
    .single()

  if (error) {
    log.warn("abandono.negocio_falhou", { code: error.code, message: error.message })
    return null
  }
  return data.id as string
}

async function anexarNota(admin: SupabaseClient, leadId: string, texto: string): Promise<void> {
  const { data } = await admin.from("crm_leads").select("notes").eq("id", leadId).maybeSingle()
  const atual = (data?.notes as string | null) ?? ""
  const novo = atual ? `${atual}\n\n---\n${texto}` : texto
  const { error } = await admin.from("crm_leads").update({ notes: novo }).eq("id", leadId)
  if (error) log.warn("abandono.nota_falhou", { leadId, code: error.code, message: error.message })
}

function formatarQuando(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(d)
}
